import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { gzip as gzipCallback } from "node:zlib";

import { TarArchive } from "archiver";
import Database from "better-sqlite3";

import { BackupError } from "./errors";
import { classifyArchiveEntry, extractBackupArchive } from "./tar";

const gzip = promisify(gzipCallback);

function createSqliteFile(filePath: string, marker: string) {
  const db = new Database(filePath);
  db.exec("CREATE TABLE restore_probe (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO restore_probe (note) VALUES (?)").run(marker);
  db.close();
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
  archive.append(`${JSON.stringify({ kind: "plain", channel: "alpha" })}\n`, {
    name: "meta.json",
  });
  archive.file(snapshotPath, { name: "blog.db" });
  for (const upload of uploads) {
    archive.append(upload.data, { name: `uploads/${upload.key}` });
  }
  await archive.finalize();
  await done;
}

function ustarHeader(name: string, size: number, typeflag = "0"): Buffer {
  const header = Buffer.alloc(512);
  Buffer.from(name).copy(header, 0);
  Buffer.from("0000644\0").copy(header, 100);
  Buffer.from("0000000\0").copy(header, 108);
  Buffer.from("0000000\0").copy(header, 116);
  Buffer.from(`${size.toString(8).padStart(11, "0")}\0`).copy(header, 124);
  Buffer.from("00000000000\0").copy(header, 136);
  header[156] = typeflag.charCodeAt(0);
  Buffer.from("ustar\0").copy(header, 257);
  Buffer.from("00").copy(header, 263);
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (let i = 0; i < 512; i += 1) {
    sum += header[i];
  }
  Buffer.from(`${sum.toString(8).padStart(6, "0")}\0 `).copy(header, 148);
  return header;
}

test("classifyArchiveEntry only allows blog.db, meta.json and safe upload keys", () => {
  assert.deepEqual(classifyArchiveEntry("blog.db"), { kind: "db" });
  assert.deepEqual(classifyArchiveEntry("meta.json"), { kind: "meta" });
  assert.deepEqual(classifyArchiveEntry("uploads/images/a-original.webp"), {
    kind: "upload",
    key: "images/a-original.webp",
  });
  for (const name of [
    "../blog.db",
    "/blog.db",
    "uploads/../secret",
    "uploads\\evil",
    "etc/passwd",
    "uploads/",
  ]) {
    assert.equal(classifyArchiveEntry(name), null);
  }
});

test("extractBackupArchive reads an archiver package", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-tar-"));
  try {
    const snapshotPath = path.join(root, "source.db");
    createSqliteFile(snapshotPath, "from-archive");
    const archivePath = path.join(root, "pack.tar.gz");
    await packBackupArchive(archivePath, snapshotPath, [
      { key: "images/hello.webp", data: Buffer.from("webp-bytes") },
    ]);

    const dest = path.join(root, "out");
    const extracted = await extractBackupArchive(archivePath, dest);
    assert.equal(extracted.uploadKeys.join(","), "images/hello.webp");
    assert.equal(
      await readFile(path.join(extracted.uploadDir, "images", "hello.webp"), "utf8"),
      "webp-bytes",
    );
    const probe = new Database(extracted.databasePath, { readonly: true });
    try {
      const row = probe.prepare("SELECT note FROM restore_probe").get() as {
        note: string;
      };
      assert.equal(row.note, "from-archive");
    } finally {
      probe.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extractBackupArchive rejects zip-slip paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-tar-slip-"));
  try {
    const payload = Buffer.from("nope");
    const tar = Buffer.concat([
      ustarHeader("../evil.txt", payload.length),
      payload,
      Buffer.alloc(512 - payload.length),
      Buffer.alloc(1024),
    ]);
    const archivePath = path.join(root, "evil.tar.gz");
    await writeFile(archivePath, await gzip(tar));

    await assert.rejects(
      () => extractBackupArchive(archivePath, path.join(root, "out")),
      (error: unknown) =>
        error instanceof BackupError && error.code === "INVALID_ARCHIVE",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
