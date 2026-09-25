import { createHash } from "node:crypto";
import path from "node:path";

import type { Upload } from "@prisma/client";
import sharp, { type OutputInfo, type Sharp } from "sharp";

import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import {
  getDriver,
  loadCosSettings,
  localOriginalCandidates,
  localUploadUrl,
  originalMediaKey,
  publicMediaUrl,
  thumb2MediaKey,
  thumbMediaKey,
  type StorageDriverName,
  type StorageObject,
} from "@/lib/storage";
import {
  compressImageToMaxBytes,
  ImageCompressError,
  MAX_INPUT_PIXELS,
  orientedDimensions,
  readImageDimensions,
  withSharpLock,
} from "@/lib/upload/compress";
import {
  IMAGE_INTAKE_MAX_BYTES,
  IMAGE_ORIGINAL_MAX_BYTES,
} from "@/lib/upload/limits";
import { logger } from "@/lib/utils/logger";
import { parseUploadDuration } from "@/lib/uploads/locations";
import { pruneLocalMedia } from "@/lib/uploads/quota";

const MAX_FILES_PER_REQUEST = 1;
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

const IMAGE_TYPES: Record<string, readonly string[]> = {
  "image/avif": ["avif"],
  "image/gif": ["gif"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

const VIDEO_TYPES: Record<string, readonly string[]> = {
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
};

const AUDIO_TYPES: Record<string, readonly string[]> = {
  "audio/aac": ["aac"],
  "audio/mpeg": ["mp3"],
  "audio/mp4": ["m4a", "mp4"],
  "audio/x-m4a": ["m4a"],
  "audio/ogg": ["ogg"],
  "audio/opus": ["opus", "ogg"],
  "audio/wav": ["wav"],
  "audio/x-wav": ["wav"],
  "audio/webm": ["weba", "webm"],
};

export type UploadKind = "image" | "video" | "audio";

type StoredVariant = {
  key: string;
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
};

export type StoredVariants = {
  thumb?: StoredVariant;
  thumb2?: StoredVariant;
  content?: StoredVariant;
  duration?: number;
};

export type UploadResult = {
  id: number;
  hash: string;
  kind: UploadKind;
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
  duration: number | null;
  createdAt: string;
  original: StoredVariant & { url: string };
  thumb: (StoredVariant & { url: string }) | null;
  content: (StoredVariant & { url: string }) | null;
  pending: boolean;
};

type WrittenObject = {
  driver: StorageDriverName;
  key: string;
};

export class UploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export { MAX_INPUT_PIXELS, withSharpLock } from "@/lib/upload/compress";

export function parseVariants(raw: string): StoredVariants {
  try {
    const parsed = JSON.parse(raw) as StoredVariants;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function kindOfMime(mime: string): UploadKind {
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  return "image";
}

function mediaUrl(key: string, pending: boolean) {
  return pending ? localUploadUrl(key) : publicMediaUrl(key);
}

function withPublicUrl(variant: StoredVariant, pending: boolean) {
  return {
    ...variant,
    url: mediaUrl(variant.key, pending),
  };
}

export function isUploadPending(row: Upload): boolean {
  const kind = kindOfMime(row.mime);
  const variants = parseVariants(row.variants);
  if (kind === "image" && !variants.thumb) {
    return true;
  }
  const driver = row.driver.trim().toLowerCase();
  return driver !== "cos" && driver !== "oss";
}

export { parseUploadDuration } from "@/lib/uploads/locations";

export function toUploadResult(row: Upload): UploadResult {
  const variants = parseVariants(row.variants);
  const pending = isUploadPending(row);
  const original: StoredVariant = {
    key: row.key,
    mime: row.mime,
    width: row.width,
    height: row.height,
    size: row.size,
  };

  return {
    id: row.id,
    hash: row.hash,
    kind: kindOfMime(row.mime),
    mime: row.mime,
    width: row.width,
    height: row.height,
    size: row.size,
    duration: parseUploadDuration(variants.duration),
    createdAt: row.createdAt.toISOString(),
    original: { ...original, url: mediaUrl(row.key, pending) },
    thumb: variants.thumb ? withPublicUrl(variants.thumb, pending) : null,
    content: variants.content ? withPublicUrl(variants.content, pending) : null,
    pending,
  };
}

function extensionOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

function validateDetectedType(
  mime: string,
  detectedExtension: string,
  fileName: string,
  requestedKind: string | null,
): UploadKind {
  const kind: UploadKind | null = IMAGE_TYPES[mime]
    ? "image"
    : VIDEO_TYPES[mime]
      ? "video"
      : AUDIO_TYPES[mime]
        ? "audio"
        : null;

  if (!kind) {
    throw new UploadError(
      "UNSUPPORTED_MEDIA_TYPE",
      "只允许上传受支持的图片、视频或音频",
    );
  }
  if (requestedKind && requestedKind !== kind) {
    throw new UploadError("MEDIA_KIND_MISMATCH", "上传类型与文件内容不匹配");
  }

  const allowedExtensions =
    kind === "image"
      ? IMAGE_TYPES[mime]
      : kind === "video"
        ? VIDEO_TYPES[mime]
        : AUDIO_TYPES[mime];
  const suppliedExtension = extensionOf(fileName);
  if (
    !allowedExtensions.includes(detectedExtension) &&
    !allowedExtensions.includes(suppliedExtension)
  ) {
    throw new UploadError("FILE_EXTENSION_MISMATCH", "文件扩展名与实际内容不匹配");
  }
  if (
    !allowedExtensions.includes(detectedExtension) ||
    (suppliedExtension && !allowedExtensions.includes(suppliedExtension))
  ) {
    throw new UploadError("FILE_EXTENSION_MISMATCH", "文件扩展名与实际内容不匹配");
  }

  return kind;
}

export async function readThumbMaxPx(): Promise<number> {
  const configured = await getSetting<number>("thumbMaxPx");
  if (!configured || !Number.isFinite(configured)) {
    return 480;
  }
  return Math.min(1280, Math.max(128, Math.round(configured)));
}

export async function readThumb2MaxPx(): Promise<number> {
  const configured = await getSetting<number>("thumb2MaxPx");
  if (!configured || !Number.isFinite(configured)) {
    return 320;
  }
  return Math.min(640, Math.max(128, Math.round(configured)));
}

function resizeWebp(
  input: Sharp,
  maxPx: number,
): Promise<{ data: Buffer; info: OutputInfo }> {
  return input
    .clone()
    .rotate()
    .resize({
      width: maxPx,
      height: maxPx,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 78 })
    .toBuffer({ resolveWithObject: true });
}

export async function makeThumbBuffer(buffer: Buffer, maxPx: number) {
  return withSharpLock(async () => {
    const input = sharp(buffer, {
      animated: false,
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    });
    const metadata = await input.metadata();
    if (!metadata.width || !metadata.height) {
      throw new UploadError("INVALID_IMAGE", "无法读取图片尺寸");
    }
    const thumb = await resizeWebp(input, maxPx);
    return {
      dimensions: orientedDimensions(metadata),
      thumb,
    };
  });
}

export async function makeImageThumbs(
  buffer: Buffer,
  maxPx: number,
  max2Px: number,
) {
  return withSharpLock(async () => {
    const input = sharp(buffer, {
      animated: false,
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    });
    const metadata = await input.metadata();
    if (!metadata.width || !metadata.height) {
      throw new UploadError("INVALID_IMAGE", "无法读取图片尺寸");
    }
    const [thumb, thumb2] = await Promise.all([
      resizeWebp(input, maxPx),
      resizeWebp(input, max2Px),
    ]);
    return {
      dimensions: orientedDimensions(metadata),
      thumb,
      thumb2,
    };
  });
}

async function ingestLocal(
  hash: string,
  mime: string,
  extension: string,
  buffer: Buffer,
  kind: UploadKind,
) {
  const originalKey = originalMediaKey(hash, mime, extension);
  const written = [{ driver: "local" as const, key: originalKey }] satisfies WrittenObject[];
  try {
    await getDriver("local").put(originalKey, buffer);
  } catch (error) {
    await getDriver("local").delete(originalKey).catch(() => undefined);
    throw error;
  }

  const dimensions =
    kind === "image"
      ? await readImageDimensions(buffer, mime)
      : { width: null, height: null };

  return {
    originalKey,
    driver: "local" as const,
    dimensions,
    variants: {} satisfies StoredVariants,
    written,
  };
}

function looksLikeImage(file: File) {
  if (file.type.startsWith("image/")) {
    return true;
  }
  return /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name);
}

export async function handleUpload(request: Request): Promise<UploadResult> {
  await loadCosSettings();
  const configuredMax = await getSetting<number>("uploadMaxSizeMB");
  const maxSizeMB =
    configuredMax && Number.isFinite(configuredMax) && configuredMax > 0
      ? Math.min(configuredMax, 50)
      : 10;
  const maxBytes = Math.floor(maxSizeMB * 1024 * 1024);
  const imageStoredMax = Math.min(maxBytes, IMAGE_ORIGINAL_MAX_BYTES);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > IMAGE_INTAKE_MAX_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    throw new UploadError("FILE_TOO_LARGE", "文件不能超过 50 MB", 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new UploadError("INVALID_MULTIPART", "请求必须是 multipart/form-data");
  }

  const files = formData
    .getAll("file")
    .filter((value): value is File => value instanceof File);
  if (files.length !== 1 || files.length > MAX_FILES_PER_REQUEST) {
    throw new UploadError("INVALID_FILE_COUNT", "每次请求只能上传 1 个文件");
  }

  const file = files[0];
  const intakeLimit = looksLikeImage(file) ? IMAGE_INTAKE_MAX_BYTES : maxBytes;
  if (file.size < 1 || file.size > intakeLimit) {
    throw new UploadError(
      "FILE_TOO_LARGE",
      looksLikeImage(file)
        ? "图片不能超过 50 MB"
        : `文件不能超过 ${maxSizeMB} MB`,
      file.size > intakeLimit ? 413 : 400,
    );
  }

  // 显式标注：Node 22+ 的 Buffer 已泛型化，compressImageToMaxBytes 返回的是
  // Buffer<ArrayBufferLike>，不标注会被推断成 Buffer<ArrayBuffer> 而赋值失败。
  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  const { fileTypeFromBuffer } = await import("file-type");
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) {
    throw new UploadError("UNKNOWN_FILE_TYPE", "无法识别文件真实类型");
  }

  const requestedKindValue = formData.get("kind");
  const requestedKind =
    typeof requestedKindValue === "string" && requestedKindValue
      ? requestedKindValue
      : null;
  const kind = validateDetectedType(
    detected.mime,
    detected.ext,
    file.name,
    requestedKind,
  );
  if (kind !== "image" && buffer.length > maxBytes) {
    throw new UploadError(
      "FILE_TOO_LARGE",
      `文件不能超过 ${maxSizeMB} MB`,
      413,
    );
  }
  if (kind === "image" && buffer.length > imageStoredMax) {
    try {
      const compressed = await compressImageToMaxBytes(
        buffer,
        detected.mime,
        imageStoredMax,
      );
      buffer = compressed.buffer;
    } catch (error) {
      if (error instanceof ImageCompressError) {
        throw new UploadError("FILE_TOO_LARGE", error.message, 413);
      }
      throw error;
    }
  }

  const hash = createHash("sha256").update(buffer).digest("hex");
  const duration =
    kind === "audio" ? parseUploadDuration(formData.get("duration")) : null;

  const existing = await prisma.upload.findUnique({ where: { hash } });
  if (existing) {
    if (kind === "image" && !isUploadPending(existing)) {
      await ensureLocalThumb2(existing, buffer).catch((error) => {
        logger.warn("补写二级缩略图失败", {
          hash,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    if (duration) {
      const variants = parseVariants(existing.variants);
      if (parseUploadDuration(variants.duration) == null) {
        await prisma.upload.update({
          where: { id: existing.id },
          data: { variants: JSON.stringify({ ...variants, duration }) },
        });
      }
    }
    const latest = await prisma.upload.findUnique({ where: { hash } });
    return toUploadResult(latest ?? existing);
  }

  const processed = await ingestLocal(
    hash,
    detected.mime,
    detected.ext,
    buffer,
    kind,
  );
  const variants = duration
    ? { ...processed.variants, duration }
    : processed.variants;

  try {
    const row = await prisma.upload.upsert({
      where: { hash },
      create: {
        hash,
        driver: processed.driver,
        key: processed.originalKey,
        mime: detected.mime,
        width: processed.dimensions.width,
        height: processed.dimensions.height,
        size: buffer.length,
        variants: JSON.stringify(variants),
      },
      update: {},
    });
    await pruneLocalMedia().catch((error) => {
      logger.warn("上传后清理本地媒体缓存失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return toUploadResult(row);
  } catch (error) {
    await Promise.all(
      processed.written.map((item) =>
        getDriver(item.driver).delete(item.key).catch(() => undefined),
      ),
    );
    throw error;
  }
}

async function bufferFromObject(object: StorageObject): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = object.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks);
}

export async function readOriginalBuffer(row: Upload): Promise<Buffer> {
  const local = getDriver("local");
  const variants = parseVariants(row.variants);
  const localKeys = [
    ...localOriginalCandidates(row),
    variants.content?.key ?? "",
  ].filter(Boolean);
  const seen = new Set<string>();
  for (const key of localKeys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (await local.stat(key)) {
      return bufferFromObject(await local.get(key));
    }
  }

  await loadCosSettings();
  const cos = getDriver("cos");
  const remoteKeys = [row.key, ...localOriginalCandidates(row)];
  for (const key of remoteKeys) {
    if (seen.has(`cos:${key}`)) {
      continue;
    }
    seen.add(`cos:${key}`);
    try {
      if (await cos.stat(key)) {
        return bufferFromObject(await cos.get(key));
      }
    } catch {
      // try the next candidate
    }
  }

  throw new Error("找不到原图");
}

function variantFromThumb(
  key: string,
  thumb: { info: { width: number; height: number; size: number } },
) {
  return {
    key,
    mime: "image/webp",
    width: thumb.info.width,
    height: thumb.info.height,
    size: thumb.info.size,
  };
}

/** Write a missing local-only secondary thumb. Does not touch COS. */
export async function ensureLocalThumb2(row: Upload, buffer?: Buffer) {
  const key = thumb2MediaKey(row.hash);
  const local = getDriver("local");
  if (await local.stat(key)) {
    const variants = parseVariants(row.variants);
    if (variants.thumb2?.key === key) {
      return;
    }
  }

  const source = buffer ?? (await readOriginalBuffer(row));
  const maxPx = await readThumb2MaxPx();
  const { thumb } = await makeThumbBuffer(source, maxPx);
  await local.delete(key).catch(() => undefined);
  await local.put(key, thumb.data);
  const variants = parseVariants(row.variants);
  await prisma.upload.update({
    where: { id: row.id },
    data: {
      variants: JSON.stringify({
        ...variants,
        thumb2: variantFromThumb(key, thumb),
      }),
    },
  });
}
