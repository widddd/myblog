import { BackupError } from "@/lib/backup/errors";
import { hashBackupKey } from "@/lib/backup/crypto";
import { prisma } from "@/lib/db";
import { isManagedBackupFileName } from "@/lib/backup/filename";

export { readKeyHashFromDatabase } from "@/lib/backup/secrets-read";
export { assertBackupKeyMatches, keyFingerprint } from "@/lib/backup/crypto";

export async function saveBackupKeyHash(name: string, key: Buffer): Promise<string> {
  if (!isManagedBackupFileName(name)) {
    throw new BackupError("VALIDATION_ERROR", "备份文件名不合法", 400);
  }
  const keyHash = hashBackupKey(key);
  try {
    await prisma.backupSecret.upsert({
      where: { name },
      create: { name, keyHash, algo: "aes-256-gcm" },
      update: { keyHash, algo: "aes-256-gcm" },
    });
  } catch {
    throw new BackupError(
      "SCHEMA_MISSING",
      "数据库还缺少 BackupSecret 表。请停掉应用后在 main/ 执行 pnpm prisma migrate deploy",
      500,
    );
  }
  return keyHash;
}

export async function deleteBackupKeyHash(name: string): Promise<void> {
  try {
    await prisma.backupSecret.deleteMany({ where: { name } });
  } catch {
    // Table may be missing on an un-migrated database.
  }
}

export async function getBackupKeyHash(name: string): Promise<string | null> {
  try {
    const row = await prisma.backupSecret.findUnique({
      where: { name },
      select: { keyHash: true },
    });
    return row?.keyHash ?? null;
  } catch {
    return null;
  }
}

export async function listBackupKeyHashes(): Promise<Map<string, string>> {
  try {
    const rows = await prisma.backupSecret.findMany({
      select: { name: true, keyHash: true },
    });
    return new Map(rows.map((row) => [row.name, row.keyHash]));
  } catch {
    return new Map();
  }
}

