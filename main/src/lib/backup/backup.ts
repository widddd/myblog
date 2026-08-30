import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { TarArchive } from "archiver";

import { AdminHttpError } from "@/lib/admin/http";
import { backupFileName, isBackupFileName } from "@/lib/backup/filename";
import { getSqliteHandle } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";
import { getDriver } from "@/lib/storage";
import { logger } from "@/lib/utils/logger";

export type BackupFileInfo = {
  name: string;
  size: number;
  createdAt: string;
};

const globalForBackup = globalThis as typeof globalThis & {
  myblogBackupRunning?: boolean;
};

export const BACKUP_DIR = path.resolve(process.cwd(), "data", "backups");

function backupsRootPrefix(): string {
  return `${BACKUP_DIR}${path.sep}`;
}

function resolveBackupPath(name: string): string {
  if (!isBackupFileName(name)) {
    throw new AdminHttpError("VALIDATION_ERROR", "备份文件名不合法", 400);
  }
  const resolved = path.resolve(BACKUP_DIR, name);
  const comparableResolved =
    process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const comparableRoot =
    process.platform === "win32"
      ? backupsRootPrefix().toLowerCase()
      : backupsRootPrefix();
  if (!comparableResolved.startsWith(comparableRoot)) {
    throw new AdminHttpError("VALIDATION_ERROR", "备份路径不合法", 400);
  }
  return resolved;
}

async function ensureBackupDir(): Promise<void> {
  await mkdir(BACKUP_DIR, { recursive: true });
}

export function isBackupRunning(): boolean {
  return Boolean(globalForBackup.myblogBackupRunning);
}

export async function listBackups(): Promise<BackupFileInfo[]> {
  await ensureBackupDir();
  const entries = await readdir(BACKUP_DIR, { withFileTypes: true });
  const files: BackupFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !isBackupFileName(entry.name)) {
      continue;
    }
    const filePath = resolveBackupPath(entry.name);
    const metadata = await stat(filePath);
    files.push({
      name: entry.name,
      size: metadata.size,
      createdAt: metadata.mtime.toISOString(),
    });
  }

  return files.sort((left, right) => right.name.localeCompare(left.name));
}

export async function deleteBackup(name: string): Promise<void> {
  const filePath = resolveBackupPath(name);
  try {
    await unlink(filePath);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new AdminHttpError("NOT_FOUND", "备份不存在", 404);
    }
    throw error;
  }
}

export function getBackupFilePath(name: string): string {
  return resolveBackupPath(name);
}

async function pruneOldBackups(keep: number): Promise<void> {
  const files = await listBackups();
  for (const extra of files.slice(Math.max(1, keep))) {
    try {
      await deleteBackup(extra.name);
    } catch (error) {
      logger.error("滚动清理备份失败", {
        name: extra.name,
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
  archive.file(snapshotPath, { name: "blog.db" });

  const driver = getDriver("local");
  const keys = await driver.listKeys();
  for (const key of keys) {
    archive.append(driver.openReadStream(key), { name: `uploads/${key}` });
  }

  await archive.finalize();
  await done;
}

export async function runBackup(): Promise<BackupFileInfo> {
  if (globalForBackup.myblogBackupRunning) {
    throw new AdminHttpError("BACKUP_BUSY", "已有备份任务在进行", 409);
  }

  globalForBackup.myblogBackupRunning = true;
  const workDir = path.join(os.tmpdir(), `myblog-backup-${randomUUID()}`);
  const stagingName = `.tmp-${randomUUID()}.tar.gz`;
  const stagingPath = path.join(BACKUP_DIR, stagingName);

  try {
    await ensureBackupDir();
    await mkdir(workDir, { recursive: true });

    const snapshotPath = path.join(workDir, "blog.db");
    await snapshotDatabase(snapshotPath);

    const name = backupFileName();
    await packArchive(stagingPath, snapshotPath);
    const finalPath = resolveBackupPath(name);
    await rename(stagingPath, finalPath);

    const finishedAt = new Date().toISOString();
    await setSetting("lastBackupAt", finishedAt);

    const keep = Number(await getSetting<number>("backupKeep")) || 5;
    await pruneOldBackups(keep);

    const metadata = await stat(finalPath);
    logger.info("备份已完成", { name, size: metadata.size });
    return {
      name,
      size: metadata.size,
      createdAt: metadata.mtime.toISOString(),
    };
  } catch (error) {
    await unlink(stagingPath).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    globalForBackup.myblogBackupRunning = false;
  }
}
