import { formatBackupStamp } from "@/lib/backup/filename";

export const UPDATE_NAME_PATTERN = /^myblog-update-\d{8}-\d{6}\.tar\.gz$/;
export const IMPORT_UPDATE_NAME_PATTERN =
  /^myblog-update-import-\d{8}-\d{6}-[0-9a-f]{8}\.tar\.gz$/;

export function isPackedUpdateFileName(name: string): boolean {
  return UPDATE_NAME_PATTERN.test(name);
}

export function isImportUpdateFileName(name: string): boolean {
  return IMPORT_UPDATE_NAME_PATTERN.test(name);
}

export function isManagedUpdateFileName(name: string): boolean {
  return isPackedUpdateFileName(name) || isImportUpdateFileName(name);
}

export function updateFileName(date = new Date()): string {
  return `myblog-update-${formatBackupStamp(date)}.tar.gz`;
}

export function importUpdateFileName(token: string, date = new Date()): string {
  return `myblog-update-import-${formatBackupStamp(date)}-${token}.tar.gz`;
}
