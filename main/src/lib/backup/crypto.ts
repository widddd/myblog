import { createReadStream, createWriteStream } from "node:fs";
import { open, unlink } from "node:fs/promises";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { pipeline } from "node:stream/promises";

import { BackupError } from "@/lib/backup/errors";

export const BACKUP_CIPHER = "aes-256-gcm";
export const BACKUP_KEY_BYTES = 32;
export const BACKUP_IV_BYTES = 12;
export const BACKUP_TAG_BYTES = 16;
export const BACKUP_MAGIC_V1 = Buffer.from("MBENC01\n");
export const BACKUP_MAGIC_V2 = Buffer.from("MBENC02\n");
export const BACKUP_MAGIC = BACKUP_MAGIC_V2;

export function generateBackupKey(): Buffer {
  return randomBytes(BACKUP_KEY_BYTES);
}

export function hashBackupKey(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex");
}

export function parseBackupKey(text: string): Buffer {
  const hex = text.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new BackupError("INVALID_KEY", "备份包内的密钥格式不合法", 400);
  }
  return Buffer.from(hex, "hex");
}

export function assertBackupKeyMatches(key: Buffer, expectedHash: string): void {
  if (!backupKeysMatch(key, expectedHash)) {
    throw new BackupError(
      "KEY_MISMATCH",
      "备份包内的密钥与后台记录不一致，已拒绝恢复",
      403,
    );
  }
}

export function backupKeysMatch(key: Buffer, expectedHash: string): boolean {
  const actual = Buffer.from(hashBackupKey(key), "hex");
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHash, "hex");
  } catch {
    return false;
  }
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function keyFingerprint(keyHash: string): string {
  return keyHash.slice(0, 8);
}

export async function encryptBackupFile(
  sourcePath: string,
  destinationPath: string,
  key: Buffer,
): Promise<void> {
  if (key.length !== BACKUP_KEY_BYTES) {
    throw new BackupError("INVALID_KEY", "备份密钥长度不合法", 400);
  }

  const iv = randomBytes(BACKUP_IV_BYTES);
  const cipher = createCipheriv(BACKUP_CIPHER, key, iv);
  const ciphertextPath = `${destinationPath}.ct`;

  try {
    await pipeline(createReadStream(sourcePath), cipher, createWriteStream(ciphertextPath));
    const tag = cipher.getAuthTag();
    if (tag.length !== BACKUP_TAG_BYTES) {
      throw new BackupError("ENCRYPT_FAILED", "加密标签长度异常", 500);
    }

    const output = createWriteStream(destinationPath);
    await new Promise<void>((resolve, reject) => {
      output.once("error", reject);
      output.write(Buffer.concat([BACKUP_MAGIC, iv, tag]), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await pipeline(createReadStream(ciphertextPath), output);
  } finally {
    await unlink(ciphertextPath).catch(() => undefined);
  }
}

export async function decryptBackupFile(
  sourcePath: string,
  destinationPath: string,
  key: Buffer,
): Promise<void> {
  if (key.length !== BACKUP_KEY_BYTES) {
    throw new BackupError("INVALID_KEY", "备份密钥长度不合法", 400);
  }

  const headerSize = BACKUP_MAGIC.length + BACKUP_IV_BYTES + BACKUP_TAG_BYTES;
  const handle = await open(sourcePath, "r");
  let header: Buffer;
  try {
    header = Buffer.alloc(headerSize);
    const { bytesRead } = await handle.read(header, 0, headerSize, 0);
    if (bytesRead < headerSize) {
      throw new BackupError("INVALID_ARCHIVE", "加密备份包已截断", 400);
    }
  } finally {
    await handle.close();
  }

  const magic = header.subarray(0, BACKUP_MAGIC.length);
  if (!magic.equals(BACKUP_MAGIC_V2) && !magic.equals(BACKUP_MAGIC_V1)) {
    throw new BackupError("INVALID_ARCHIVE", "不是本系统的加密备份", 400);
  }

  const iv = header.subarray(BACKUP_MAGIC.length, BACKUP_MAGIC.length + BACKUP_IV_BYTES);
  const tag = header.subarray(headerSize - BACKUP_TAG_BYTES, headerSize);
  const decipher = createDecipheriv(BACKUP_CIPHER, key, iv);
  decipher.setAuthTag(tag);

  try {
    await pipeline(
      createReadStream(sourcePath, { start: headerSize }),
      decipher,
      createWriteStream(destinationPath),
    );
  } catch {
    throw new BackupError("DECRYPT_FAILED", "备份解密失败，密钥或密文已被改动", 400);
  }
}
