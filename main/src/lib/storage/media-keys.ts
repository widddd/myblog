import path from "node:path";

import type { Upload } from "@prisma/client";

import { normalizeStorageKey } from "./types";

const MIME_EXTENSION: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/webm": "weba",
};

export function hashPrefix(hash: string): string {
  const prefix = hash.slice(0, 2).toLowerCase();
  if (!/^[0-9a-f]{2}$/.test(prefix)) {
    throw new Error("媒体 hash 不合法");
  }
  return prefix;
}

export function mediaKindFromMime(mime: string): "image" | "video" | "audio" {
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  return "image";
}

export function mediaFolderForMime(mime: string): "images" | "videos" | "audio" {
  const kind = mediaKindFromMime(mime);
  if (kind === "video") {
    return "videos";
  }
  if (kind === "audio") {
    return "audio";
  }
  return "images";
}

export function originalExtension(key: string, mime: string): string {
  const fromKey = path.posix.extname(key).slice(1).toLowerCase();
  if (
    fromKey &&
    !key.includes("-thumb.") &&
    !key.includes("-content.")
  ) {
    return fromKey === "jpeg" ? "jpg" : fromKey;
  }
  return MIME_EXTENSION[mime] ?? (fromKey || "bin");
}

export function originalMediaKey(
  hash: string,
  mime: string,
  extension = originalExtension("", mime),
): string {
  const hh = hashPrefix(hash);
  const kind = mediaKindFromMime(mime);
  const ext = extension === "jpeg" ? "jpg" : extension;
  if (kind === "image") {
    return `images/original/${hh}/${hash}.${ext}`;
  }
  const folder = kind === "video" ? "videos" : "audio";
  return `${folder}/${ext}/${hh}/${hash}.${ext}`;
}

export function thumbMediaKey(hash: string): string {
  const hh = hashPrefix(hash);
  return `images/thumbs/${hh}/${hash}.webp`;
}

export function thumb2MediaKey(hash: string): string {
  const hh = hashPrefix(hash);
  return `images/thumbs2/${hh}/${hash}.webp`;
}

const HASH_IN_KEY = /(?:^|\/)([a-f0-9]{64})(?:[-.]|$)/;

/** 从原图 / thumb / 旧路径里抽出 64 位 hex。拼二级缩略图用，不改文件名。 */
export function hashFromMediaKey(value: string): string | null {
  const match = HASH_IN_KEY.exec(value);
  return match ? match[1] : null;
}

export function isCanonicalOriginalKey(key: string): boolean {
  return (
    key.startsWith("images/original/") ||
    key.startsWith("videos/") ||
    key.startsWith("audio/")
  ) && !key.includes("/thumbs/");
}

export function isThumb2Key(key: string): boolean {
  return key.startsWith("images/thumbs2/");
}

export function isThumbKey(key: string): boolean {
  return (
    (key.startsWith("images/thumbs/") && !isThumb2Key(key)) ||
    /(?:^|\/)[a-f0-9]{64}-thumb\.webp$/.test(key)
  );
}

export function localOriginalCandidates(
  row: Pick<Upload, "hash" | "key" | "mime">,
): string[] {
  const extension = originalExtension(row.key, row.mime);
  const canonical = originalMediaKey(row.hash, row.mime, extension);
  const folder = mediaKindFromMime(row.mime);
  const candidates = [
    canonical,
    row.key,
    `media/images/${row.hash}-original.${extension}`,
    `media/videos/${row.hash}-original.${extension}`,
    `media/audio/${row.hash}-original.${extension}`,
    `images/${row.hash}-original.${extension}`,
    `videos/${row.hash}-original.${extension}`,
    `audio/${row.hash}-original.${extension}`,
    folder === "image" ? `images/${row.hash}-original` : "",
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of candidates) {
    if (!key || key.includes("-thumb.") || key.includes("-content.")) {
      continue;
    }
    try {
      const normalized = normalizeStorageKey(key);
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      result.push(normalized);
    } catch {
      // skip invalid historical keys
    }
  }
  return result;
}

export function localThumb2Candidates(row: Pick<Upload, "hash">): string[] {
  return [thumb2MediaKey(row.hash)];
}

export function localThumbCandidates(row: Pick<Upload, "hash" | "key">): string[] {
  const candidates = [
    thumbMediaKey(row.hash),
    `images/${row.hash}-thumb.webp`,
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of candidates) {
    try {
      const normalized = normalizeStorageKey(key);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    } catch {
      // skip
    }
  }
  return result;
}
