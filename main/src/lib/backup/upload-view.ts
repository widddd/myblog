/**
 * 备份列表「位置」列的**纯展示口径**（无 IO、可在客户端组件里安全 import）。
 *
 * 抽出来的原因：这一列是用户唯一能看出「到底上云没有」的地方——后台是静默上传，
 * 文案错了就没人能发现包其实还只在本机。逻辑留着 component 里就没法单测（P-127 家族）。
 */

export type BackupCosUploadStatus = "queued" | "uploading" | "failed";

export type BackupCosUpload = {
  status: BackupCosUploadStatus;
  /** 已经试过几次（含正在进行的这次） */
  attempts: number;
  updatedAt: string;
  /** 上次失败原因 */
  error?: string;
};

/** 只取渲染位置列需要的那几个字段，方便单测直接造假数据。 */
export type BackupLocationInput = {
  local?: boolean;
  cos?: boolean;
  cosUpload?: BackupCosUpload;
};

/** 上传还在队列里（排队中或正在传）：列表据此自动刷新，按钮据此禁用。 */
export function isCosUploadInFlight(file: BackupLocationInput): boolean {
  return file.cosUpload?.status === "queued" || file.cosUpload?.status === "uploading";
}

/**
 * 「位置」列文案：
 * - `仅 COS`：本地已被轮转清掉，只剩云端副本；
 * - `本地 + COS`：两边都有（上传成功后的稳态）；
 * - `本地 · 上传中…`：后台上传进行中（用户不用等，但要知道它在传）；
 * - `本地 · 上云失败`：传失败，稍后自动重试，也可手动点「重试上传」；
 * - `本地`：没配 COS，或还没排上传。
 */
export function backupLocationLabel(file: BackupLocationInput): string {
  if (file.local === false && file.cos) {
    return "仅 COS";
  }
  if (file.cos) {
    return "本地 + COS";
  }
  if (isCosUploadInFlight(file)) {
    return "本地 · 上传中…";
  }
  if (file.cosUpload?.status === "failed") {
    return "本地 · 上云失败";
  }
  return "本地";
}

/** 手动按钮的文案：失败给「重试上传」，在传就锁住。 */
export function backupUploadActionLabel(file: BackupLocationInput): string {
  if (isCosUploadInFlight(file)) {
    return "上传中…";
  }
  return file.cosUpload?.status === "failed" ? "重试上传" : "上传到 COS";
}
