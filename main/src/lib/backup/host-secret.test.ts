import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateBackupKey } from "./crypto";
import { BackupError } from "./errors";
import {
  createHostSecretFromPassphrase,
  deriveHostHalf,
  readHostSecret,
  requireHostSecret,
  SALT_BYTES,
  writeHostSecretOnce,
  xorHalves,
} from "./host-secret";

test("XOR of two halves is reversible and neither half is the DEK", () => {
  const hostHalf = generateBackupKey();
  const packageHalf = generateBackupKey();
  const dek = xorHalves(hostHalf, packageHalf);
  assert.equal(dek.equals(hostHalf), false);
  assert.equal(dek.equals(packageHalf), false);
  assert.deepEqual(xorHalves(dek, packageHalf), hostHalf);
  assert.deepEqual(xorHalves(dek, hostHalf), packageHalf);
  assert.throws(
    () => xorHalves(hostHalf, packageHalf.subarray(0, 16)),
    (error: unknown) => error instanceof BackupError && error.code === "INVALID_KEY",
  );
});

test("same passphrase and salt rebuild the host half; a wrong passphrase does not", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-host-secret-"));
  const filePath = path.join(root, "backup-host-secret.json");
  try {
    const passphrase = "unique-setup-passphrase";
    const created = await createHostSecretFromPassphrase(passphrase, filePath);
    assert.equal(created.salt.length, SALT_BYTES);

    const rebuilt = await deriveHostHalf(passphrase, created.salt, {
      n: created.n,
      r: created.r,
      p: created.p,
    });
    assert.deepEqual(rebuilt, created.hostHalf);

    const wrong = await deriveHostHalf("totally-different-pass", created.salt, {
      n: created.n,
      r: created.r,
      p: created.p,
    });
    assert.equal(wrong.equals(created.hostHalf), false);

    await assert.rejects(
      () => createHostSecretFromPassphrase("another-passphrase", filePath),
      (error: unknown) => error instanceof BackupError && error.code === "HOST_SECRET_LOCKED",
    );
    await assert.rejects(
      () => writeHostSecretOnce(created, filePath),
      (error: unknown) => error instanceof BackupError && error.code === "HOST_SECRET_LOCKED",
    );

    const read = await readHostSecret(filePath);
    assert.ok(read);
    assert.deepEqual(read?.hostHalf, created.hostHalf);
    const required = await requireHostSecret(filePath);
    assert.deepEqual(required.hostHalf, created.hostHalf);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requireHostSecret fails when the host file is missing", async () => {
  const missing = path.join(os.tmpdir(), `missing-host-${Date.now()}.json`);
  await assert.rejects(
    () => requireHostSecret(missing, "backup"),
    (error: unknown) => error instanceof BackupError && error.code === "HOST_SECRET_MISSING",
  );
});
