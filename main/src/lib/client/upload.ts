import { adminJson } from "@/lib/client/admin";
import { fetchCsrfToken, resetCsrfToken } from "@/lib/client/csrf";
import { compressImageFile } from "@/lib/client/compress-image";
import {
  beginTransfer,
  confirmCompressIfNeeded,
  finishTransfer,
  hasActiveTransfers,
  removeTransfer,
  updateTransfer,
  type TransferStage,
} from "@/lib/client/transfer-hud";
import { safeUploadFileName } from "@/lib/upload/file-name";
import { IMAGE_ORIGINAL_MAX_BYTES } from "@/lib/upload/limits";

export type AdminUploadKind = "image" | "video" | "audio";

export type AdminUploadVariant = {
  key: string;
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
  url: string;
};

export type AdminUploadResult = {
  id: number;
  hash: string;
  kind: AdminUploadKind;
  mime: string;
  size: number;
  duration: number | null;
  createdAt: string;
  original: AdminUploadVariant;
  thumb: AdminUploadVariant | null;
  content: AdminUploadVariant | null;
  pending: boolean;
  /** 所属相册（服务端带关系时才有；未归册为 null）。见 docs/albums-spec.md */
  album?: { id: number; title: string; slug: string } | null;
  /** 所属卷（相册内的一"卷"；未分卷为 null 或字段缺失）。不变量：卷必须属于 `album` */
  volumeId?: number | null;
};

type UploadErrorBody = {
  code?: string;
  message?: string;
};

type FinalizePayload =
  | AdminUploadResult
  | { skipped: true; hash: string };

export class UploadCancelledError extends Error {
  constructor() {
    super("已取消上传");
    this.name = "UploadCancelledError";
  }
}

export function editorImageUrl(result: AdminUploadResult): string {
  return result.thumb?.url ?? result.original.url;
}

export type MediaProbe = {
  duration: number | null;
  width: number | null;
  height: number | null;
};

const EMPTY_PROBE: MediaProbe = { duration: null, width: null, height: null };

/**
 * 读本机音视频的元信息（时长 / 画面宽高），**一个字节都不发出去**。
 *
 * 视频在服务端不做探测（站点不装 ffmpeg），所以瞬间里的视频宽高/时长只能由发布端给：
 * 本机文件靠这里，媒体库里已有的文件则用服务端记录（视频记录里没有宽高就按横图兜底）。
 */
export function readMediaProbe(file: File): Promise<MediaProbe> {
  if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
    return Promise.resolve(EMPTY_PROBE);
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const element = document.createElement(
      file.type.startsWith("video/") ? "video" : "audio",
    );
    element.preload = "metadata";
    const finish = (value: MediaProbe) => {
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };
    element.onloadedmetadata = () => {
      finish({
        duration: Number.isFinite(element.duration) ? element.duration : null,
        width: element instanceof HTMLVideoElement && element.videoWidth > 0
          ? element.videoWidth
          : null,
        height: element instanceof HTMLVideoElement && element.videoHeight > 0
          ? element.videoHeight
          : null,
      });
    };
    element.onerror = () => finish(EMPTY_PROBE);
    element.src = objectUrl;
  });
}

export async function readMediaDuration(file: File): Promise<number | null> {
  return (await readMediaProbe(file)).duration;
}

function parseUploadPayload(status: number, text: string): AdminUploadResult {
  let payload: UploadErrorBody & { data?: AdminUploadResult };
  try {
    payload = JSON.parse(text) as UploadErrorBody & { data?: AdminUploadResult };
  } catch {
    throw new Error("上传失败");
  }
  if (status < 200 || status >= 300 || !payload.data) {
    throw new Error(payload.message || "上传失败");
  }
  return payload.data;
}

export type UploadAdminOptions = {
  defer?: boolean;
  /** 媒体库上传预览里选的相册（只对图片生效；不传 = 不归册） */
  albumId?: number;
  /**
   * 上传预览里选的卷（只对图片生效，且必须与 `albumId` 同时给）。
   * 不传 / null = 该相册的「暂不分类」；非法或不属于所选相册时服务端 400（写盘之前就拒绝）。
   */
  volumeId?: number | null;
  /**
   * 音频时长（秒），**调用方已知时直接给**：不传则用 `<audio>` 探一次。
   *
   * 为什么需要它：浏览器录音（MediaRecorder）产出的 WebM 头部**没有时长**，
   * `<audio>.duration` 是 `Infinity`，探测必然拿不到 —— 而发布区明明知道录了多久。
   * 不给的话，媒体库那张音频卡片就会只显示「音频」而不是 `0:02`（见 docs/moment-audio-spec.md §2.4）。
   */
  durationSec?: number | null;
};

async function sendUpload(
  file: File,
  kind: AdminUploadKind,
  albumId: number | undefined,
  volumeId: number | null | undefined,
  onProgress?: (percent: number) => void,
  knownDurationSec?: number | null,
): Promise<AdminUploadResult> {
  const body = new FormData();
  body.set("file", file);
  body.set("kind", kind);
  if (albumId) {
    body.set("albumId", String(albumId));
  }
  // 卷必须挂在相册上：没有相册时不发 volumeId（服务端也会拒，见 lib/upload/handle.ts）
  if (albumId && volumeId) {
    body.set("volumeId", String(volumeId));
  }
  if (kind === "audio") {
    // 已知时长优先（浏览器录的 WebM 头部没有时长，探测只会拿到 Infinity → null）
    const duration =
      knownDurationSec != null && Number.isFinite(knownDurationSec)
        ? knownDurationSec
        : await readMediaDuration(file);
    if (duration != null) {
      body.set("duration", String(duration));
    }
  }

  try {
    return await postUpload(body, await fetchCsrfToken(), onProgress);
  } catch (error) {
    if (!(error instanceof UploadCsrfError)) {
      throw error;
    }
    // 令牌对不上当前会话（cookie 过期 / 会话换过）：重新签发再重传一次
    resetCsrfToken();
    return postUpload(body, await fetchCsrfToken(), onProgress);
  }
}

/** 服务端回 `CSRF_INVALID` 时的内部信号：只用来决定「要不要换令牌重传一次」。 */
class UploadCsrfError extends Error {
  constructor() {
    super("CSRF 校验失败，请刷新后重试");
    this.name = "UploadCsrfError";
  }
}

function isCsrfRejection(status: number, raw: string): boolean {
  if (status !== 403) {
    return false;
  }
  try {
    return (JSON.parse(raw) as UploadErrorBody).code === "CSRF_INVALID";
  } catch {
    return false;
  }
}

function postUpload(
  body: FormData,
  token: string,
  onProgress?: (percent: number) => void,
): Promise<AdminUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("x-csrf-token", token);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (isCsrfRejection(xhr.status, xhr.responseText)) {
        reject(new UploadCsrfError());
        return;
      }
      try {
        resolve(parseUploadPayload(xhr.status, xhr.responseText));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("上传失败"));
    xhr.send(body);
  });
}

function isSkipped(
  payload: FinalizePayload,
): payload is { skipped: true; hash: string } {
  return "skipped" in payload && payload.skipped === true;
}

/**
 * 进度条的**分段口径**（一条 job 一个进度条，必须单调往前）：
 *
 * - 浏览器 → 服务器上传：0 → 55（大图先压缩的话，压缩占 0 → 25、上传占 25 → 55）
 * - 服务端 finalize（生成缩略图 + 上传到云存储）：55 → 100，其中真实进度由
 *   `GET /api/admin/uploads/finalize/progress` 轮询得到（见 lib/uploads/progress.ts）
 *
 * 从前这里是「上传报 0 → 100，然后 55% 一停就是几秒，最后跳到 100」——用户看到的就是
 * 「进度条卡在 55%」。
 */
const COMPRESS_PHASE_END = 25;
export const UPLOAD_PHASE_END = 55;

const FINALIZE_POLL_MS = 400;

type FinalizeProgressView = {
  /** 与 finalize 的两步同名：`derivatives` = 生成缩略图，`replicate` = 上传到云存储 */
  stage: "derivatives" | "replicate";
  percent: number;
};

type FinalizeProgressPayload = {
  data?: { progress: FinalizeProgressView | null };
};

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.max(0, Math.min(100, percent));
}

/** 把某个阶段的 0–100 映射到整条 job 的 [start, end] */
function phasePercent(start: number, end: number, percent: number): number {
  return start + Math.round((clampPercent(percent) / 100) * (end - start));
}

/**
 * finalize 的服务端百分比 → 整条 job 的百分比。
 * `start` = 这一段的起点（媒体库/上传路径是 55；发布时的「处理 hash」job 是 0）。
 * 封顶 99：服务端算完不等于客户端收到回包，最后那 1% 留给请求真正返回。
 */
function finalizeHudPercent(start: number, serverPercent: number): number {
  const span = 100 - start;
  return Math.min(99, start + Math.round((clampPercent(serverPercent) / 100) * span));
}

/**
 * 轮询 finalize 的服务端进度（每 400ms 一次，直到调用方停掉）。
 *
 * 轮询失败（网络抖、进程刚好重启）静默跳过这一拍：它是显示用的，不能反过来打断真正的上传。
 */
function watchFinalizeProgress(
  hash: string,
  onUpdate: (progress: FinalizeProgressView) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  let stopped = false;
  let timer: number | null = null;

  const tick = async () => {
    if (stopped) {
      return;
    }
    try {
      const payload = await adminJson<FinalizeProgressPayload>(
        `/api/admin/uploads/finalize/progress?hash=${encodeURIComponent(hash)}`,
      );
      if (!stopped && payload.data?.progress) {
        onUpdate(payload.data.progress);
      }
    } catch {
      // 显示用，忽略
    }
    if (!stopped) {
      timer = window.setTimeout(() => void tick(), FINALIZE_POLL_MS);
    }
  };

  void tick();

  return () => {
    stopped = true;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}

/** 一条 job 的进度上报器：**只许往前走**（轮询与回调乱序都不该让进度条倒退） */
function createTransferReporter(
  jobId: string | undefined,
  onProgress?: (percent: number) => void,
) {
  let last = 0;
  return (stage: TransferStage, percent: number) => {
    const next = Math.max(last, Math.min(100, Math.round(percent)));
    last = next;
    if (jobId) {
      updateTransfer(jobId, { stage, percent: next });
    }
    onProgress?.(next);
  };
}

export type FinalizeOptions = {
  /**
   * finalize 这一段在整条 job 里从哪个百分比开始。
   * 上传路径（`uploadAdminFile`）已经用掉 0–55，所以从 55 起；发布路径
   * （`finalizeAdminUploads` 的「处理 hash」job）整条 job 就是这一段，从 0 起。
   */
  hudStart?: number;
  onProgress?: (percent: number) => void;
};

export async function finalizeAdminUpload(
  hash: string,
  jobId?: string,
  options: FinalizeOptions = {},
): Promise<AdminUploadResult | null> {
  const start = options.hudStart ?? 0;
  const report = createTransferReporter(jobId, options.onProgress);
  const stageLabel = (stage: FinalizeProgressView["stage"]): TransferStage =>
    stage === "replicate" ? "上传到云存储" : "生成缩略图";

  report("生成缩略图", start);
  const stopWatching = watchFinalizeProgress(hash, (progress) => {
    report(stageLabel(progress.stage), finalizeHudPercent(start, progress.percent));
  });

  try {
    const thumbs = await adminJson<{ data: FinalizePayload }>(
      "/api/admin/uploads/finalize",
      {
        method: "POST",
        body: JSON.stringify({ hash, step: "derivatives" }),
      },
    );
    if (isSkipped(thumbs.data)) {
      return null;
    }
    report("上传到云存储", start);
    const replicated = await adminJson<{ data: FinalizePayload }>(
      "/api/admin/uploads/finalize",
      {
        method: "POST",
        body: JSON.stringify({ hash, step: "replicate" }),
      },
    );
    if (isSkipped(replicated.data)) {
      return thumbs.data as AdminUploadResult;
    }
    report("完成", 100);
    return replicated.data as AdminUploadResult;
  } finally {
    stopWatching();
  }
}

export async function finalizeAdminUploads(hashes: string[]) {
  const unique = [...new Set(hashes.filter(Boolean))];
  const results: AdminUploadResult[] = [];
  for (const hash of unique) {
    const jobId = beginTransfer(`处理 ${hash.slice(0, 8)}…`);
    try {
      const result = await finalizeAdminUpload(hash, jobId);
      finishTransfer(jobId);
      if (result) {
        results.push(result);
      } else {
        removeTransfer(jobId);
      }
    } catch (error) {
      finishTransfer(
        jobId,
        error instanceof Error ? error.message : "处理失败",
      );
      throw error;
    }
  }
  return results;
}

export { hasActiveTransfers };

/**
 * 超长文件名在部分代理/客户端（以及 Android 的临时副本落盘）上会变成上传异常，
 * 而站点最终存储 key 用的是内容 hash，原名并不参与寻址 —— 统一先压短。
 */
function withSafeUploadName(file: File): File {
  const name = safeUploadFileName(file.name, file.type);
  if (name === file.name) {
    return file;
  }
  return new File([file], name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export async function uploadAdminFile(
  file: File,
  kind: AdminUploadKind,
  onProgress?: (percent: number) => void,
  options?: UploadAdminOptions,
): Promise<AdminUploadResult> {
  const safeFile = withSafeUploadName(file);
  const jobId = beginTransfer(safeFile.name);
  const report = createTransferReporter(jobId, onProgress);
  let working = safeFile;
  try {
    let uploadStart = 0;
    if (kind === "image" && working.size > IMAGE_ORIGINAL_MAX_BYTES) {
      report("等待确认", 0);
      const confirmed = await confirmCompressIfNeeded(working.name, working.size);
      if (!confirmed) {
        removeTransfer(jobId);
        throw new UploadCancelledError();
      }
      working = await compressImageFile(
        working,
        IMAGE_ORIGINAL_MAX_BYTES,
        (percent) => {
          report("压缩", phasePercent(0, COMPRESS_PHASE_END, percent));
        },
      );
      uploadStart = COMPRESS_PHASE_END;
    }

    report("上传", uploadStart);
    const ingested = await sendUpload(
      working,
      kind,
      options?.albumId,
      options?.volumeId,
      (percent) => {
        report("上传", phasePercent(uploadStart, UPLOAD_PHASE_END, percent));
      },
      options?.durationSec,
    );

    if (options?.defer) {
      finishTransfer(jobId);
      return ingested;
    }

    if (!ingested.pending) {
      finishTransfer(jobId);
      return ingested;
    }

    const finalized = await finalizeAdminUpload(ingested.hash, jobId, {
      hudStart: UPLOAD_PHASE_END,
      onProgress,
    });
    report("完成", 100);
    finishTransfer(jobId);
    return finalized ?? ingested;
  } catch (error) {
    if (error instanceof UploadCancelledError) {
      throw error;
    }
    finishTransfer(jobId, error instanceof Error ? error.message : "上传失败");
    throw error;
  }
}

export async function uploadAdminFiles(
  files: File[],
  kind: AdminUploadKind,
  onProgress?: (done: number, total: number, percent: number) => void,
  options?: UploadAdminOptions,
): Promise<AdminUploadResult[]> {
  const results: AdminUploadResult[] = [];
  for (const [index, file] of files.entries()) {
    results.push(
      await uploadAdminFile(
        file,
        kind,
        (percent) => {
          onProgress?.(index, files.length, percent);
        },
        options,
      ),
    );
    onProgress?.(index + 1, files.length, 100);
  }
  return results;
}

export function guessUploadKind(file: File): AdminUploadKind | null {
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type.startsWith("video/")) {
    return "video";
  }
  if (file.type.startsWith("audio/")) {
    return "audio";
  }
  const name = file.name.toLowerCase();
  if (/\.(avif|gif|jpe?g|png|webp)$/.test(name)) {
    return "image";
  }
  if (/\.(mp4|webm)$/.test(name)) {
    return "video";
  }
  if (/\.(aac|m4a|mp3|ogg|opus|wav|weba)$/.test(name)) {
    return "audio";
  }
  return null;
}
