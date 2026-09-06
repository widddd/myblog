import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { UpdateError } from "./errors";
import { extractUpdateArchive } from "./extract";
import {
  importUpdateFileName,
  isImportUpdateFileName,
  isManagedUpdateFileName,
  isPackedUpdateFileName,
  updateFileName,
} from "./filename";
import { inspectUpdatePackage } from "./inspect";
import { currentUpdateManifest, parseUpdateManifest } from "./manifest";
import { overlayUpdateFiles } from "./overlay";
import { packCurrentAppTo, packFixtureArchive } from "./pack";
import {
  assertRequiredUpdateFiles,
  classifyUpdateEntry,
  isAllowedUpdatePath,
} from "./paths";
import { parseGithubRepo } from "./github";
import { isPendingUpdateDue, type PendingUpdate } from "./pending";

test("update file names follow the whitelist", () => {
  const name = updateFileName(new Date(2026, 8, 4, 21, 40, 5));
  assert.equal(name, "myblog-update-20260904-214005.tar.gz");
  assert.equal(isPackedUpdateFileName(name), true);
  const imported = importUpdateFileName(
    "deadbeef",
    new Date(2026, 8, 4, 21, 40, 5),
  );
  assert.equal(imported, "myblog-update-import-20260904-214005-deadbeef.tar.gz");
  assert.equal(isImportUpdateFileName(imported), true);
  assert.equal(isManagedUpdateFileName(name), true);
  assert.equal(isManagedUpdateFileName("../myblog-update-20260904-214005.tar.gz"), false);
});

test("classifyUpdateEntry uses a deny list so new roots and files are packed", () => {
  assert.equal(classifyUpdateEntry("src/lib/update/paths.ts"), "src/lib/update/paths.ts");
  assert.equal(classifyUpdateEntry("package.json"), "package.json");
  assert.equal(classifyUpdateEntry("INSTALL.md"), "INSTALL.md");
  assert.equal(classifyUpdateEntry("meta.json"), "meta.json");
  assert.equal(classifyUpdateEntry("foo.config.ts"), "foo.config.ts");
  assert.equal(classifyUpdateEntry("plugins/a.ts"), "plugins/a.ts");
  for (const name of [
    "data/blog.db",
    ".env",
    ".env.local",
    "node_modules/next/index.js",
    "../src/app.ts",
    "src\\evil.ts",
    "/etc/passwd",
    ".next/server.js",
    "src/lib/foo.test.ts",
    "src/lib/foo.test.tsx",
  ]) {
    assert.equal(classifyUpdateEntry(name), null);
  }
  assert.equal(isAllowedUpdatePath("data/blog.db"), false);
  assert.equal(isAllowedUpdatePath(".env"), false);
  assert.equal(isAllowedUpdatePath("foo.config.ts"), true);
});

test("assertRequiredUpdateFiles needs package.json and src", () => {
  assert.throws(() => assertRequiredUpdateFiles(["prisma/schema.prisma"]), UpdateError);
  assertRequiredUpdateFiles(["package.json", "src/lib/ok.ts"]);
});

test("parseUpdateManifest requires app-update kind", () => {
  const manifest = currentUpdateManifest({ files: 3 });
  const parsed = parseUpdateManifest(JSON.stringify(manifest));
  assert.equal(parsed.kind, "app-update");
  assert.equal(parsed.schema, 1);
  assert.throws(() => parseUpdateManifest(`{"kind":"backup"}`), UpdateError);
});

test("pending update is due only after restartAt", () => {
  const pending: PendingUpdate = {
    name: "myblog-update-20260904-214005.tar.gz",
    requestedAt: "2026-09-04T12:00:00.000Z",
    restartAt: null,
  };
  assert.equal(isPendingUpdateDue(pending), false);
  assert.equal(
    isPendingUpdateDue(
      { ...pending, restartAt: "2026-09-04T12:00:00.000Z" },
      Date.parse("2026-09-04T11:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    isPendingUpdateDue(
      { ...pending, restartAt: "2026-09-04T12:00:00.000Z" },
      Date.parse("2026-09-04T13:00:00.000Z"),
    ),
    true,
  );
});

test("pack, inspect, extract and overlay roundtrip in a temp app", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-update-rt-"));
  try {
    await mkdir(path.join(root, "src", "lib"), { recursive: true });
    await mkdir(path.join(root, "data"), { recursive: true });
    await writeFile(path.join(root, "package.json"), `{"name":"fixture"}\n`);
    await writeFile(path.join(root, "src", "lib", "hello.ts"), "export const hello = 1;\n");
    await writeFile(path.join(root, "src", "gone.ts"), "export const gone = 1;\n");
    await writeFile(path.join(root, "data", "blog.db"), "keep-me");
    await writeFile(path.join(root, ".env"), "SECRET=1\n");

    const archivePath = path.join(root, "out.tar.gz");
    const packed = await packCurrentAppTo(archivePath, root);
    assert.ok(packed.fileCount >= 2);

    const inspected = await inspectUpdatePackage(archivePath);
    assert.equal(inspected.manifest.kind, "app-update");
    assert.ok(inspected.files.includes("package.json"));
    assert.equal(
      inspected.files.some((name) => name.startsWith("data/")),
      false,
    );

    const extracted = await extractUpdateArchive(archivePath);
    const dest = await mkdtemp(path.join(os.tmpdir(), "myblog-update-dest-"));
    try {
      await mkdir(path.join(dest, "src", "lib"), { recursive: true });
      await mkdir(path.join(dest, "data"), { recursive: true });
      await writeFile(path.join(dest, "src", "gone.ts"), "old");
      await writeFile(path.join(dest, "src", "stale.ts"), "stale");
      await writeFile(path.join(dest, "src", "lib", "hello.ts"), "old");
      await writeFile(path.join(dest, "data", "blog.db"), "keep-me");
      await writeFile(path.join(dest, ".env"), "SECRET=1\n");

      await overlayUpdateFiles(extracted.stagingDir, extracted.files, dest);
      const hello = await readFile(path.join(dest, "src", "lib", "hello.ts"), "utf8");
      assert.match(hello, /hello = 1/);
      assert.equal(await readFile(path.join(dest, "data", "blog.db"), "utf8"), "keep-me");
      assert.equal(await readFile(path.join(dest, ".env"), "utf8"), "SECRET=1\n");
      await assert.rejects(() => readFile(path.join(dest, "src", "stale.ts")));
    } finally {
      await rm(extracted.stagingDir, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pack includes new root files and plugin dirs, overlay syncs those dirs only", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-update-deny-"));
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "plugins"), { recursive: true });
    await mkdir(path.join(root, "data"), { recursive: true });
    await writeFile(path.join(root, "package.json"), `{"name":"fixture"}\n`);
    await writeFile(path.join(root, "src", "app.ts"), "export {}\n");
    await writeFile(path.join(root, "src", "skip.test.ts"), "export {}\n");
    await writeFile(path.join(root, "foo.config.ts"), "export const n = 1;\n");
    await writeFile(path.join(root, "plugins", "a.ts"), "export const a = 1;\n");
    await writeFile(path.join(root, "data", "blog.db"), "secret");

    const archivePath = path.join(root, "out.tar.gz");
    await packCurrentAppTo(archivePath, root);
    const inspected = await inspectUpdatePackage(archivePath);
    assert.ok(inspected.files.includes("foo.config.ts"));
    assert.ok(inspected.files.includes("plugins/a.ts"));
    assert.equal(inspected.files.includes("src/skip.test.ts"), false);
    assert.equal(inspected.files.some((name) => name.startsWith("data/")), false);

    const extracted = await extractUpdateArchive(archivePath);
    const dest = await mkdtemp(path.join(os.tmpdir(), "myblog-update-deny-dest-"));
    try {
      await mkdir(path.join(dest, "plugins"), { recursive: true });
      await mkdir(path.join(dest, "src"), { recursive: true });
      await writeFile(path.join(dest, "plugins", "a.ts"), "old");
      await writeFile(path.join(dest, "plugins", "stale.ts"), "remove-me");
      await writeFile(path.join(dest, "keep-me.md"), "local notes");
      await writeFile(path.join(dest, ".env"), "SECRET=1\n");
      await writeFile(path.join(dest, "src", "app.ts"), "old");

      await overlayUpdateFiles(extracted.stagingDir, extracted.files, dest);
      assert.match(await readFile(path.join(dest, "foo.config.ts"), "utf8"), /n = 1/);
      assert.match(await readFile(path.join(dest, "plugins", "a.ts"), "utf8"), /a = 1/);
      await assert.rejects(() => readFile(path.join(dest, "plugins", "stale.ts")));
      assert.equal(await readFile(path.join(dest, "keep-me.md"), "utf8"), "local notes");
      assert.equal(await readFile(path.join(dest, ".env"), "utf8"), "SECRET=1\n");
    } finally {
      await rm(extracted.stagingDir, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inspect rejects archives that touch data", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "myblog-update-bad-"));
  try {
    const archivePath = path.join(dir, "bad.tar.gz");
    await packFixtureArchive(
      archivePath,
      [
        { name: "package.json", data: "{}\n" },
        { name: "src/app.ts", data: "export {}\n" },
        { name: "data/blog.db", data: "nope" },
      ],
      currentUpdateManifest(),
    );
    await assert.rejects(() => inspectUpdatePackage(archivePath), UpdateError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("parseGithubRepo accepts owner/repo and github URLs", () => {
  assert.deepEqual(parseGithubRepo("acme/myblog"), { owner: "acme", repo: "myblog" });
  assert.deepEqual(parseGithubRepo("https://github.com/acme/myblog.git"), {
    owner: "acme",
    repo: "myblog",
  });
  assert.equal(parseGithubRepo(""), null);
  assert.equal(parseGithubRepo("https://example.com/acme/myblog"), null);
});
