import { adminJson } from "@/lib/client/admin";
import { fetchCsrfToken } from "@/lib/client/csrf";
import { compressImageFile } from "@/lib/client/compress-image";
import {
  beginTransfer,
  confirmCompressIfNeeded,
  finishTransfer,
  hasActiveTransfers,
  removeTransfer,
  updateTransfer,
} from "@/lib/client/transfer-hud";
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
};

type UploadErrorBody = {
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

export function readMediaDuration(file: File): Promise<number | null> {
  if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const element = document.createElement(
      file.type.startsWith("video/") ? "video" : "audio",
    );
    element.preload = "metadata";
    const finish = (value: number | null) => {
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };
    element.onloadedmetadata = () => {
      finish(Number.isFinite(element.duration) ? element.duration : null);
    };
    element.onerror = () => finish(null);
    element.src = objectUrl;
  });
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
};

async function sendUpload(
  file: File,
  kind: AdminUploadKind,
  onProgress?: (percent: number) => void,
): Promise<AdminUploadResult> {
  const token = await fetchCsrfToken();
  const body = new FormData();
  body.set("file", file);
  body.set("kind", kind);
  if (kind === "audio") {
    const duration = await readMediaDuration(file);
    if (duration != null) {
      body.set("duration", String(duration));
    }
  }

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

export async function finalizeAdminUpload(
  hash: string,
  jobId?: string,
): Promise<AdminUploadResult | null> {
  if (jobId) {
    updateTransfer(jobId, { stage: "生成缩略图", percent: 12 });
  }
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
  if (jobId) {
    updateTransfer(jobId, { stage: "上传到云存储", percent: 55 });
  }
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
  if (jobId) {
    updateTransfer(jobId, { percent: 100, stage: "完成" });
  }
  return replicated.data as AdminUploadResult;
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

export async function uploadAdminFile(
  file: File,
  kind: AdminUploadKind,
  onProgress?: (percent: number) => void,
  options?: UploadAdminOptions,
): Promise<AdminUploadResult> {
  const jobId = beginTransfer(file.name);
  let working = file;
  try {
    if (kind === "image" && working.size > IMAGE_ORIGINAL_MAX_BYTES) {
      updateTransfer(jobId, { stage: "等待确认", percent: 0 });
      const confirmed = await confirmCompressIfNeeded(working.name, working.size);
      if (!confirmed) {
        removeTransfer(jobId);
        throw new UploadCancelledError();
      }
      updateTransfer(jobId, { stage: "压缩", percent: 0 });
      working = await compressImageFile(
        working,
        IMAGE_ORIGINAL_MAX_BYTES,
        (percent) => {
          updateTransfer(jobId, { stage: "压缩", percent });
          onProgress?.(Math.round(percent * 0.35));
        },
      );
    }

    updateTransfer(jobId, { stage: "上传", percent: 0 });
    const ingested = await sendUpload(working, kind, (percent) => {
      updateTransfer(jobId, { stage: "上传", percent });
      onProgress?.(percent);
    });

    if (options?.defer) {
      finishTransfer(jobId);
      return ingested;
    }

    if (!ingested.pending) {
      finishTransfer(jobId);
      return ingested;
    }

    const finalized = await finalizeAdminUpload(ingested.hash, jobId);
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
