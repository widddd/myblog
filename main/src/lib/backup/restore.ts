import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import {
  openBackupPackage,
  type OpenBackupOptions,
} from "@/lib/backup/container";
import { assertBackupKeyMatches } from "@/lib/backup/crypto";
import {
  BackupError,
  isNodeBusyError,
  isNodeNotFoundError,
} from "@/lib/backup/errors";
import {
  backupPackageExists,
  ensureBackupDir,
  getBackupFilePath,
  moveBackupFile,
  resolveBackupPath,
} from "@/lib/backup/files";
import { importBackupFileName, isManagedBackupFileName } from "@/lib/backup/filename";
import { readKeyHashFromDatabase } from "@/lib/backup/secrets-read";
import { inspectBackupPackage } from "@/lib/backup/inspect";
import { upsertBackupManifest } from "@/lib/backup/manifests";
import { extractBackupArchive, listTarGzEntryNames } from "@/lib/backup/tar";
import { resolveDatabasePath } from "@/lib/db-path";
import { getDriver, type StorageDriver } from "@/lib/storage";
import { logger } from "@/lib/utils/logger";

export type PendingRestore = {
  name: string;
  requestedAt: string;
  restartAt: string | null;
};

export type RestoreOptions = {
  databasePath?: string;
  storage?: StorageDriver;
  skipUploads?: boolean;
  skipSafetySnapshot?: boolean;
  expectedKeyHash?: string;
  requireKeyHash?: boolean;
  passphrase?: string;
  hostSecretPath?: string;
};

export type RestoreResult = {
  name: string;
  databasePath: string;
  restoredUploads: number;
  removedUploads: number;
};

function pendingRestorePath(databasePath = resolveDatabasePath()): string {
  return path.join(path.dirname(databasePath), "restore-pending.json");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const metadata = await stat(filePath);
    return metadata.isFile();
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

export async function readPendingRestore(
  databasePath = resolveDatabasePath(),
): Promise<PendingRestore | null> {
  const filePath = pendingRestorePath(databasePath);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PendingRestore>;
    if (!parsed.name || !isManagedBackupFileName(parsed.name) || !parsed.requestedAt) {
      throw new BackupError("INVALID_PENDING", "预约恢复文件损坏，已忽略", 400);
    }
    return {
      name: parsed.name,
      requestedAt: parsed.requestedAt,
      restartAt: parseRestartAt(parsed.restartAt),
    };
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return null;
    }
    if (error instanceof BackupError) {
      await unlink(filePath).catch(() => undefined);
      logger.warn(error.message);
      return null;
    }
    if (error instanceof SyntaxError) {
      await unlink(filePath).catch(() => undefined);
      logger.warn("预约恢复文件不是合法 JSON，已删除");
      return null;
    }
    throw error;
  }
}

export async function requestPendingRestore(
  name: string,
  databasePath = resolveDatabasePath(),
): Promise<PendingRestore> {
  if (!isManagedBackupFileName(name)) {
    throw new BackupError("VALIDATION_ERROR", "备份文件名不合法", 400);
  }
  if (!(await backupPackageExists(name))) {
    throw new BackupError("NOT_FOUND", "备份不存在", 404);
  }

  const pending: PendingRestore = {
    name,
    requestedAt: new Date().toISOString(),
    restartAt: null,
  };
  await writePendingRestore(pending, databasePath);
  logger.info("已预约恢复备份，站点可继续使用", { name });
  return pending;
}

function parseRestartAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  if (Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

export function isPendingRestoreDue(
  pending: PendingRestore | null,
  now = Date.now(),
): boolean {
  if (!pending?.restartAt) {
    return false;
  }
  const at = Date.parse(pending.restartAt);
  return !Number.isNaN(at) && at <= now;
}

async function writePendingRestore(
  pending: PendingRestore,
  databasePath = resolveDatabasePath(),
): Promise<void> {
  const filePath = pendingRestorePath(databasePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(pending, null, 2)}\n`, "utf8");
}

export async function updatePendingRestart(
  input: { restartNow: true } | { restartAt: string },
  databasePath = resolveDatabasePath(),
): Promise<PendingRestore> {
  const current = await readPendingRestore(databasePath);
  if (!current) {
    throw new BackupError("NOT_FOUND", "当前没有预约恢复", 404);
  }
  const restartAt =
    "restartNow" in input ? new Date().toISOString() : input.restartAt;
  if (!parseRestartAt(restartAt)) {
    throw new BackupError("VALIDATION_ERROR", "重启时间不合法", 400);
  }
  if (!("restartNow" in input) && Date.parse(restartAt) <= Date.now()) {
    throw new BackupError("VALIDATION_ERROR", "预约重启时间必须晚于现在", 400);
  }
  const pending: PendingRestore = { ...current, restartAt };
  await writePendingRestore(pending, databasePath);
  logger.info(
    "restartNow" in input ? "已选择立刻重启并恢复" : "已设定预约重启时间",
    { name: pending.name, restartAt },
  );
  return pending;
}

export type ImportedBackupFormat = "plain" | "v1" | "v2";

export type ImportedBackup = {
  name: string;
  format: ImportedBackupFormat;
  encrypted: boolean;
  releaseLabel: string;
};

export async function stageImportedBackup(
  sourcePath: string,
  options: OpenBackupOptions = {},
): Promise<ImportedBackup> {
  const workDir = path.join(os.tmpdir(), `myblog-import-peek-${randomUUID()}`);
  try {
    let opened;
    try {
      opened = await openBackupPackage(sourcePath, workDir, options);
    } catch (error) {
      if (error instanceof BackupError && error.code === "DECRYPT_FAILED") {
        throw new BackupError(
          "DECRYPT_FAILED",
          "本机半钥无法解开这份加密包。请确认包来自本机，或停服后使用 pnpm restore --passphrase",
          400,
        );
      }
      throw error;
    }
    if (opened.kind === "encrypted") {
      const names = await listTarGzEntryNames(opened.innerArchivePath);
      if (!names.includes("blog.db")) {
        throw new BackupError("INVALID_ARCHIVE", "加密备份内层缺少 blog.db", 400);
      }
    }
    await ensureBackupDir();
    const name = importBackupFileName(randomBytes(4).toString("hex"));
    await moveBackupFile(sourcePath, resolveBackupPath(name));
    const view = await inspectBackupPackage(
      resolveBackupPath(name),
      path.join(workDir, "manifest"),
    );
    await upsertBackupManifest(name, view);
    return {
      name,
      format: opened.kind === "legacy" ? "plain" : opened.format,
      encrypted: view.encrypted,
      releaseLabel: view.releaseLabel,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function cancelPendingRestore(
  databasePath = resolveDatabasePath(),
): Promise<void> {
  const filePath = pendingRestorePath(databasePath);
  try {
    await unlink(filePath);
    logger.info("已取消预约恢复");
  } catch (error) {
    if (!isNodeNotFoundError(error)) {
      throw error;
    }
  }
}

async function snapshotCurrentDatabase(
  sourcePath: string,
  destination: string,
): Promise<void> {
  const handle = new Database(sourcePath);
  try {
    handle.pragma("busy_timeout = 5000");
    await handle.backup(destination);
  } finally {
    handle.close();
  }
}

export async function applyDatabaseSnapshot(
  snapshotPath: string,
  databasePath: string,
): Promise<void> {
  await mkdir(path.dirname(databasePath), { recursive: true });
  const tempPath = `${databasePath}.restore-tmp`;
  await copyFile(snapshotPath, tempPath);

  try {
    await copyFile(tempPath, databasePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    if (isNodeBusyError(error)) {
      throw new BackupError(
        "DB_BUSY",
        "数据库文件正被占用，请先停止应用再恢复",
        409,
      );
    }
    throw error;
  }

  await unlink(tempPath).catch(() => undefined);
  await unlink(`${databasePath}-wal`).catch(() => undefined);
  await unlink(`${databasePath}-shm`).catch(() => undefined);
}

async function restoreUploads(
  extractedUploadDir: string,
  uploadKeys: string[],
  driver: StorageDriver,
): Promise<{ restored: number; removed: number }> {
  const incoming = new Set(uploadKeys);
  const existing = await driver.listKeys();
  let removed = 0;
  for (const key of existing) {
    if (!incoming.has(key)) {
      await driver.delete(key);
      removed += 1;
    }
  }

  let restored = 0;
  for (const key of uploadKeys) {
    const filePath = path.join(extractedUploadDir, ...key.split("/"));
    const data = await readFile(filePath);
    await driver.delete(key);
    await driver.put(key, data);
    restored += 1;
  }
  return { restored, removed };
}

export async function restoreFromBackup(
  name: string,
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  if (!isManagedBackupFileName(name)) {
    throw new BackupError("VALIDATION_ERROR", "备份文件名不合法", 400);
  }

  const archivePath = getBackupFilePath(name);
  if (!(await fileExists(archivePath))) {
    throw new BackupError("NOT_FOUND", "备份不存在", 404);
  }

  const databasePath = options.databasePath ?? resolveDatabasePath();
  const workDir = path.join(os.tmpdir(), `myblog-restore-${randomUUID()}`);

  try {
    const opened = await openBackupPackage(archivePath, workDir, {
      passphrase: options.passphrase,
      hostSecretPath: options.hostSecretPath,
    });
    if (opened.kind === "encrypted") {
      if (options.expectedKeyHash) {
        assertBackupKeyMatches(opened.key, options.expectedKeyHash);
      } else if (options.requireKeyHash) {
        throw new BackupError(
          "KEY_MISMATCH",
          "后台没有这份备份的密钥记录，已拒绝恢复",
          403,
        );
      } else {
        const stored = readKeyHashFromDatabase(databasePath, name);
        if (stored) {
          assertBackupKeyMatches(opened.key, stored);
        } else {
          logger.warn("后台没有密钥哈希，仅用合成后的数据密钥解密", { name });
        }
      }
    }

    const extracted = await extractBackupArchive(opened.innerArchivePath, workDir);

    if (!options.skipSafetySnapshot && (await fileExists(databasePath))) {
      const safetyPath = `${databasePath}.before-restore`;
      try {
        await snapshotCurrentDatabase(databasePath, safetyPath);
      } catch (error) {
        logger.warn("恢复前安全快照失败，继续覆盖", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await applyDatabaseSnapshot(extracted.databasePath, databasePath);

    let restoredUploads = 0;
    let removedUploads = 0;
    if (!options.skipUploads) {
      const applied = await restoreUploads(
        extracted.uploadDir,
        extracted.uploadKeys,
        options.storage ?? getDriver("local"),
      );
      restoredUploads = applied.restored;
      removedUploads = applied.removed;
    }

    logger.info("备份已恢复", {
      name,
      restoredUploads,
      removedUploads,
    });
    return {
      name,
      databasePath,
      restoredUploads,
      removedUploads,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function applyPendingRestore(
  databasePath = resolveDatabasePath(),
): Promise<RestoreResult | null> {
  const pending = await readPendingRestore(databasePath);
  if (!pending) {
    return null;
  }
  if (!isPendingRestoreDue(pending)) {
    logger.info("预约恢复尚未到重启时间，本次启动不覆盖", {
      name: pending.name,
      restartAt: pending.restartAt,
    });
    return null;
  }

  logger.info("正在执行预约恢复", { name: pending.name, restartAt: pending.restartAt });
  try {
    const result = await restoreFromBackup(pending.name, { databasePath });
    await cancelPendingRestore(databasePath);
    return result;
  } catch (error) {
    logger.error("预约恢复失败，下次启动会再试", {
      name: pending.name,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export { pendingRestorePath };
