import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { isNodeNotFoundError } from "@/lib/backup/errors";
import { EPHEMERAL_BACKUP_DIR } from "@/lib/backup/files";
import { isPlainBackupFileName } from "@/lib/backup/filename";
import { logger } from "@/lib/utils/logger";

export const PLAIN_BACKUP_TTL_MS = 5 * 60 * 1000;

export async function clearPlainBackups(
  directory = EPHEMERAL_BACKUP_DIR,
): Promise<string[]> {
  let entries: { name: string; isFile(): boolean }[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return [];
    }
    throw error;
  }

  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isPlainBackupFileName(entry.name)) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    if (path.basename(filePath) !== entry.name) {
      continue;
    }
    await unlink(filePath).catch((error) => {
      if (!isNodeNotFoundError(error)) {
        throw error;
      }
    });
    removed.push(entry.name);
  }
  return removed;
}

/** Clears leftover ephemeral plaintext files from the old 5-minute download flow. */
export async function purgeExpiredPlainBackups(
  now = Date.now(),
  directory = EPHEMERAL_BACKUP_DIR,
): Promise<string[]> {
  let entries: { name: string; isFile(): boolean }[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return [];
    }
    throw error;
  }

  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isPlainBackupFileName(entry.name)) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    if (path.basename(filePath) !== entry.name) {
      continue;
    }
    const metadata = await stat(filePath);
    if (now - metadata.mtimeMs < PLAIN_BACKUP_TTL_MS) {
      continue;
    }
    await unlink(filePath).catch(() => undefined);
    logger.info("已删除过期的临时非加密备份", { name: entry.name });
    removed.push(entry.name);
  }
  return removed;
}
