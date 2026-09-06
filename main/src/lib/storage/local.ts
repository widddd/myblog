import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import {
  InvalidStorageKeyError,
  InvalidStorageRangeError,
  StorageObjectNotFoundError,
  normalizeStorageKey,
  type StorageByteRange,
  type StorageDriver,
  type StorageObject,
  type StorageObjectStat,
} from "./types";

const UPLOAD_ROOT = path.resolve(process.cwd(), "data", "uploads");

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function resolveKey(key: string): string {
  const normalized = normalizeStorageKey(key);
  const resolved = path.resolve(UPLOAD_ROOT, ...normalized.split("/"));
  const rootPrefix = `${UPLOAD_ROOT}${path.sep}`;
  const comparableResolved =
    process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const comparableRoot =
    process.platform === "win32" ? rootPrefix.toLowerCase() : rootPrefix;

  if (!comparableResolved.startsWith(comparableRoot)) {
    throw new InvalidStorageKeyError();
  }

  return resolved;
}

async function fileStat(filePath: string): Promise<StorageObjectStat | null> {
  try {
    const result = await stat(filePath);
    if (!result.isFile()) {
      return null;
    }
    return { size: result.size, lastModified: result.mtime };
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
}

export class LocalDriver implements StorageDriver {
  readonly name = "local" as const;

  async put(key: string, data: Uint8Array): Promise<void> {
    const destination = resolveKey(key);
    await mkdir(path.dirname(destination), { recursive: true });

    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, data, { flag: "wx" });

    try {
      if (await fileStat(destination)) {
        await unlink(temporary);
        return;
      }
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      if (await fileStat(destination)) {
        return;
      }
      throw error;
    }
  }

  async putFile(key: string, filePath: string): Promise<void> {
    const destination = resolveKey(key);
    if (await fileStat(destination)) {
      return;
    }
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await copyFile(filePath, temporary);
    try {
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      if (await fileStat(destination)) {
        return;
      }
      throw error;
    }
  }

  async get(key: string, range?: StorageByteRange): Promise<StorageObject> {
    const filePath = resolveKey(key);
    const metadata = await fileStat(filePath);
    if (!metadata) {
      throw new StorageObjectNotFoundError();
    }

    const selectedRange = range ?? null;
    if (
      selectedRange &&
      (selectedRange.start < 0 ||
        selectedRange.end < selectedRange.start ||
        selectedRange.end >= metadata.size)
    ) {
      throw new InvalidStorageRangeError(metadata.size);
    }

    const stream = createReadStream(filePath, selectedRange ?? undefined);
    return {
      ...metadata,
      body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
      contentLength: selectedRange
        ? selectedRange.end - selectedRange.start + 1
        : metadata.size,
      range: selectedRange,
    };
  }

  async getToFile(key: string, destPath: string): Promise<void> {
    const source = resolveKey(key);
    if (!(await fileStat(source))) {
      throw new StorageObjectNotFoundError();
    }
    await mkdir(path.dirname(destPath), { recursive: true });
    await copyFile(source, destPath);
  }

  getUrl(key: string): string {
    const normalized = normalizeStorageKey(key);
    const encoded = normalized.split("/").map(encodeURIComponent).join("/");
    return `/api/uploads/${encoded}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(resolveKey(key));
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }

  stat(key: string): Promise<StorageObjectStat | null> {
    return fileStat(resolveKey(key));
  }

  async listKeys(prefix?: string): Promise<string[]> {
    const keys: string[] = [];

    const walk = async (dir: string, posixPrefix: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) {
          return;
        }
        throw error;
      }

      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name.endsWith(".tmp")) {
          continue;
        }
        const posix = posixPrefix ? `${posixPrefix}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, posix);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        try {
          keys.push(normalizeStorageKey(posix));
        } catch {
          // Skip unexpected filenames rather than abort a backup.
        }
      }
    };

    await walk(UPLOAD_ROOT, "");
    if (!prefix) {
      return keys;
    }
    return keys.filter((key) => key === prefix || key.startsWith(`${prefix}`));
  }

  openReadStream(key: string): Readable {
    return createReadStream(resolveKey(key));
  }
}
