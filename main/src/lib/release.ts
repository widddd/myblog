/** App channel and public mark. UI and backup/update stamps all read from here. */
export const APP_CHANNEL = "alpha";
export const APP_VERSION = "0.1.1";
export const APP_RELEASE_LABEL = "0.1.1";

export type BackupReleaseInfo = {
  channel: string | null;
  version: string | null;
  label: string;
};

export function currentBackupRelease(): BackupReleaseInfo {
  return {
    channel: APP_CHANNEL,
    version: APP_VERSION,
    label: APP_RELEASE_LABEL,
  };
}

export function backupReleaseLabel(
  channel: string | null | undefined,
  version: string | null | undefined,
): string {
  const trimmedChannel = typeof channel === "string" ? channel.trim() : "";
  const trimmedVersion = typeof version === "string" ? version.trim() : "";
  if (!trimmedChannel && !trimmedVersion) {
    return "未知版本";
  }
  if (trimmedChannel === APP_CHANNEL && !trimmedVersion) {
    return APP_RELEASE_LABEL;
  }
  if (trimmedChannel && trimmedVersion) {
    return `${trimmedChannel} ${trimmedVersion}`;
  }
  return trimmedVersion || trimmedChannel;
}

export function parseOptionalReleaseField(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}
