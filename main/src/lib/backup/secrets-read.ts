import { existsSync } from "node:fs";

import Database from "better-sqlite3";

import { isManagedBackupFileName } from "@/lib/backup/filename";

/** 进程已停时只读当前库里的哈希；表不存在或库不在则返回 null。参数化查询。 */
export function readKeyHashFromDatabase(
  databasePath: string,
  name: string,
): string | null {
  if (!isManagedBackupFileName(name) || !existsSync(databasePath)) {
    return null;
  }

  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const table = db
      .prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = ? AND name = ?",
      )
      .get("table", "BackupSecret") as { ok: number } | undefined;
    if (!table) {
      return null;
    }
    const row = db
      .prepare("SELECT keyHash FROM BackupSecret WHERE name = ?")
      .get(name) as { keyHash: string } | undefined;
    return row?.keyHash ?? null;
  } finally {
    db.close();
  }
}
