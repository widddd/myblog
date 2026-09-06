import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createGunzip } from "node:zlib";

import { BackupError } from "@/lib/backup/errors";
import { normalizeStorageKey } from "@/lib/storage/types";

export const MAX_BACKUP_ENTRY_BYTES = 512 * 1024 * 1024;
export const MAX_BACKUP_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

export type ArchiveEntryKind =
  | { kind: "db" }
  | { kind: "meta" }
  | { kind: "upload"; key: string };

export type ExtractedBackup = {
  databasePath: string;
  uploadDir: string;
  uploadKeys: string[];
};

const SQLITE_HEADER = Buffer.from("SQLite format 3\0");

export function classifyArchiveEntry(name: string): ArchiveEntryKind | null {
  if (!name || name.includes("\\") || name.includes("\0")) {
    return null;
  }
  const posix = name.replace(/\\/g, "/").replace(/^\.\//, "");
  if (posix.startsWith("/") || posix.split("/").some((part) => part === "..")) {
    return null;
  }
  if (posix === "blog.db") {
    return { kind: "db" };
  }
  if (posix === "meta.json") {
    return { kind: "meta" };
  }
  if (posix === "uploads" || posix === "uploads/") {
    return null;
  }
  if (posix.startsWith("uploads/")) {
    try {
      return { kind: "upload", key: normalizeStorageKey(posix.slice("uploads/".length)) };
    } catch {
      return null;
    }
  }
  return null;
}

function readCString(buf: Buffer): string {
  const end = buf.indexOf(0);
  return buf.subarray(0, end === -1 ? buf.length : end).toString("utf8");
}

function parseOctal(buf: Buffer): number {
  const text = buf.toString("utf8").replace(/\0/g, "").trim();
  if (!text) {
    return 0;
  }
  return Number.parseInt(text, 8);
}

function isZeroBlock(block: Buffer): boolean {
  for (let i = 0; i < block.length; i += 1) {
    if (block[i] !== 0) {
      return false;
    }
  }
  return true;
}

function verifyChecksum(header: Buffer): boolean {
  const stored = parseOctal(header.subarray(148, 156));
  let sum = 0;
  for (let i = 0; i < 512; i += 1) {
    sum += i >= 148 && i < 156 ? 32 : header[i];
  }
  return sum === stored;
}

function headerPath(header: Buffer, override?: string): string {
  if (override) {
    return override;
  }
  const name = readCString(header.subarray(0, 100));
  const prefix = readCString(header.subarray(345, 500));
  return prefix ? `${prefix}/${name}` : name;
}

function parsePaxPath(body: Buffer): string | undefined {
  const text = body.toString("utf8");
  for (const line of text.split("\n")) {
    const cut = line.indexOf(" ");
    if (cut === -1) {
      continue;
    }
    const record = line.slice(cut + 1);
    if (record.startsWith("path=")) {
      return record.slice("path=".length);
    }
  }
  return undefined;
}

class StreamReader {
  private buffer = Buffer.alloc(0);
  private iterator: AsyncIterator<Buffer>;

  constructor(stream: AsyncIterable<Buffer>) {
    this.iterator = stream[Symbol.asyncIterator]();
  }

  async read(size: number): Promise<Buffer | null> {
    while (this.buffer.length < size) {
      const next = await this.iterator.next();
      if (next.done) {
        if (this.buffer.length === 0) {
          return null;
        }
        throw new BackupError("INVALID_ARCHIVE", "压缩包已截断", 400);
      }
      const chunk = Buffer.isBuffer(next.value)
        ? next.value
        : Buffer.from(next.value);
      this.buffer = Buffer.concat([this.buffer, chunk]);
    }
    const out = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return out;
  }
}

async function writeExact(
  reader: StreamReader,
  destination: string,
  size: number,
): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const output = createWriteStream(destination);
  let remaining = size;
  try {
    while (remaining > 0) {
      const take = Math.min(remaining, 64 * 1024);
      const chunk = await reader.read(take);
      if (!chunk) {
        throw new BackupError("INVALID_ARCHIVE", "压缩包已截断", 400);
      }
      remaining -= chunk.length;
      if (!output.write(chunk)) {
        await new Promise<void>((resolve, reject) => {
          output.once("drain", resolve);
          output.once("error", reject);
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      output.once("error", reject);
      output.end(resolve);
    });
  } catch (error) {
    output.destroy();
    throw error;
  }
}

async function readExact(reader: StreamReader, size: number): Promise<Buffer> {
  if (size === 0) {
    return Buffer.alloc(0);
  }
  const data = await reader.read(size);
  if (!data) {
    throw new BackupError("INVALID_ARCHIVE", "压缩包已截断", 400);
  }
  return data;
}

async function skipPadding(reader: StreamReader, size: number): Promise<void> {
  const pad = (512 - (size % 512)) % 512;
  if (pad > 0) {
    await readExact(reader, pad);
  }
}

export async function assertSqliteSnapshot(filePath: string): Promise<void> {
  const { open } = await import("node:fs/promises");
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < SQLITE_HEADER.length || !header.equals(SQLITE_HEADER)) {
      throw new BackupError("INVALID_ARCHIVE", "备份内的 blog.db 不是合法 SQLite 文件", 400);
    }
  } finally {
    await handle.close();
  }
}

export type TarWalkEntry = {
  name: string;
  size: number;
  readToFile: (destination: string) => Promise<void>;
  discard: () => Promise<void>;
};

export async function walkTarGz(
  archivePath: string,
  onFile: (entry: TarWalkEntry) => Promise<void>,
  options: { label?: string } = {},
): Promise<void> {
  const label = options.label ?? "备份包";
  const reader = new StreamReader(
    createReadStream(archivePath).pipe(createGunzip()) as AsyncIterable<Buffer>,
  );

  let totalBytes = 0;
  let nextPathOverride: string | undefined;

  while (true) {
    const header = await reader.read(512);
    if (!header) {
      break;
    }
    if (isZeroBlock(header)) {
      break;
    }
    if (!verifyChecksum(header)) {
      throw new BackupError("INVALID_ARCHIVE", `${label} tar 头校验失败`, 400);
    }

    const typeflag = String.fromCharCode(header[156] ?? 0);
    const size = parseOctal(header.subarray(124, 136));
    if (!Number.isFinite(size) || size < 0) {
      throw new BackupError("INVALID_ARCHIVE", `${label}文件大小不合法`, 400);
    }
    if (size > MAX_BACKUP_ENTRY_BYTES) {
      throw new BackupError("INVALID_ARCHIVE", `${label}内单个文件过大`, 400);
    }
    totalBytes += size;
    if (totalBytes > MAX_BACKUP_TOTAL_BYTES) {
      throw new BackupError("INVALID_ARCHIVE", `${label}解压后体积过大`, 400);
    }

    const entryPath = headerPath(header, nextPathOverride);
    nextPathOverride = undefined;

    if (typeflag === "x" || typeflag === "g") {
      const body = await readExact(reader, size);
      await skipPadding(reader, size);
      if (typeflag === "x") {
        nextPathOverride = parsePaxPath(body);
      }
      continue;
    }
    if (typeflag === "L") {
      const body = await readExact(reader, size);
      await skipPadding(reader, size);
      nextPathOverride = readCString(body);
      continue;
    }
    if (typeflag === "5" || entryPath.endsWith("/")) {
      await readExact(reader, size);
      await skipPadding(reader, size);
      continue;
    }
    if (typeflag !== "0" && typeflag !== "\0") {
      throw new BackupError(
        "INVALID_ARCHIVE",
        `${label}含不支持的条目类型（${typeflag || "未知"}）`,
        400,
      );
    }

    let consumed = false;
    await onFile({
      name: entryPath,
      size,
      readToFile: async (destination) => {
        if (consumed) {
          throw new BackupError("INVALID_ARCHIVE", `${label}条目被重复读取`, 500);
        }
        consumed = true;
        await writeExact(reader, destination, size);
        await skipPadding(reader, size);
      },
      discard: async () => {
        if (consumed) {
          return;
        }
        consumed = true;
        await readExact(reader, size);
        await skipPadding(reader, size);
      },
    });
    if (!consumed) {
      await readExact(reader, size);
      await skipPadding(reader, size);
    }
  }
}

export async function listTarGzEntryNames(archivePath: string): Promise<string[]> {
  const names: string[] = [];
  await walkTarGz(archivePath, async (entry) => {
    names.push(entry.name);
    await entry.discard();
  });
  return names;
}

export async function extractNamedFiles(
  archivePath: string,
  destDir: string,
  allowed: ReadonlySet<string>,
  options: { discardOthers?: boolean } = {},
): Promise<Map<string, string>> {
  await mkdir(destDir, { recursive: true });
  const extracted = new Map<string, string>();

  await walkTarGz(archivePath, async (entry) => {
    if (!allowed.has(entry.name)) {
      if (options.discardOthers) {
        await entry.discard();
        return;
      }
      throw new BackupError("INVALID_ARCHIVE", `备份包含非法路径：${entry.name}`, 400);
    }
    if (extracted.has(entry.name)) {
      throw new BackupError("INVALID_ARCHIVE", `备份包内有重复条目：${entry.name}`, 400);
    }
    const destination = path.join(destDir, entry.name);
    await entry.readToFile(destination);
    extracted.set(entry.name, destination);
  });

  return extracted;
}

export async function extractBackupArchive(
  archivePath: string,
  destDir: string,
): Promise<ExtractedBackup> {
  await mkdir(destDir, { recursive: true });

  let databasePath: string | undefined;
  const uploadKeys: string[] = [];
  const uploadDir = path.join(destDir, "uploads");

  await walkTarGz(archivePath, async (entry) => {
    const classified = classifyArchiveEntry(entry.name);
    if (!classified) {
      throw new BackupError("INVALID_ARCHIVE", `备份包含非法路径：${entry.name}`, 400);
    }

    if (classified.kind === "meta") {
      await entry.discard();
      return;
    }

    if (classified.kind === "db") {
      if (databasePath) {
        throw new BackupError("INVALID_ARCHIVE", "备份包内有多个 blog.db", 400);
      }
      databasePath = path.join(destDir, "blog.db");
      await entry.readToFile(databasePath);
      return;
    }

    const dest = path.join(uploadDir, ...classified.key.split("/"));
    await entry.readToFile(dest);
    uploadKeys.push(classified.key);
  });

  if (!databasePath) {
    throw new BackupError("INVALID_ARCHIVE", "备份包缺少 blog.db", 400);
  }
  await assertSqliteSnapshot(databasePath);

  return { databasePath, uploadDir, uploadKeys };
}
