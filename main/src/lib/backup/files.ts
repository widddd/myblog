import { copyFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { BackupError, isNodeNotFoundError } from "@/lib/backup/errors";
import { isManagedBackupFileName, isPlainBackupFileName } from "@/lib/backup/filename";

export type BackupFileInfo = {
  name: string;
  size: number;
  createdAt: string;
};

export const BACKUP_DIR = path.resolve(process.cwd(), "data", "backups");
export const EPHEMERAL_BACKUP_DIR = path.resolve(BACKUP_DIR, "ephemeral");
export const MAX_BACKUP_PACKAGE_BYTES = 512 * 1024 * 1024;

function assertInside(resolved: string, root: string, message: string): string {
  const comparableResolved =
    process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const comparableRoot =
    process.platform === "win32"
      ? `${root}${path.sep}`.toLowerCase()
      : `${root}${path.sep}`;
  if (!comparableResolved.startsWith(comparableRoot)) {
    throw new BackupError("VALIDATION_ERROR", message, 400);
  }
  return resolved;
}

export function resolveBackupPath(name: string): string {
  if (!isManagedBackupFileName(name)) {
    throw new BackupError("VALIDATION_ERROR", "备份文件名不合法", 400);
  }
  return assertInside(
    path.resolve(BACKUP_DIR, name),
    BACKUP_DIR,
    "备份路径不合法",
  );
}

export function resolveEphemeralBackupPath(name: string): string {
  if (!isPlainBackupFileName(name)) {
    throw new BackupError("VALIDATION_ERROR", "临时备份文件名不合法", 400);
  }
  return assertInside(
    path.resolve(EPHEMERAL_BACKUP_DIR, name),
    EPHEMERAL_BACKUP_DIR,
    "临时备份路径不合法",
  );
}

export async function ensureBackupDir(): Promise<void> {
  await mkdir(BACKUP_DIR, { recursive: true });
}

export async function ensureEphemeralBackupDir(): Promise<void> {
  await mkdir(EPHEMERAL_BACKUP_DIR, { recursive: true });
}

export function getBackupFilePath(name: string): string {
  return resolveBackupPath(name);
}

export async function backupPackageExists(name: string): Promise<boolean> {
  try {
    const metadata = await stat(resolveBackupPath(name));
    return metadata.isFile();
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

export async function listBackups(): Promise<BackupFileInfo[]> {
  await ensureBackupDir();
  const entries = await readdir(BACKUP_DIR, { withFileTypes: true });
  const files: BackupFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !isManagedBackupFileName(entry.name)) {
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

export async function moveBackupFile(sourcePath: string, destinationPath: string): Promise<void> {
  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "EXDEV"
    ) {
      await copyFile(sourcePath, destinationPath);
      await unlink(sourcePath);
      return;
    }
    throw error;
  }
}

export async function deleteBackupFile(name: string): Promise<void> {
  const filePath = resolveBackupPath(name);
  try {
    await unlink(filePath);
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      throw new BackupError("NOT_FOUND", "备份不存在", 404);
    }
    throw error;
  }
}
