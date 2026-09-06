import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BackupError } from "./errors";
import {
  assertBackupKeyMatches,
  BACKUP_MAGIC_V1,
  BACKUP_MAGIC_V2,
  backupKeysMatch,
  decryptBackupFile,
  encryptBackupFile,
  generateBackupKey,
  hashBackupKey,
  parseBackupKey,
} from "./crypto";

test("backup key hash is stable and rejects a different key", () => {
  const key = generateBackupKey();
  const hash = hashBackupKey(key);
  assert.equal(backupKeysMatch(key, hash), true);
  assert.equal(backupKeysMatch(generateBackupKey(), hash), false);
  assert.throws(
    () => assertBackupKeyMatches(generateBackupKey(), hash),
    (error: unknown) => error instanceof BackupError && error.code === "KEY_MISMATCH",
  );
});

test("parseBackupKey only accepts 32-byte hex", () => {
  const key = generateBackupKey();
  assert.deepEqual(parseBackupKey(`${key.toString("hex")}\n`), key);
  assert.throws(() => parseBackupKey("not-a-key"), BackupError);
});

test("AES-256-GCM roundtrip and rejects tampering", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-crypto-"));
  try {
    const source = path.join(root, "plain.bin");
    const encrypted = path.join(root, "payload.enc");
    const decrypted = path.join(root, "out.bin");
    await writeFile(source, "hello-backup-plain");
    const key = generateBackupKey();
    await encryptBackupFile(source, encrypted, key);
    await decryptBackupFile(encrypted, decrypted, key);
    assert.equal(await readFile(decrypted, "utf8"), "hello-backup-plain");

    const bytes = Buffer.from(await readFile(encrypted));
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = path.join(root, "tampered.enc");
    await writeFile(tampered, bytes);
    await assert.rejects(
      () => decryptBackupFile(tampered, path.join(root, "fail.bin"), key),
      (error: unknown) => error instanceof BackupError && error.code === "DECRYPT_FAILED",
    );

    const v1 = path.join(root, "v1.enc");
    const bytesV2 = Buffer.from(await readFile(encrypted));
    assert.equal(bytesV2.subarray(0, BACKUP_MAGIC_V2.length).equals(BACKUP_MAGIC_V2), true);
    bytesV2.set(BACKUP_MAGIC_V1, 0);
    await writeFile(v1, bytesV2);
    await decryptBackupFile(v1, path.join(root, "from-v1.bin"), key);
    assert.equal(await readFile(path.join(root, "from-v1.bin"), "utf8"), "hello-backup-plain");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
