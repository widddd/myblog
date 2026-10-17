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
 * 视频类上传接受的 MIME（与 `lib/upload/handle.ts` 的 `VIDEO_TYPES` 同一批）。
 *
 * 单独列出来是给「相册视图」用的：Android 客户端按 `accept` 判定弹不弹自有相册
 * （`image/*` 或 `video/*`、**不含 audio**），所以这个列表是站点与宿主之间的契约，
 * 别在组件里手写一份（见 docs/moment-video-spec.md）。
 */
export const VIDEO_UPLOAD_MIME_TYPES = ["video/mp4", "video/webm"] as const;

/** 瞬间 / 相册视图的「图片 + 视频」accept（**不含音频** —— 含音频就落回系统选择器了）。 */
export const MEDIA_UPLOAD_MIME_TYPES = [
  ...IMAGE_UPLOAD_MIME_TYPES,
  ...VIDEO_UPLOAD_MIME_TYPES,
] as const;

/**
 * 站点 ↔ Android 宿主的**录音请求标记**（accept 上的自造 MIME）。
 *
 * 见 docs/moment-audio-spec.md §2.5：App 模式下发布区的麦克风按钮点的是带这个标记的隐藏
 * `<input type="file">`，宿主 `MediaKinds.isVoiceRecordAccept()` 认它 → 弹原生录音界面，
 * 录完（或裁剪完）的文件经既有 `FilePrompt` 通道回给页面，页面用现有上传链路入库。
 *
 * **为什么不用 `audio/*`**：`audio/*` 是媒体库「文件视图」和编辑器「插入音频」在用的 accept，
 * 让宿主把音频类 accept 一律接管成录音器，那两个入口就再也选不到现成音频文件了。
 * 浏览器里永远不会用到这个标记（App 模式由服务端 UA 判定，浏览器走 getUserMedia 卡片）。
 */
export const VOICE_RECORD_MIME = "audio/x-smartblog-voice";

/**
 * App 模式下录制按钮那个隐藏 `<input type="file">` 的 `accept`。
 *
 * 两个信号一起给，谁活下来都能路由到原生录音器（宿主 `MediaKinds.isVoiceRecordRequest()` 两个都认）：
 *  1. 自造标记 `VOICE_RECORD_MIME`（最明确）；
 *  2. `capture` 属性（HTML 标准里"用麦克风录一段"的表达方式）。
 * 标准音频 MIME 一起列上，是为了 accept 在任何浏览器/内核里都是"合法的音频请求"，
 * 不会因为只有一个不认识的自造类型而被整条丢掉。
 */
export const VOICE_RECORD_ACCEPT = `${VOICE_RECORD_MIME},audio/webm,audio/mp4,audio/ogg`;

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
