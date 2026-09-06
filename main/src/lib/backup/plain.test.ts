import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PLAIN_BACKUP_TTL_MS, purgeExpiredPlainBackups } from "./plain";

test("purgeExpiredPlainBackups removes only stale whitelist files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-plain-"));
  try {
    const stale = "myblog-plain-20260101-010101-aaaaaaaa.tar.gz";
    const fresh = "myblog-plain-20260830-120000-bbbbbbbb.tar.gz";
    await writeFile(path.join(root, stale), "old");
    await writeFile(path.join(root, fresh), "new");
    await writeFile(path.join(root, "readme.txt"), "keep");
    const old = new Date(Date.now() - PLAIN_BACKUP_TTL_MS - 1_000);
    await utimes(path.join(root, stale), old, old);

    const removed = await purgeExpiredPlainBackups(Date.now(), root);
    assert.deepEqual(removed, [stale]);
    await assert.rejects(() => readFile(path.join(root, stale)));
    assert.equal(await readFile(path.join(root, fresh), "utf8"), "new");
    assert.equal(await readFile(path.join(root, "readme.txt"), "utf8"), "keep");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
