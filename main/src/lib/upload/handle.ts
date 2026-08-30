import { createHash } from "node:crypto";
import path from "node:path";

import type { Upload } from "@prisma/client";
import sharp, { type Metadata } from "sharp";

import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getDriver } from "@/lib/storage";

const MAX_FILES_PER_REQUEST = 1;
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;

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

type UploadKind = "image" | "video";

type StoredVariant = {
  key: string;
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
};

type StoredVariants = {
  thumb?: StoredVariant;
  content?: StoredVariant;
};

export type UploadResult = {
  id: number;
  hash: string;
  kind: UploadKind;
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
  original: StoredVariant & { url: string };
  thumb: (StoredVariant & { url: string }) | null;
  content: (StoredVariant & { url: string }) | null;
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

const globalForSharp = globalThis as typeof globalThis & {
  myblogSharpQueue?: Promise<void>;
  myblogSharpConfigured?: boolean;
};

if (!globalForSharp.myblogSharpConfigured) {
  sharp.cache({ memory: 32, files: 0, items: 50 });
  sharp.concurrency(1);
  globalForSharp.myblogSharpConfigured = true;
}

async function withSharpLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalForSharp.myblogSharpQueue ?? Promise.resolve();
  let release: () => void = () => {};
  globalForSharp.myblogSharpQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

function parseVariants(raw: string): StoredVariants {
  try {
    const parsed = JSON.parse(raw) as StoredVariants;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function withUrl(variant: StoredVariant, driverName: string) {
  return {
    ...variant,
    url: getDriver(driverName).getUrl(variant.key),
  };
}

function toUploadResult(row: Upload): UploadResult {
  const driver = getDriver(row.driver);
  const variants = parseVariants(row.variants);
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
    kind: row.mime.startsWith("video/") ? "video" : "image",
    mime: row.mime,
    width: row.width,
    height: row.height,
    size: row.size,
    original: { ...original, url: driver.getUrl(row.key) },
    thumb: variants.thumb ? withUrl(variants.thumb, row.driver) : null,
    content: variants.content ? withUrl(variants.content, row.driver) : null,
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
      : null;

  if (!kind) {
    throw new UploadError("UNSUPPORTED_MEDIA_TYPE", "只允许上传受支持的图片或视频");
  }
  if (requestedKind && requestedKind !== kind) {
    throw new UploadError("MEDIA_KIND_MISMATCH", "上传类型与文件内容不匹配");
  }

  const allowedExtensions = kind === "image" ? IMAGE_TYPES[mime] : VIDEO_TYPES[mime];
  const suppliedExtension = extensionOf(fileName);
  if (
    !allowedExtensions.includes(detectedExtension) ||
    !allowedExtensions.includes(suppliedExtension)
  ) {
    throw new UploadError("FILE_EXTENSION_MISMATCH", "文件扩展名与实际内容不匹配");
  }

  return kind;
}

function orientedDimensions(metadata: Metadata) {
  const swap = metadata.orientation ? metadata.orientation >= 5 : false;
  return {
    width: swap ? (metadata.height ?? null) : (metadata.width ?? null),
    height: swap ? (metadata.width ?? null) : (metadata.height ?? null),
  };
}

async function processImage(hash: string, extension: string, buffer: Buffer) {
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

    const dimensions = orientedDimensions(metadata);
    const thumb = await input
      .clone()
      .rotate()
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });
    const content = await input
      .clone()
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true });

    const originalKey = `images/${hash}-original.${extension}`;
    const thumbKey = `images/${hash}-thumb.webp`;
    const contentKey = `images/${hash}-content.webp`;
    const driver = getDriver("local");

    await Promise.all([
      driver.put(originalKey, buffer),
      driver.put(thumbKey, thumb.data),
      driver.put(contentKey, content.data),
    ]);

    return {
      originalKey,
      dimensions,
      variants: {
        thumb: {
          key: thumbKey,
          mime: "image/webp",
          width: thumb.info.width,
          height: thumb.info.height,
          size: thumb.info.size,
        },
        content: {
          key: contentKey,
          mime: "image/webp",
          width: content.info.width,
          height: content.info.height,
          size: content.info.size,
        },
      } satisfies StoredVariants,
      writtenKeys: [originalKey, thumbKey, contentKey],
    };
  });
}

async function processVideo(hash: string, extension: string, buffer: Buffer) {
  const originalKey = `videos/${hash}-original.${extension}`;
  await getDriver("local").put(originalKey, buffer);
  return {
    originalKey,
    dimensions: { width: null, height: null },
    variants: {} satisfies StoredVariants,
    writtenKeys: [originalKey],
  };
}

export async function handleUpload(request: Request): Promise<UploadResult> {
  const configuredMax = await getSetting<number>("uploadMaxSizeMB");
  const maxSizeMB =
    configuredMax && Number.isFinite(configuredMax) && configuredMax > 0
      ? Math.min(configuredMax, 100)
      : 10;
  const maxBytes = Math.floor(maxSizeMB * 1024 * 1024);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > maxBytes + MULTIPART_OVERHEAD_BYTES
  ) {
    throw new UploadError(
      "FILE_TOO_LARGE",
      `文件不能超过 ${maxSizeMB} MB`,
      413,
    );
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
  if (file.size < 1 || file.size > maxBytes) {
    throw new UploadError(
      "FILE_TOO_LARGE",
      `文件不能超过 ${maxSizeMB} MB`,
      file.size > maxBytes ? 413 : 400,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
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
  const hash = createHash("sha256").update(buffer).digest("hex");

  const existing = await prisma.upload.findUnique({ where: { hash } });
  if (existing) {
    return toUploadResult(existing);
  }

  const processed =
    kind === "image"
      ? await processImage(hash, detected.ext, buffer)
      : await processVideo(hash, detected.ext, buffer);

  try {
    const row = await prisma.upload.upsert({
      where: { hash },
      create: {
        hash,
        driver: "local",
        key: processed.originalKey,
        mime: detected.mime,
        width: processed.dimensions.width,
        height: processed.dimensions.height,
        size: file.size,
        variants: JSON.stringify(processed.variants),
      },
      update: {},
    });
    return toUploadResult(row);
  } catch (error) {
    await Promise.all(
      processed.writtenKeys.map((key) =>
        getDriver("local").delete(key).catch(() => undefined),
      ),
    );
    throw error;
  }
}
