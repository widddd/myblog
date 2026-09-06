import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TarArchive } from "archiver";
import Database from "better-sqlite3";

import { inspectBackupPackage } from "./inspect";

function createSqliteFile(filePath: string) {
  const db = new Database(filePath);
  db.exec("CREATE TABLE restore_probe (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO restore_probe (note) VALUES (?)").run("ok");
  db.close();
}

async function packPlain(archivePath: string, snapshotPath: string, meta?: object) {
  const output = createWriteStream(archivePath);
  const archive = new TarArchive({ gzip: true, gzipOptions: { level: 6 } });
  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(output);
  if (meta) {
    archive.append(`${JSON.stringify(meta)}\n`, { name: "meta.json" });
  }
  archive.file(snapshotPath, { name: "blog.db" });
  await archive.finalize();
  await done;
}

test("inspectBackupPackage reads channel from a plain package meta.json", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-inspect-"));
  try {
    const snapshot = path.join(root, "blog.db");
    createSqliteFile(snapshot);
    const archivePath = path.join(root, "plain.tar.gz");
    await packPlain(archivePath, snapshot, { kind: "plain", channel: "alpha", version: null });
    const view = await inspectBackupPackage(archivePath, path.join(root, "peek"));
    assert.equal(view.encrypted, false);
    assert.equal(view.format, "plain");
    assert.equal(view.channel, "alpha");
    assert.equal(view.releaseLabel, "0.1.0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inspectBackupPackage treats old plain packages as unknown version", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-inspect-old-"));
  try {
    const snapshot = path.join(root, "blog.db");
    createSqliteFile(snapshot);
    const archivePath = path.join(root, "plain.tar.gz");
    await packPlain(archivePath, snapshot);
    const view = await inspectBackupPackage(archivePath, path.join(root, "peek"));
    assert.equal(view.encrypted, false);
    assert.equal(view.releaseLabel, "未知版本");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
