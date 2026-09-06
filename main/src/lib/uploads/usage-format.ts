export type MediaUsageKind = "original" | "thumb" | "thumb2";

export type MediaUsageBucket = {
  bytes: number;
  count: number;
};

export type LocalMediaUsage = {
  total: MediaUsageBucket;
  original: MediaUsageBucket;
  thumb: MediaUsageBucket;
  thumb2: MediaUsageBucket;
};

export type LocalBackupUsage = {
  bytes: number;
  count: number;
  files: Array<{ name: string; size: number }>;
};

export type LocalStorageUsage = {
  media: LocalMediaUsage;
  backups: LocalBackupUsage;
};

export function classifyLocalMediaKey(key: string): MediaUsageKind {
  if (key.startsWith("images/thumbs2/")) {
    return "thumb2";
  }
  if (
    key.startsWith("images/thumbs/") ||
    /(?:^|\/)[a-f0-9]{64}-thumb\.webp$/.test(key)
  ) {
    return "thumb";
  }
  return "original";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function usagePercent(usedBytes: number, maxMB: number): number {
  const cap = maxMB * 1024 * 1024;
  if (!Number.isFinite(usedBytes) || usedBytes <= 0 || !Number.isFinite(cap) || cap <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((usedBytes / cap) * 100));
}
