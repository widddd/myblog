import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKUP_NAME_PATTERN,
  backupFileName,
  importBackupFileName,
  isBackupFileName,
  isImportBackupFileName,
  isManagedBackupFileName,
  isPlainBackupFileName,
  plainBackupFileName,
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
    "myblog-plain-20260829-223005-deadbeef.tar.gz",
    "myblog-import-20260829-223005-deadbeef.tar.gz",
  ]) {
    assert.equal(isBackupFileName(name), false);
  }
});

test("plain and import backup names are distinct from encrypted names", () => {
  const date = new Date(2026, 7, 29, 22, 30, 5);
  const plain = plainBackupFileName("deadbeef", date);
  const imported = importBackupFileName("cafef00d", date);
  assert.equal(plain, "myblog-plain-20260829-223005-deadbeef.tar.gz");
  assert.equal(imported, "myblog-import-20260829-223005-cafef00d.tar.gz");
  assert.equal(isPlainBackupFileName(plain), true);
  assert.equal(isImportBackupFileName(imported), true);
  assert.equal(isManagedBackupFileName(imported), true);
  assert.equal(isManagedBackupFileName(plain), false);
  assert.equal(isPlainBackupFileName(imported), false);
  assert.equal(isPlainBackupFileName("../myblog-plain-20260829-223005-deadbeef.tar.gz"), false);
});
