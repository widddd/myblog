/**
 * 上传文件的**文件名收口**（客户端与服务端共用，不 import node:path / DOM）。
 *
 * 两件事：
 *  1. 超长、带奇怪字符的源文件名统一压到安全长度，并保留可识别的扩展名；
 *  2. 扩展名与嗅探出来的媒体类型只要求「同属图片 / 视频 / 音频」，不要求容器完全一致。
 *
 * 第 2 条不是放宽校验：真正的类型永远以 `file-type` 嗅探 + 容器复核为准，并据此决定
 * 存储目录、MIME 和后续处理。`photo.webp` 被下载成 `photo.jpg` 是很常见的站点行为
 * （微博等图片 CDN 会这样），旧逻辑把它当“格式不支持”拒掉；跨媒体类型（例如把视频
 * 改名成 .jpg）仍然会拒绝。
 */

export type UploadMediaKind = "image" | "video" | "audio";

/** 文件名总长上限。存储 key 用的是内容 hash，原名只用于提示与兼容性判断。 */
export const MAX_UPLOAD_FILE_NAME_LENGTH = 80;

const MIME_EXTENSIONS: Record<string, string> = {
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

const EXTENSIONS_BY_KIND: Record<UploadMediaKind, ReadonlySet<string>> = {
  image: new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]),
  video: new Set(["mp4", "webm"]),
  audio: new Set(["aac", "m4a", "mp3", "mp4", "ogg", "opus", "wav", "weba", "webm"]),
};

/** 从文件名提取最后一段扩展名（小写、不含点）；没有就当空串。 */
export function extensionOfUploadName(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) {
    return "";
  }
  return trimmed.slice(dot + 1).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** 这个扩展名是否属于该媒体类型。 */
export function extensionFitsMediaKind(
  extension: string,
  kind: UploadMediaKind,
): boolean {
  return EXTENSIONS_BY_KIND[kind].has(extension.toLowerCase());
}

/** 这个扩展名是否至少属于一种受支持的媒体类型（用来识别“已知但跨类型”的伪装）。 */
export function isKnownMediaExtension(extension: string): boolean {
  const value = extension.toLowerCase();
  return (Object.keys(EXTENSIONS_BY_KIND) as UploadMediaKind[]).some((kind) =>
    EXTENSIONS_BY_KIND[kind].has(value),
  );
}

function fallbackExtension(mime: string | null | undefined): string {
  const base = (mime ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_EXTENSIONS[base] ?? "";
}

/**
 * 生成安全的上传文件名：保留扩展名、去掉路径分隔符/控制字符，总长压到 80。
 * 短的干净文件名原样返回；只有超长或含非法字符时才重写。
 */
export function safeUploadFileName(
  name: string | null | undefined,
  mime?: string | null,
): string {
  const raw = (name ?? "").trim();
  const sourceExt = extensionOfUploadName(raw);
  const extension =
    sourceExt && sourceExt.length <= 8 ? sourceExt : fallbackExtension(mime);
  const dot = raw.lastIndexOf(".");
  const stem =
    dot > 0 && extensionOfUploadName(raw)
      ? raw.slice(0, dot)
      : raw || "upload";
  const cleanedStem =
    stem
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^[.\s-]+|[.\s-]+$/g, "") || `upload-${Date.now()}`;
  const extensionWithDot = extension ? `.${extension}` : "";
  const stemBudget = Math.max(1, MAX_UPLOAD_FILE_NAME_LENGTH - extensionWithDot.length);
  return `${cleanedStem.slice(0, stemBudget)}${extensionWithDot}`;
}

/**
 * 原文件名上的扩展名是否与嗅探类型兼容。
 *
 * - 没写扩展名：兼容（很多移动端分享渠道会去掉后缀）；
 * - 未知扩展名：不兼容（仍按原来的白名单拒绝）；
 * - 图片/视频/音频**同类型**内的容器差异：兼容（例如 .jpg 里其实是 WebP）；
 * - 跨类型：不兼容。
 */
export function suppliedExtensionMatchesKind(
  name: string,
  kind: UploadMediaKind,
): boolean {
  const extension = extensionOfUploadName(name);
  if (!extension) {
    return true;
  }
  return isKnownMediaExtension(extension) && extensionFitsMediaKind(extension, kind);
}
