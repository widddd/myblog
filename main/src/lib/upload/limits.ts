/** Stored original images must be at or below this size (user-facing 10 MB cap). */
export const IMAGE_ORIGINAL_MAX_BYTES = 10 * 1024 * 1024;

/** Incoming image may be larger; it is compressed down to IMAGE_ORIGINAL_MAX_BYTES. */
export const IMAGE_INTAKE_MAX_BYTES = 50 * 1024 * 1024;

export const IMAGE_HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * 「一次最多选/传几张图」的**兜底值**（纯常量、不 import 服务端模块，客户端也能引用）。
 *
 * 真正生效的值来自后台 Setting `uploadMaxImagesPerBatch`（默认就是它），走 `resolveMaxImagesPerBatch()`；
 * 这样管理员在后台改一次，站点与 Android 客户端（经 `GET /api/upload/limits`）同时跟着变。
 */
export const DEFAULT_MAX_IMAGES_PER_BATCH = 9;

/** 图片类上传接受的 MIME —— 与各入口 `accept="…"` 保持一致 */
export const IMAGE_UPLOAD_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/**
 * 后台 Setting `uploadMaxSizeMB` → 实际生效的单文件字节上限。
 *
 * **`handleUpload()` 与 `GET /api/upload/limits` 共用这一个函数**：夹在 1..50 MB、非法值回退 10。
 * 以前这段判断只写在 `handle.ts` 里，接口再抄一遍就是 P-004「配置多源不同步」的翻版。
 */
export function resolveUploadMaxBytes(configuredMaxMB: unknown): number {
  const value =
    typeof configuredMaxMB === "number" ? configuredMaxMB : Number(configuredMaxMB);
  const maxSizeMB =
    Number.isFinite(value) && value > 0 ? Math.min(value, 50) : 10;
  return Math.floor(maxSizeMB * 1024 * 1024);
}

/** 后台 Setting `uploadMaxImagesPerBatch` → 实际生效的「一次最多几张」。夹在 1..50，非法值回退默认 9。 */
export function resolveMaxImagesPerBatch(configured: unknown): number {
  const value = typeof configured === "number" ? configured : Number(configured);
  return Number.isFinite(value) && value >= 1 && value <= 50
    ? Math.floor(value)
    : DEFAULT_MAX_IMAGES_PER_BATCH;
}

/** `GET /api/upload/limits` 的响应体（客户端据此限制选择） */
export type UploadLimits = {
  /** 一次最多选几张图 */
  maxImages: number;
  /** 单文件超过这个字节数会被服务端直接拒（413）；更大的图片由站点压缩，不受此限 */
  maxBytes: number;
  /** 图片类上传接受的 MIME */
  imageTypes: string[];
};
