export const BACKUP_NAME_PATTERN = /^myblog-\d{8}-\d{6}\.tar\.gz$/;

export function isBackupFileName(name: string): boolean {
  return BACKUP_NAME_PATTERN.test(name);
}

export function formatBackupStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function backupFileName(date = new Date()): string {
  return `myblog-${formatBackupStamp(date)}.tar.gz`;
}
