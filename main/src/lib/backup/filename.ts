export const BACKUP_NAME_PATTERN = /^myblog-\d{8}-\d{6}\.tar\.gz$/;
export const PLAIN_BACKUP_NAME_PATTERN =
  /^myblog-plain-\d{8}-\d{6}-[0-9a-f]{8}\.tar\.gz$/;
export const IMPORT_BACKUP_NAME_PATTERN =
  /^myblog-import-\d{8}-\d{6}-[0-9a-f]{8}\.tar\.gz$/;

export function isBackupFileName(name: string): boolean {
  return BACKUP_NAME_PATTERN.test(name);
}

export function isPlainBackupFileName(name: string): boolean {
  return PLAIN_BACKUP_NAME_PATTERN.test(name);
}

export function isImportBackupFileName(name: string): boolean {
  return IMPORT_BACKUP_NAME_PATTERN.test(name);
}

export function isManagedBackupFileName(name: string): boolean {
  return isBackupFileName(name) || isImportBackupFileName(name);
}

export function formatBackupStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function backupFileName(date = new Date()): string {
  return `myblog-${formatBackupStamp(date)}.tar.gz`;
}

export function plainBackupFileName(token: string, date = new Date()): string {
  return `myblog-plain-${formatBackupStamp(date)}-${token}.tar.gz`;
}

export function importBackupFileName(token: string, date = new Date()): string {
  return `myblog-import-${formatBackupStamp(date)}-${token}.tar.gz`;
}
