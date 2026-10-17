import { createHash } from "node:crypto";

import type { Upload } from "@prisma/client";
import sharp, { type OutputInfo, type Sharp } from "sharp";

import { revalidateAlbumContent } from "@/lib/admin/revalidate";
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
  type StorageDriverName,
  type StorageObject,
} from "@/lib/storage";
import {
  audioOnlyContainer,
} from "@/lib/upload/audio-container";
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
  resolveUploadMaxBytes,
} from "@/lib/upload/limits";
import {
  extensionOfUploadName,
  suppliedExtensionMatchesKind,
} from "@/lib/upload/file-name";
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

/** 媒体所属相册的引用（媒体库卡片显示、批量归册用；见 docs/albums-spec.md）。 */
export type UploadAlbumRef = {
  id: number;
  title: string;
  slug: string;
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
  /** 未归册为 null。列表查询带上关系时才有值（见 lib/uploads/admin.ts） */
  album: UploadAlbumRef | null;
  /** 相册内的一"卷"；未分卷（或没归册）为 null。不变量：卷必须属于 `album` */
  volumeId: number | null;
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

export function toUploadResult(
  row: Upload,
  album: UploadAlbumRef | null = null,
): UploadResult {
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
    album,
    volumeId: row.volumeId,
  };
}

/** 嗅探 + 容器修正之后，这一份文件**最终**按什么类型入库。 */
type DetectedMedia = {
  kind: UploadKind;
  mime: string;
  extension: string;
};

function validateDetectedType(
  buffer: Buffer,
  mime: string,
  detectedExtension: string,
  fileName: string,
  requestedKind: string | null,
): DetectedMedia {
  const detectedKind: UploadKind | null = IMAGE_TYPES[mime]
    ? "image"
    : VIDEO_TYPES[mime]
      ? "video"
      : AUDIO_TYPES[mime]
        ? "audio"
        : null;

  if (!detectedKind) {
    throw new UploadError(
      "UNSUPPORTED_MEDIA_TYPE",
      "只允许上传受支持的图片、视频或音频",
    );
  }

  /**
   * 纯音频容器修正（见 docs/moment-audio-spec.md §2.3）：
   * `file-type` 把音频-only 的 WebM 判成 `video/webm`、把 Android 录的 M4A 判成 `video/mp4`，
   * 于是「上传录音」这条路必然 400。这里**只在调用方明确声明 audio 时**按容器结构复核一次：
   * 容器里确实有音频轨、且没有视频轨 → 按音频收；否则走下面的不一致分支正常拒绝。
   */
  const audioOnly =
    requestedKind === "audio" && detectedKind === "video"
      ? audioOnlyContainer(buffer)
      : null;
  const kind: UploadKind = audioOnly ? "audio" : detectedKind;
  const effectiveMime = audioOnly ? audioOnly.mime : mime;
  const effectiveExtension = audioOnly ? audioOnly.ext : detectedExtension;

  if (requestedKind && requestedKind !== kind) {
    throw new UploadError("MEDIA_KIND_MISMATCH", "上传类型与文件内容不匹配");
  }

  const allowedExtensions =
    kind === "image"
      ? IMAGE_TYPES[effectiveMime]
      : kind === "video"
        ? VIDEO_TYPES[effectiveMime]
        : AUDIO_TYPES[effectiveMime];
  const suppliedExtension = extensionOfUploadName(fileName);
  /**
   * 真实类型以嗅探结果为准；文件名只做**同媒体类型**的一致性检查：
   * - 嗅探到的有效扩展名必须在该 MIME 的白名单里；
   * - 原文件名若带后缀，后缀必须属于同一媒体类型（图/视频/音频）。
   *
   * 这样 `photo.webp` 被图床命名为 `photo.jpg` 仍可上传；把视频改名成 `.jpg` 依旧拒绝。
   * 旧逻辑要求两个扩展名逐字一致，导致微博等“错后缀图片”被误报成格式不支持。
   */
  if (
    !allowedExtensions ||
    !allowedExtensions.includes(effectiveExtension) ||
    (suppliedExtension && !suppliedExtensionMatchesKind(fileName, kind))
  ) {
    throw new UploadError("FILE_EXTENSION_MISMATCH", "文件扩展名与实际内容不匹配");
  }

  return { kind, mime: effectiveMime, extension: effectiveExtension };
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

/**
 * 上传时可选带上相册归属（媒体库上传预览里的「加入相册」下拉）。
 *
 * 非法 / 已不存在的相册**在写盘之前**就拒绝：文件已经落盘之后才报错会留下孤儿文件
 * （磁盘上有原图、库里没有记录，媒体库看不见也删不掉）。
 * 只有图片会被归册（相册只收 image/*，见 docs/albums-spec.md D9），调用方按 kind 传 null。
 */
async function resolveUploadAlbum(
  raw: FormDataEntryValue | null,
): Promise<UploadAlbumRef | null> {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new UploadError("ALBUM_NOT_FOUND", "相册不存在，请刷新页面重试", 404);
  }
  const album = await prisma.album.findUnique({
    where: { id },
    select: { id: true, title: true, slug: true },
  });
  if (!album) {
    throw new UploadError("ALBUM_NOT_FOUND", "相册不存在，请刷新页面重试", 404);
  }
  return album;
}

/** 卷归属的引用（只用来记 id；写库只需要 id）。 */
type UploadVolumeRef = { id: number };

/**
 * 上传时可选带上卷归属（媒体库上传预览里的「归入卷」下拉）。
 *
 * 与相册同一口径：**写盘之前**校验，非法直接拒绝、不留孤儿文件。
 * **不变量：卷必须属于所选相册**（数据库没有跨列约束，只能在这里守，见 lib/albums/admin.ts）；
 * 没选相册却带了卷，同样在写盘前拒掉。
 */
async function resolveUploadVolume(
  raw: FormDataEntryValue | null,
  album: UploadAlbumRef | null,
): Promise<UploadVolumeRef | null> {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  if (!album) {
    throw new UploadError("VOLUME_WITHOUT_ALBUM", "请先选择相册，再选择卷", 400);
  }
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new UploadError("VOLUME_NOT_FOUND", "这一卷不存在，请刷新页面重试", 404);
  }
  const volume = await prisma.albumVolume.findUnique({
    where: { id },
    select: { id: true, albumId: true },
  });
  if (!volume) {
    throw new UploadError("VOLUME_NOT_FOUND", "这一卷不存在，请刷新页面重试", 404);
  }
  if (volume.albumId !== album.id) {
    throw new UploadError("VOLUME_ALBUM_MISMATCH", "这一卷不属于所选相册", 400);
  }
  return { id: volume.id };
}

export async function handleUpload(request: Request): Promise<UploadResult> {
  await loadCosSettings();
  // 换算逻辑与 GET /api/upload/limits 共用（以前这段只写在这里，接口再抄一遍就会漂）
  const maxBytes = resolveUploadMaxBytes(await getSetting<number>("uploadMaxSizeMB"));
  // 仅用于错误文案；Setting 被校验为 1..50 的整数，所以回推是精确的
  const maxSizeMB = maxBytes / (1024 * 1024);
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
  const media = validateDetectedType(
    buffer,
    detected.mime,
    detected.ext,
    file.name,
    requestedKind,
  );
  const kind = media.kind;
  if (kind !== "image" && buffer.length > maxBytes) {
    throw new UploadError(
      "FILE_TOO_LARGE",
      `文件不能超过 ${maxSizeMB} MB`,
      413,
    );
  }
  // 相册只收图片；视频/音频即使带了 albumId 也忽略（在写盘前就定下来）
  const album = kind === "image" ? await resolveUploadAlbum(formData.get("albumId")) : null;
  // 卷同样只对图片、同样在写盘前定下来（带卷却没带相册 / 卷不属于该相册都在这儿拒掉）
  const volume =
    kind === "image" ? await resolveUploadVolume(formData.get("volumeId"), album) : null;
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
    if (album && existing.mime.startsWith("image/")) {
      // 同内容去重：库里已有这张图时，上传预览里选的相册 / 卷照样要生效。
      // 卷必须与相册**一起**写（没选卷就写 null）：只改 albumId 会把旧相册的卷留在图上，
      // 破坏「卷必须属于所在相册」这条不变量（见 lib/albums/admin.ts 文件头）。
      await prisma.upload.update({
        where: { id: existing.id },
        data: { albumId: album.id, volumeId: volume?.id ?? null },
      });
      revalidateAlbumContent(album.slug);
    }
    const latest = await prisma.upload.findUnique({ where: { hash } });
    return toUploadResult(latest ?? existing, album);
  }

  const processed = await ingestLocal(
    hash,
    media.mime,
    media.extension,
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
        // 用容器修正之后的 mime：音频-only 的 WebM/M4A 在这里就已经是 audio/*（见 validateDetectedType）
        mime: media.mime,
        width: processed.dimensions.width,
        height: processed.dimensions.height,
        size: buffer.length,
        variants: JSON.stringify(variants),
        albumId: album?.id ?? null,
        volumeId: volume?.id ?? null,
      },
      update: {},
    });
    await pruneLocalMedia().catch((error) => {
      logger.warn("上传后清理本地媒体缓存失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    if (album) {
      // 相册归属是相册页的跨表数据 → 立即过期（P-089）
      revalidateAlbumContent(album.slug);
    }
    return toUploadResult(row, album);
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
