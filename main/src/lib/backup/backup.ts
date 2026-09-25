import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import { TarArchive } from "archiver";

import { AdminHttpError } from "@/lib/admin/http";
import {
  hasPendingDataClear,
  isDataClearRunning,
} from "@/lib/admin/data-clear";
import { BackupError } from "@/lib/backup/errors";
import {
  BACKUP_DIR,
  backupPackageExists,
  deleteBackupFile,
  ensureBackupDir,
  getBackupFilePath,
  listBackups,
  resolveBackupPath,
  type BackupFileInfo,
} from "@/lib/backup/files";
import { packEncryptedContainer } from "@/lib/backup/container";
import { encryptBackupFile, generateBackupKey } from "@/lib/backup/crypto";
import { resolveBackupEncrypt } from "@/lib/backup/encrypt-policy";
import { backupFileName, isImportBackupFileName, isManagedBackupFileName } from "@/lib/backup/filename";
import {
  inspectBackupPackage,
  manifestFromStored,
  type BackupManifestView,
} from "@/lib/backup/inspect";
import {
  deleteBackupManifest,
  readBackupManifest,
  upsertBackupManifest,
} from "@/lib/backup/manifests";
import {
  deriveHostHalf,
  toBackupMetaV2,
  xorHalves,
} from "@/lib/backup/host-secret";
import { readPendingRestore } from "@/lib/backup/restore";
import { deleteBackupKeyHash, listBackupKeyHashes, saveBackupKeyHash } from "@/lib/backup/secrets";
import { getSqliteHandle } from "@/lib/db";
import { currentBackupRelease } from "@/lib/release";
import { getSetting, setSetting } from "@/lib/settings";
import { getDriver, loadCosSettings } from "@/lib/storage";
import { logger } from "@/lib/utils/logger";

export type BackupRecord = BackupFileInfo &
  BackupManifestView & {
    local: boolean;
    cos: boolean;
  };

export type { BackupFileInfo };
export { BACKUP_DIR, getBackupFilePath, listBackups };

const COS_BACKUP_PREFIX = "backups/";

const globalForBackup = globalThis as typeof globalThis & {
  myblogBackupRunning?: boolean;
};

export function isBackupRunning(): boolean {
  return Boolean(globalForBackup.myblogBackupRunning);
}

function cosBackupKey(name: string) {
  return `${COS_BACKUP_PREFIX}${name}`;
}

async function deleteCosBackup(name: string) {
  const config = await loadCosSettings();
  if (!config) {
    return;
  }
  await getDriver("cos").delete(cosBackupKey(name)).catch(() => undefined);
}

async function deleteLocalBackupOnly(name: string) {
  if (await backupPackageExists(name)) {
    await deleteBackupFile(name);
  }
}

export async function deleteBackup(name: string): Promise<void> {
  const pending = await readPendingRestore();
  if (pending?.name === name) {
    throw new BackupError(
      "RESTORE_PENDING",
      "已预约恢复此备份，请先取消预约再删除",
      409,
    );
  }
  if (await backupPackageExists(name)) {
    await deleteBackupFile(name);
  }
  await deleteCosBackup(name);
  await deleteBackupKeyHash(name);
  await deleteBackupManifest(name);
}

async function listCosBackupNames(): Promise<Set<string>> {
  const config = await loadCosSettings();
  const names = new Set<string>();
  if (!config) {
    return names;
  }
  try {
    const keys = await getDriver("cos").listKeys(COS_BACKUP_PREFIX);
    for (const key of keys) {
      const name = key.startsWith(COS_BACKUP_PREFIX)
        ? key.slice(COS_BACKUP_PREFIX.length)
        : key;
      if (isManagedBackupFileName(name)) {
        names.add(name);
      }
    }
  } catch (error) {
    logger.error("列出 COS 备份失败", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return names;
}

export async function replicateBackupToCos(name: string, filePath: string): Promise<boolean> {
  const cos = await loadCosSettings();
  if (!cos) {
    return false;
  }
  try {
    await getDriver("cos").putFile(cosBackupKey(name), filePath);
    return true;
  } catch (error) {
    logger.error("备份上传 COS 失败", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function listBackupRecords(): Promise<BackupRecord[]> {
  const peekDir = path.join(os.tmpdir(), `myblog-backup-peek-${randomUUID()}`);
  try {
    await mkdir(peekDir, { recursive: true });
    const [localFiles, cosNames, hashes] = await Promise.all([
      listBackups(),
      listCosBackupNames(),
      listBackupKeyHashes(),
    ]);
    const localMap = new Map(localFiles.map((file) => [file.name, file]));
    const names = new Set([...localMap.keys(), ...cosNames]);
    const records: BackupRecord[] = [];

    for (const name of names) {
      const local = localMap.get(name);
      const encryptedFallback = hashes.has(name);
      let manifest: BackupManifestView;
      if (local) {
        try {
          manifest = await inspectBackupPackage(
            resolveBackupPath(name),
            path.join(peekDir, name.replace(/[^\w.-]+/g, "_")),
          );
        } catch {
          manifest = manifestFromStored(
            await readBackupManifest(name),
            encryptedFallback,
          );
        }
      } else {
        manifest = manifestFromStored(
          await readBackupManifest(name),
          encryptedFallback,
        );
      }

      if (local) {
        records.push({
          ...local,
          ...manifest,
          local: true,
          cos: cosNames.has(name),
        });
        continue;
      }

      let size = 0;
      let createdAt = new Date().toISOString();
      try {
        const metadata = await getDriver("cos").stat(cosBackupKey(name));
        if (metadata) {
          size = metadata.size;
          createdAt = metadata.lastModified.toISOString();
        }
      } catch {
        // keep defaults
      }
      records.push({
        name,
        size,
        createdAt,
        ...manifest,
        local: false,
        cos: true,
      });
    }

    return records.sort((left, right) => right.name.localeCompare(left.name));
  } finally {
    await rm(peekDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function pullBackupFromCos(name: string): Promise<BackupFileInfo> {
  if (!isManagedBackupFileName(name)) {
    throw new BackupError("VALIDATION_ERROR", "备份文件名不合法", 400);
  }
  await ensureBackupDir();
  const dest = resolveBackupPath(name);
  if (await backupPackageExists(name)) {
    const metadata = await stat(dest);
    return {
      name,
      size: metadata.size,
      createdAt: metadata.mtime.toISOString(),
    };
  }
  const config = await loadCosSettings();
  if (!config) {
    throw new BackupError("COS_NOT_CONFIGURED", "腾讯云 COS 尚未配置", 503);
  }
  await getDriver("cos").getToFile(cosBackupKey(name), dest);
  const metadata = await stat(dest);
  logger.info("已从 COS 拉回备份", { name, size: metadata.size });
  const peekDir = path.join(os.tmpdir(), `myblog-backup-pull-${randomUUID()}`);
  try {
    const view = await inspectBackupPackage(dest, peekDir);
    await upsertBackupManifest(name, view);
  } catch (error) {
    logger.warn("拉回备份后无法读取版本信息", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await rm(peekDir, { recursive: true, force: true }).catch(() => undefined);
  }
  return {
    name,
    size: metadata.size,
    createdAt: metadata.mtime.toISOString(),
  };
}

export async function ensureLocalBackup(name: string): Promise<string> {
  if (!(await backupPackageExists(name))) {
    await pullBackupFromCos(name);
  }
  return getBackupFilePath(name);
}

async function pruneLocalBackups(): Promise<void> {
  const keep = Number(await getSetting<number>("backupKeep")) || 5;
  const maxMb = Number(await getSetting<number>("backupLocalMaxMB")) || 512;
  const maxBytes = Math.max(64, maxMb) * 1024 * 1024;
  const pending = await readPendingRestore();

  const byCount = await listBackups();
  const prunable = byCount.filter((file) => !isImportBackupFileName(file.name));
  for (const extra of prunable.slice(Math.max(1, keep))) {
    if (pending?.name === extra.name) {
      continue;
    }
    try {
      await deleteLocalBackupOnly(extra.name);
    } catch (error) {
      logger.error("按份数清理本地备份失败", {
        name: extra.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let remainingCreated = (await listBackups()).filter(
    (file) => !isImportBackupFileName(file.name),
  );
  const allAfterCount = await listBackups();
  let total = allAfterCount.reduce((sum, file) => sum + file.size, 0);
  const oldestFirst = [...remainingCreated].reverse();
  for (const file of oldestFirst) {
    if (total <= maxBytes || remainingCreated.length <= 1) {
      break;
    }
    if (pending?.name === file.name) {
      continue;
    }
    try {
      await deleteLocalBackupOnly(file.name);
      total -= file.size;
      remainingCreated = remainingCreated.filter((item) => item.name !== file.name);
    } catch (error) {
      logger.error("按体积清理本地备份失败", {
        name: file.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function snapshotDatabase(destination: string): Promise<void> {
  const handle = getSqliteHandle();
  try {
    await handle.backup(destination);
  } finally {
    handle.close();
  }
}

async function packArchive(
  archivePath: string,
  snapshotPath: string,
  options: { meta?: Record<string, unknown> } = {},
): Promise<void> {
  const output = createWriteStream(archivePath);
  const archive = new TarArchive({
    gzip: true,
    gzipOptions: { level: 6 },
  });

  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);
  if (options.meta) {
    archive.append(`${JSON.stringify(options.meta)}\n`, { name: "meta.json" });
  }
  archive.file(snapshotPath, { name: "blog.db" });

  const driver = getDriver("local");
  if (driver.name !== "local") {
    throw new BackupError(
      "COS_FORBIDDEN",
      "备份打包只能读取本地上传文件，禁止走 COS",
      500,
    );
  }
  const keys = await driver.listKeys();
  for (const key of keys) {
    archive.append(driver.openReadStream(key), { name: `uploads/${key}` });
  }

  await archive.finalize();
  await done;
}

export type BackupRunResult = BackupRecord & {
  cosUploaded: boolean;
};

export async function runBackup(passphrase?: string): Promise<BackupRunResult> {
  if (isDataClearRunning() || hasPendingDataClear("data")) {
    throw new AdminHttpError(
      "DATA_CLEAR_BUSY",
      "数据清理确认或执行正在进行，请先取消清理后再备份",
      409,
    );
  }
  if (globalForBackup.myblogBackupRunning) {
    throw new AdminHttpError("BACKUP_BUSY", "已有备份任务在进行", 409);
  }

  globalForBackup.myblogBackupRunning = true;
  const workDir = path.join(os.tmpdir(), `myblog-backup-${randomUUID()}`);
  const stagingName = `.tmp-${randomUUID()}.tar.gz`;
  const stagingPath = path.join(BACKUP_DIR, stagingName);
  const release = currentBackupRelease();

  try {
    const policy = await resolveBackupEncrypt();
    const encrypt = policy.enabled;
    if (encrypt && !passphrase) {
      throw new AdminHttpError("VALIDATION_ERROR", "加密备份必须输入口令", 400);
    }
    await ensureBackupDir();
    await mkdir(workDir, { recursive: true });

    const snapshotPath = path.join(workDir, "blog.db");
    await snapshotDatabase(snapshotPath);

    const name = backupFileName();
    if (encrypt) {
      const innerPath = path.join(workDir, "inner.tar.gz");
      const payloadPath = path.join(workDir, "payload.enc");
      await packArchive(innerPath, snapshotPath);
      const packageHalf = generateBackupKey();
      const metaSalt = randomBytes(16);
      const hostHalf = await deriveHostHalf(passphrase!, metaSalt);
      const dek = xorHalves(hostHalf, packageHalf);
      await encryptBackupFile(innerPath, payloadPath, dek);
      await packEncryptedContainer(stagingPath, payloadPath, packageHalf, {
        ...toBackupMetaV2({ salt: metaSalt, n: 16384, r: 8, p: 1 }),
        channel: release.channel ?? undefined,
        version: release.version,
      });
      const finalPath = resolveBackupPath(name);
      await rename(stagingPath, finalPath);
      try {
        await saveBackupKeyHash(name, dek);
      } catch (error) {
        await unlink(finalPath).catch(() => undefined);
        throw error;
      }
    } else {
      await packArchive(stagingPath, snapshotPath, {
        meta: {
          kind: "plain",
          channel: release.channel,
          version: release.version,
          createdAt: new Date().toISOString(),
        },
      });
      const finalPath = resolveBackupPath(name);
      await rename(stagingPath, finalPath);
    }

    const finalPath = resolveBackupPath(name);
    await upsertBackupManifest(name, {
      encrypted: encrypt,
      format: encrypt ? "v2" : "plain",
      channel: release.channel,
      version: release.version,
    });

    const finishedAt = new Date().toISOString();
    await setSetting("lastBackupAt", finishedAt);

    const cosUploaded = await replicateBackupToCos(name, finalPath);
    await pruneLocalBackups();

    const metadata = await stat(finalPath);
    logger.info("备份已完成", {
      name,
      size: metadata.size,
      encrypted: encrypt,
      cosUploaded,
    });
    return {
      name,
      size: metadata.size,
      createdAt: metadata.mtime.toISOString(),
      encrypted: encrypt,
      format: encrypt ? "v2" : "plain",
      channel: release.channel,
      version: release.version,
      releaseLabel: release.label,
      local: true,
      cos: cosUploaded,
      cosUploaded,
    };
  } catch (error) {
    await unlink(stagingPath).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    globalForBackup.myblogBackupRunning = false;
  }
}
