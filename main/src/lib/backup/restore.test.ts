import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import test from "node:test";

import { TarArchive } from "archiver";
import Database from "better-sqlite3";

import { packEncryptedContainer, packV1EncryptedContainer } from "./container";
import { encryptBackupFile, generateBackupKey, hashBackupKey } from "./crypto";
import {
  createHostSecretFromPassphrase,
  requireHostSecret,
  toBackupMetaV2,
  xorHalves,
} from "./host-secret";
import { listTarGzEntryNames } from "./tar";
import { BackupError } from "./errors";
import { BACKUP_DIR, resolveBackupPath } from "./files";
import { isImportBackupFileName } from "./filename";
import {
  applyDatabaseSnapshot,
  isPendingRestoreDue,
  restoreFromBackup,
  stageImportedBackup,
} from "./restore";
import type { StorageDriver } from "@/lib/storage/types";

function createSqliteFile(filePath: string, marker: string) {
  const db = new Database(filePath);
  db.exec("CREATE TABLE restore_probe (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO restore_probe (note) VALUES (?)").run(marker);
  db.close();
}

function readNote(filePath: string) {
  const db = new Database(filePath, { readonly: true });
  try {
    const row = db.prepare("SELECT note FROM restore_probe").get() as {
      note: string;
    };
    return row.note;
  } finally {
    db.close();
  }
}

async function packBackupArchive(
  archivePath: string,
  snapshotPath: string,
  uploads: { key: string; data: Buffer }[],
) {
  const output = createWriteStream(archivePath);
  const archive = new TarArchive({
    gzip: true,
    gzipOptions: { level: 6 },
  });
  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(output);
  archive.file(snapshotPath, { name: "blog.db" });
  for (const upload of uploads) {
    archive.append(upload.data, { name: `uploads/${upload.key}` });
  }
  await archive.finalize();
  await done;
}

class MemoryDriver implements StorageDriver {
  readonly name = "local" as const;
  files = new Map<string, Uint8Array>();

  async put(key: string, data: Uint8Array) {
    this.files.set(key, data);
  }

  async putFile() {
    throw new Error("not used");
  }

  async getToFile() {
    throw new Error("not used");
  }

  async get(): Promise<never> {
    throw new Error("not used");
  }

  getUrl(): string {
    return "";
  }

  async delete(key: string) {
    this.files.delete(key);
  }

  async stat() {
    return null;
  }

  async listKeys() {
    return [...this.files.keys()];
  }

  openReadStream(): Readable {
    throw new Error("not used");
  }
}

test("applyDatabaseSnapshot replaces the db and drops WAL files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-restore-db-"));
  try {
    const snapshot = path.join(root, "snap.db");
    const live = path.join(root, "blog.db");
    createSqliteFile(snapshot, "snapshot");
    createSqliteFile(live, "live");
    await writeFile(`${live}-wal`, "wal");
    await writeFile(`${live}-shm`, "shm");

    await applyDatabaseSnapshot(snapshot, live);
    assert.equal(readNote(live), "snapshot");
    await assert.rejects(() => readFile(`${live}-wal`));
    await assert.rejects(() => readFile(`${live}-shm`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restoreFromBackup writes db and storage keys from an archive", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-restore-full-"));
  const name = "myblog-20260830-120000.tar.gz";
  const archivePath = path.join(BACKUP_DIR, name);
  try {
    const snapshot = path.join(root, "snap.db");
    createSqliteFile(snapshot, "restored");
    await mkdir(BACKUP_DIR, { recursive: true });
    await packBackupArchive(archivePath, snapshot, [
      { key: "images/one.webp", data: Buffer.from("one") },
    ]);

    const live = path.join(root, "blog.db");
    createSqliteFile(live, "before");
    const storage = new MemoryDriver();
    storage.files.set("images/stale.webp", Buffer.from("stale"));

    const result = await restoreFromBackup(name, {
      databasePath: live,
      storage,
      skipSafetySnapshot: true,
    });

    assert.equal(readNote(live), "restored");
    assert.equal(result.restoredUploads, 1);
    assert.equal(result.removedUploads, 1);
    assert.equal(Buffer.from(storage.files.get("images/one.webp") ?? []).toString(), "one");
    assert.equal(storage.files.has("images/stale.webp"), false);
  } finally {
    await rm(archivePath, { force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("restoreFromBackup decrypts an AES container and checks the key hash", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-restore-enc-"));
  const name = "myblog-20260830-130000.tar.gz";
  const archivePath = path.join(BACKUP_DIR, name);
  try {
    const snapshot = path.join(root, "snap.db");
    createSqliteFile(snapshot, "encrypted-restored");
    const inner = path.join(root, "inner.tar.gz");
    await packBackupArchive(inner, snapshot, [
      { key: "images/two.webp", data: Buffer.from("two") },
    ]);
    const key = generateBackupKey();
    const payload = path.join(root, "payload.enc");
    await encryptBackupFile(inner, payload, key);
    await mkdir(BACKUP_DIR, { recursive: true });
    await packV1EncryptedContainer(archivePath, payload, key);

    const live = path.join(root, "blog.db");
    createSqliteFile(live, "before");
    const storage = new MemoryDriver();

    const result = await restoreFromBackup(name, {
      databasePath: live,
      storage,
      skipSafetySnapshot: true,
      expectedKeyHash: hashBackupKey(key),
    });

    assert.equal(readNote(live), "encrypted-restored");
    assert.equal(result.restoredUploads, 1);
    assert.equal(Buffer.from(storage.files.get("images/two.webp") ?? []).toString(), "two");

    await assert.rejects(
      () =>
        restoreFromBackup(name, {
          databasePath: live,
          storage,
          skipSafetySnapshot: true,
          expectedKeyHash: hashBackupKey(generateBackupKey()),
        }),
      (error: unknown) => error instanceof BackupError && error.code === "KEY_MISMATCH",
    );
  } finally {
    await rm(archivePath, { force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("restoreFromBackup opens a v2 split-key package and rejects a wrong passphrase", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-restore-v2-"));
  const name = "myblog-20260830-140000.tar.gz";
  const archivePath = path.join(BACKUP_DIR, name);
  const hostPath = path.join(root, "backup-host-secret.json");
  try {
    const snapshot = path.join(root, "snap.db");
    createSqliteFile(snapshot, "split-restored");
    const inner = path.join(root, "inner.tar.gz");
    await packBackupArchive(inner, snapshot, [
      { key: "images/three.webp", data: Buffer.from("three") },
    ]);

    await createHostSecretFromPassphrase("correct-horse-battery", hostPath);
    const host = await requireHostSecret(hostPath);
    const packageHalf = generateBackupKey();
    const dek = xorHalves(host.hostHalf, packageHalf);
    const payload = path.join(root, "payload.enc");
    await encryptBackupFile(inner, payload, dek);
    await mkdir(BACKUP_DIR, { recursive: true });
    await packEncryptedContainer(archivePath, payload, packageHalf, toBackupMetaV2(host));

    const names = await listTarGzEntryNames(archivePath);
    assert.equal(names.includes("key"), false);
    assert.equal(names.includes("half"), true);
    assert.equal(names.includes("meta.json"), true);

    const live = path.join(root, "blog.db");
    createSqliteFile(live, "before");
    const storage = new MemoryDriver();

    const result = await restoreFromBackup(name, {
      databasePath: live,
      storage,
      skipSafetySnapshot: true,
      hostSecretPath: hostPath,
      expectedKeyHash: hashBackupKey(dek),
    });
    assert.equal(readNote(live), "split-restored");
    assert.equal(result.restoredUploads, 1);

    await restoreFromBackup(name, {
      databasePath: live,
      storage,
      skipSafetySnapshot: true,
      passphrase: "correct-horse-battery",
    });
    assert.equal(readNote(live), "split-restored");

    await assert.rejects(
      () =>
        restoreFromBackup(name, {
          databasePath: live,
          storage,
          skipSafetySnapshot: true,
          passphrase: "wrong-passphrase-value",
        }),
      (error: unknown) => error instanceof BackupError && error.code === "DECRYPT_FAILED",
    );

    await assert.rejects(
      () =>
        restoreFromBackup(name, {
          databasePath: live,
          storage,
          skipSafetySnapshot: true,
          hostSecretPath: path.join(root, "missing-host.json"),
        }),
      (error: unknown) => error instanceof BackupError && error.code === "HOST_SECRET_MISSING",
    );
  } finally {
    await rm(archivePath, { force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("stageImportedBackup accepts plain and encrypted packages", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-import-"));
  const hostPath = path.join(root, "backup-host-secret.json");
  const imported: string[] = [];
  try {
    const snapshot = path.join(root, "snap.db");
    createSqliteFile(snapshot, "import-ok");

    const plainPath = path.join(root, "plain.tar.gz");
    await packBackupArchive(plainPath, snapshot, []);
    const plain = await stageImportedBackup(plainPath);
    imported.push(plain.name);
    assert.equal(plain.format, "plain");
    assert.equal(isImportBackupFileName(plain.name), true);

    const inner = path.join(root, "inner.tar.gz");
    await packBackupArchive(inner, snapshot, []);
    const key = generateBackupKey();
    const v1Payload = path.join(root, "v1.enc");
    await encryptBackupFile(inner, v1Payload, key);
    const v1Path = path.join(root, "v1.tar.gz");
    await packV1EncryptedContainer(v1Path, v1Payload, key);
    const v1 = await stageImportedBackup(v1Path);
    imported.push(v1.name);
    assert.equal(v1.format, "v1");

    await createHostSecretFromPassphrase("import-stage-passphrase", hostPath);
    const host = await requireHostSecret(hostPath);
    const packageHalf = generateBackupKey();
    const dek = xorHalves(host.hostHalf, packageHalf);
    const v2Payload = path.join(root, "v2.enc");
    await encryptBackupFile(inner, v2Payload, dek);

    const v2Path = path.join(root, "v2.tar.gz");
    await packEncryptedContainer(v2Path, v2Payload, packageHalf, toBackupMetaV2(host));
    const v2 = await stageImportedBackup(v2Path, { hostSecretPath: hostPath });
    imported.push(v2.name);
    assert.equal(v2.format, "v2");

    const foreignHost = path.join(root, "other-host.json");
    await createHostSecretFromPassphrase("other-machine-passphrase", foreignHost);
    const foreignPath = path.join(root, "v2-foreign.tar.gz");
    await packEncryptedContainer(foreignPath, v2Payload, packageHalf, toBackupMetaV2(host));
    await assert.rejects(
      () => stageImportedBackup(foreignPath, { hostSecretPath: foreignHost }),
      (error: unknown) => error instanceof BackupError && error.code === "DECRYPT_FAILED",
    );

    const junk = path.join(root, "junk.tar.gz");
    const output = createWriteStream(junk);
    const archive = new TarArchive({ gzip: true, gzipOptions: { level: 6 } });
    const done = new Promise<void>((resolve, reject) => {
      output.on("close", () => resolve());
      output.on("error", reject);
      archive.on("error", reject);
    });
    archive.pipe(output);
    archive.append("nope", { name: "readme.txt" });
    await archive.finalize();
    await done;
    await assert.rejects(
      () => stageImportedBackup(junk),
      (error: unknown) => error instanceof BackupError && error.code === "INVALID_ARCHIVE",
    );
  } finally {
    await Promise.all(
      imported.map((name) => rm(resolveBackupPath(name), { force: true })),
    );
    await rm(root, { recursive: true, force: true });
  }
});

test("isPendingRestoreDue waits for an explicit restart time", () => {
  const now = Date.parse("2026-08-30T05:10:00.000Z");
  assert.equal(
    isPendingRestoreDue(
      { name: "myblog-import-20260830-130327-56f0625e.tar.gz", requestedAt: "2026-08-30T05:03:27.436Z", restartAt: null },
      now,
    ),
    false,
  );
  assert.equal(
    isPendingRestoreDue(
      {
        name: "myblog-import-20260830-130327-56f0625e.tar.gz",
        requestedAt: "2026-08-30T05:03:27.436Z",
        restartAt: "2026-08-30T06:00:00.000Z",
      },
      now,
    ),
    false,
  );
  assert.equal(
    isPendingRestoreDue(
      {
        name: "myblog-import-20260830-130327-56f0625e.tar.gz",
        requestedAt: "2026-08-30T05:03:27.436Z",
        restartAt: "2026-08-30T05:00:00.000Z",
      },
      now,
    ),
    true,
  );
});
