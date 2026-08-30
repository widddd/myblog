import type { Readable } from "node:stream";
import path from "node:path";

export type StorageDriverName = "local" | "oss";

export type StorageByteRange = {
  start: number;
  end: number;
};

export type StorageObjectStat = {
  size: number;
  lastModified: Date;
};

export type StorageObject = StorageObjectStat & {
  body: ReadableStream<Uint8Array>;
  contentLength: number;
  range: StorageByteRange | null;
};

export interface StorageDriver {
  readonly name: StorageDriverName;
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string, range?: StorageByteRange): Promise<StorageObject>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
  stat(key: string): Promise<StorageObjectStat | null>;
  listKeys(): Promise<string[]>;
  openReadStream(key: string): Readable;
}

export class InvalidStorageKeyError extends Error {
  constructor(message = "存储路径不合法") {
    super(message);
    this.name = "InvalidStorageKeyError";
  }
}

export class StorageObjectNotFoundError extends Error {
  constructor() {
    super("文件不存在");
    this.name = "StorageObjectNotFoundError";
  }
}

export class InvalidStorageRangeError extends Error {
  constructor(readonly size: number) {
    super("请求的文件范围不合法");
    this.name = "InvalidStorageRangeError";
  }
}

const SAFE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const IMMUTABLE_FILE_PATTERN =
  /(?:^|\/)[a-f0-9]{64}-(?:(?:original|content|thumb)\.[a-z0-9]+|original)$/;

export function normalizeStorageKey(key: string): string {
  if (
    !key ||
    key.includes("\\") ||
    key.includes("\0") ||
    path.posix.isAbsolute(key) ||
    !SAFE_KEY_PATTERN.test(key)
  ) {
    throw new InvalidStorageKeyError();
  }

  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new InvalidStorageKeyError();
  }

  const normalized = path.posix.normalize(key);
  if (normalized !== key || normalized.startsWith("../")) {
    throw new InvalidStorageKeyError();
  }

  return normalized;
}

export function isImmutableStorageKey(key: string): boolean {
  return IMMUTABLE_FILE_PATTERN.test(normalizeStorageKey(key));
}

export function contentTypeFromStorageKey(key: string): string {
  const extension = path.posix.extname(normalizeStorageKey(key)).toLowerCase();
  const types: Record<string, string> = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".webm": "video/webm",
    ".webp": "image/webp",
  };
  return types[extension] ?? "application/octet-stream";
}
