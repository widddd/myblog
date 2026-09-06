import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { TarArchive } from "archiver";

import { BackupError } from "@/lib/backup/errors";
import {
  decryptBackupFile,
  parseBackupKey,
} from "@/lib/backup/crypto";
import {
  deriveHostHalf,
  parseBackupMetaV2,
  requireHostSecret,
  xorHalves,
  type BackupMetaV2,
} from "@/lib/backup/host-secret";
import { extractNamedFiles, listTarGzEntryNames } from "@/lib/backup/tar";

export const CONTAINER_KEY_NAME = "key";
export const CONTAINER_META_NAME = "meta.json";
export const CONTAINER_HALF_NAME = "half";
export const CONTAINER_PAYLOAD_NAME = "payload.enc";

export type OpenBackupOptions = {
  passphrase?: string;
  hostHalf?: Buffer;
  hostSecretPath?: string;
};

export type PeekedBackup =
  | { format: "plain" }
  | { format: "v1" }
  | { format: "v2"; meta: BackupMetaV2; packageHalf: Buffer };

export type OpenedBackup =
  | { kind: "legacy"; innerArchivePath: string }
  | { kind: "encrypted"; format: "v1" | "v2"; innerArchivePath: string; key: Buffer };

async function writeTarGz(
  archivePath: string,
  append: (archive: TarArchive) => void,
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
  append(archive);
  await archive.finalize();
  await done;
}

export async function packEncryptedContainer(
  archivePath: string,
  payloadPath: string,
  packageHalf: Buffer,
  meta: BackupMetaV2,
): Promise<void> {
  await writeTarGz(archivePath, (archive) => {
    archive.append(`${JSON.stringify(meta)}\n`, { name: CONTAINER_META_NAME });
    archive.append(`${packageHalf.toString("hex")}\n`, { name: CONTAINER_HALF_NAME });
    archive.file(payloadPath, { name: CONTAINER_PAYLOAD_NAME });
  });
}

export async function packV1EncryptedContainer(
  archivePath: string,
  payloadPath: string,
  key: Buffer,
): Promise<void> {
  await writeTarGz(archivePath, (archive) => {
    archive.append(`${key.toString("hex")}\n`, { name: CONTAINER_KEY_NAME });
    archive.file(payloadPath, { name: CONTAINER_PAYLOAD_NAME });
  });
}

export async function peekBackupPackage(
  archivePath: string,
  destDir: string,
): Promise<PeekedBackup> {
  const names = await listTarGzEntryNames(archivePath);
  const isV2 =
    names.includes(CONTAINER_META_NAME) &&
    names.includes(CONTAINER_HALF_NAME) &&
    names.includes(CONTAINER_PAYLOAD_NAME);
  if (isV2) {
    await mkdir(destDir, { recursive: true });
    const files = await extractNamedFiles(
      archivePath,
      destDir,
      new Set([CONTAINER_META_NAME, CONTAINER_HALF_NAME]),
      { discardOthers: true },
    );
    const metaPath = files.get(CONTAINER_META_NAME);
    const halfPath = files.get(CONTAINER_HALF_NAME);
    if (!metaPath || !halfPath) {
      throw new BackupError("INVALID_ARCHIVE", "拆分密钥备份缺少 meta 或包内半钥", 400);
    }
    return {
      format: "v2",
      meta: parseBackupMetaV2(await readFile(metaPath, "utf8")),
      packageHalf: parseBackupKey(await readFile(halfPath, "utf8")),
    };
  }

  if (names.includes(CONTAINER_KEY_NAME) && names.includes(CONTAINER_PAYLOAD_NAME)) {
    return { format: "v1" };
  }

  if (names.includes("blog.db")) {
    return { format: "plain" };
  }

  throw new BackupError("INVALID_ARCHIVE", "无法识别的备份包格式", 400);
}

async function resolveHostHalf(
  peeked: Extract<PeekedBackup, { format: "v2" }>,
  options: OpenBackupOptions,
): Promise<Buffer> {
  if (options.hostHalf) {
    return options.hostHalf;
  }
  if (options.passphrase) {
    return deriveHostHalf(options.passphrase, Buffer.from(peeked.meta.salt, "hex"), {
      n: peeked.meta.n,
      r: peeked.meta.r,
      p: peeked.meta.p,
    });
  }
  const record = await requireHostSecret(options.hostSecretPath, "restore");
  return record.hostHalf;
}

async function extractV1Key(archivePath: string, destDir: string): Promise<Buffer> {
  await mkdir(destDir, { recursive: true });
  const files = await extractNamedFiles(
    archivePath,
    destDir,
    new Set([CONTAINER_KEY_NAME]),
    { discardOthers: true },
  );
  const keyPath = files.get(CONTAINER_KEY_NAME);
  if (!keyPath) {
    throw new BackupError("INVALID_ARCHIVE", "加密备份缺少密钥", 400);
  }
  return parseBackupKey(await readFile(keyPath, "utf8"));
}

export async function resolveBackupDek(
  peeked: PeekedBackup,
  archivePath: string,
  destDir: string,
  options: OpenBackupOptions = {},
): Promise<Buffer | null> {
  if (peeked.format === "plain") {
    return null;
  }
  if (peeked.format === "v1") {
    return extractV1Key(archivePath, destDir);
  }
  const hostHalf = await resolveHostHalf(peeked, options);
  return xorHalves(hostHalf, peeked.packageHalf);
}

export async function readBackupPackageDek(
  archivePath: string,
  destDir: string,
  options: OpenBackupOptions = {},
): Promise<{ format: "v1" | "v2"; dek: Buffer } | null> {
  const peeked = await peekBackupPackage(archivePath, destDir);
  const dek = await resolveBackupDek(peeked, archivePath, destDir, options);
  if (!dek || peeked.format === "plain") {
    return null;
  }
  return { format: peeked.format, dek };
}

export async function openBackupPackage(
  archivePath: string,
  workDir: string,
  options: OpenBackupOptions = {},
): Promise<OpenedBackup> {
  const containerDir = path.join(workDir, "container");
  const peeked = await peekBackupPackage(archivePath, containerDir);

  if (peeked.format === "plain") {
    return { kind: "legacy", innerArchivePath: archivePath };
  }

  const dek = await resolveBackupDek(peeked, archivePath, containerDir, options);
  if (!dek) {
    throw new BackupError("INVALID_ARCHIVE", "无法合成备份数据密钥", 400);
  }

  const files = await extractNamedFiles(
    archivePath,
    containerDir,
    new Set([CONTAINER_PAYLOAD_NAME]),
    { discardOthers: true },
  );
  const payloadPath = files.get(CONTAINER_PAYLOAD_NAME);
  if (!payloadPath) {
    throw new BackupError("INVALID_ARCHIVE", "加密备份缺少密文", 400);
  }

  const innerArchivePath = path.join(workDir, "inner.tar.gz");
  await decryptBackupFile(payloadPath, innerArchivePath, dek);
  return {
    kind: "encrypted",
    format: peeked.format,
    innerArchivePath,
    key: dek,
  };
}
