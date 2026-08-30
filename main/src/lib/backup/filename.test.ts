import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKUP_NAME_PATTERN,
  backupFileName,
  isBackupFileName,
} from "./filename";

test("backup file names follow the download whitelist", () => {
  const name = backupFileName(new Date(2026, 7, 29, 22, 30, 5));
  assert.equal(name, "myblog-20260829-223005.tar.gz");
  assert.equal(isBackupFileName(name), true);
  assert.equal(BACKUP_NAME_PATTERN.test(name), true);
});

test("backup file names reject traversal and loose suffixes", () => {
  for (const name of [
    "../blog.db",
    "myblog-20260829-223005.tar.gz.exe",
    "backup.tar.gz",
    "myblog-20260829-223005.tar",
    "myblog-2026-08-29.tar.gz",
    "myblog-20260829-223005.tar.gz/../x",
  ]) {
    assert.equal(isBackupFileName(name), false);
  }
});
