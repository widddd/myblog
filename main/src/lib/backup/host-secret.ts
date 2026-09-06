import { randomBytes, scrypt, type ScryptOptions } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { BACKUP_KEY_BYTES, parseBackupKey } from "@/lib/backup/crypto";
import { BackupError, isNodeNotFoundError } from "@/lib/backup/errors";

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Buffer.isBuffer(derived) ? derived : Buffer.from(derived));
    });
  });
}

export const SCRYPT_N = 16_384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SALT_BYTES = 16;
export const HOST_SECRET_FILENAME = "backup-host-secret.json";

export type ScryptParams = {
  n: number;
  r: number;
  p: number;
};

export type HostSecretRecord = {
  salt: Buffer;
  hostHalf: Buffer;
  n: number;
  r: number;
  p: number;
};

export type BackupMetaV2 = {
  v: 2;
  kdf: "scrypt";
  salt: string;
  n: number;
  r: number;
  p: number;
  channel?: string;
  version?: string | null;
};

type HostSecretFile = {
  salt: string;
  hostHalf: string;
  n: number;
  r: number;
  p: number;
};

export function hostSecretPath(): string {
  return path.resolve(process.cwd(), "data", HOST_SECRET_FILENAME);
}

export function xorHalves(left: Buffer, right: Buffer): Buffer {
  if (left.length !== BACKUP_KEY_BYTES || right.length !== BACKUP_KEY_BYTES) {
    throw new BackupError("INVALID_KEY", "拆分密钥长度必须为 32 字节", 400);
  }
  const out = Buffer.alloc(BACKUP_KEY_BYTES);
  for (let i = 0; i < BACKUP_KEY_BYTES; i += 1) {
    out[i] = (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return out;
}

export function defaultScryptParams(): ScryptParams {
  return { n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };
}

export async function deriveHostHalf(
  passphrase: string,
  salt: Buffer,
  params: ScryptParams = defaultScryptParams(),
): Promise<Buffer> {
  if (!passphrase) {
    throw new BackupError("VALIDATION_ERROR", "备份口令不能为空", 400);
  }
  if (salt.length !== SALT_BYTES) {
    throw new BackupError("INVALID_KEY", "备份盐长度不合法", 400);
  }
  try {
    const derived = await scryptAsync(passphrase, salt, BACKUP_KEY_BYTES, {
      N: params.n,
      r: params.r,
      p: params.p,
      maxmem: 64 * 1024 * 1024,
    });
    return Buffer.isBuffer(derived) ? derived : Buffer.from(derived);
  } catch {
    throw new BackupError("INVALID_KEY", "无法用当前口令与盐派生主机半钥", 400);
  }
}

export function toBackupMetaV2(record: Pick<HostSecretRecord, "salt" | "n" | "r" | "p">): BackupMetaV2 {
  return {
    v: 2,
    kdf: "scrypt",
    salt: record.salt.toString("hex"),
    n: record.n,
    r: record.r,
    p: record.p,
  };
}

export function parseBackupMetaV2(raw: string): BackupMetaV2 {
  let parsed: Partial<BackupMetaV2>;
  try {
    parsed = JSON.parse(raw) as Partial<BackupMetaV2>;
  } catch {
    throw new BackupError("INVALID_ARCHIVE", "备份 meta.json 不是合法 JSON", 400);
  }
  if (
    parsed.v !== 2 ||
    parsed.kdf !== "scrypt" ||
    typeof parsed.salt !== "string" ||
    typeof parsed.n !== "number" ||
    typeof parsed.r !== "number" ||
    typeof parsed.p !== "number"
  ) {
    throw new BackupError("INVALID_ARCHIVE", "备份 meta.json 字段不完整", 400);
  }
  const salt = Buffer.from(parsed.salt, "hex");
  if (salt.length !== SALT_BYTES) {
    throw new BackupError("INVALID_ARCHIVE", "备份包内的盐长度不合法", 400);
  }
  const meta: BackupMetaV2 = {
    v: 2,
    kdf: "scrypt",
    salt: parsed.salt.toLowerCase(),
    n: parsed.n,
    r: parsed.r,
    p: parsed.p,
  };
  if (typeof parsed.channel === "string" && parsed.channel.trim()) {
    meta.channel = parsed.channel.trim();
  }
  if (parsed.version === null) {
    meta.version = null;
  } else if (typeof parsed.version === "string" && parsed.version.trim()) {
    meta.version = parsed.version.trim();
  }
  return meta;
}

export async function hostSecretExists(filePath = hostSecretPath()): Promise<boolean> {
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

export async function readHostSecret(
  filePath = hostSecretPath(),
): Promise<HostSecretRecord | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<HostSecretFile>;
    if (
      typeof parsed.salt !== "string" ||
      typeof parsed.hostHalf !== "string" ||
      typeof parsed.n !== "number" ||
      typeof parsed.r !== "number" ||
      typeof parsed.p !== "number"
    ) {
      throw new BackupError("HOST_SECRET_INVALID", "主机半钥文件损坏", 500);
    }
    return {
      salt: Buffer.from(parsed.salt, "hex"),
      hostHalf: parseBackupKey(parsed.hostHalf),
      n: parsed.n,
      r: parsed.r,
      p: parsed.p,
    };
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return null;
    }
    if (error instanceof BackupError) {
      throw error;
    }
    throw new BackupError("HOST_SECRET_INVALID", "主机半钥文件损坏", 500);
  }
}

export async function requireHostSecret(
  filePath = hostSecretPath(),
  purpose: "backup" | "restore" = "backup",
): Promise<HostSecretRecord> {
  const record = await readHostSecret(filePath);
  if (!record) {
    throw new BackupError(
      "HOST_SECRET_MISSING",
      purpose === "restore"
        ? "本机没有主机半钥。请把 data/backup-host-secret.json 拷回后再恢复，或停服后使用 pnpm restore --passphrase"
        : "尚未设定备份口令。请先打开 /admin/setup 创建站点，或在 main/ 下执行 pnpm setup",
      409,
    );
  }
  return record;
}

export async function writeHostSecretOnce(
  record: HostSecretRecord,
  filePath = hostSecretPath(),
): Promise<void> {
  if (await hostSecretExists(filePath)) {
    throw new BackupError(
      "HOST_SECRET_LOCKED",
      "备份口令已设定，不可更改",
      409,
    );
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const body: HostSecretFile = {
    salt: record.salt.toString("hex"),
    hostHalf: record.hostHalf.toString("hex"),
    n: record.n,
    r: record.r,
    p: record.p,
  };
  await writeFile(filePath, `${JSON.stringify(body, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

export async function createHostSecretFromPassphrase(
  passphrase: string,
  filePath = hostSecretPath(),
): Promise<HostSecretRecord> {
  const salt = randomBytes(SALT_BYTES);
  const params = defaultScryptParams();
  const hostHalf = await deriveHostHalf(passphrase, salt, params);
  const record: HostSecretRecord = {
    salt,
    hostHalf,
    n: params.n,
    r: params.r,
    p: params.p,
  };
  await writeHostSecretOnce(record, filePath);
  return record;
}
