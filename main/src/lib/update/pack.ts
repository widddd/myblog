import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { TarArchive } from "archiver";

import { walkTarGz } from "@/lib/backup/tar";
import { UpdateError } from "@/lib/update/errors";
import {
  ensureUpdateDir,
  moveUpdateFile,
  UPDATE_DIR,
} from "@/lib/update/files";
import { updateFileName } from "@/lib/update/filename";
import { currentUpdateManifest } from "@/lib/update/manifest";
import {
  isAllowedUpdatePath,
  isSkippedPackName,
  shouldTraversePackDir,
  toPosixPath,
} from "@/lib/update/paths";
import { writeUpdateSidecar } from "@/lib/update/sidecar";

const execFileAsync = promisify(execFile);

export type PackedUpdate = {
  name: string;
  path: string;
  size: number;
  fileCount: number;
  createdAt: string;
};

async function collectPackFiles(
  root: string,
  relativeDir: string,
  out: { posix: string; abs: string }[],
): Promise<void> {
  const absDir = relativeDir
    ? path.join(root, ...relativeDir.split("/"))
    : root;
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch (error) {
    if (relativeDir) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const posix = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const normalized = toPosixPath(posix);
    if (!normalized || isSkippedPackName(normalized)) {
      continue;
    }
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (shouldTraversePackDir(normalized)) {
        await collectPackFiles(root, normalized, out);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (isAllowedUpdatePath(normalized)) {
      out.push({ posix: normalized, abs });
    }
  }
}

async function packToPath(
  destPath: string,
  cwd = process.cwd(),
): Promise<{ fileCount: number; createdAt: string }> {
  const files: { posix: string; abs: string }[] = [];
  await collectPackFiles(cwd, "", files);
  if (files.length < 1) {
    throw new UpdateError("VALIDATION_ERROR", "没有可打包的程序文件", 400);
  }

  const createdAt = new Date().toISOString();
  const meta = currentUpdateManifest({ createdAt, files: files.length });
  const output = createWriteStream(destPath);
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
  archive.append(`${JSON.stringify(meta)}\n`, { name: "meta.json" });
  for (const file of files) {
    archive.file(file.abs, { name: file.posix });
  }
  await archive.finalize();
  await done;
  return { fileCount: files.length, createdAt };
}

export async function packCurrentApp(
  cwd = process.cwd(),
): Promise<PackedUpdate> {
  await ensureUpdateDir();
  const name = updateFileName();
  const staging = path.join(UPDATE_DIR, `.tmp-${randomUUID()}.tar.gz`);
  try {
    const packed = await packToPath(staging, cwd);
    const stored = await moveUpdateFile(staging, name);
    const metadata = await stat(stored);
    await writeUpdateSidecar(name, {
      ...currentUpdateManifest({ createdAt: packed.createdAt, files: packed.fileCount }),
      fileCount: packed.fileCount,
    });
    return {
      name,
      path: stored,
      size: metadata.size,
      fileCount: packed.fileCount,
      createdAt: packed.createdAt,
    };
  } catch (error) {
    await unlinkQuiet(staging);
    throw error;
  }
}

export async function packCurrentAppTo(
  destPath: string,
  cwd = process.cwd(),
): Promise<{ fileCount: number; createdAt: string; size: number }> {
  await mkdir(path.dirname(destPath), { recursive: true });
  const packed = await packToPath(destPath, cwd);
  const metadata = await stat(destPath);
  return { ...packed, size: metadata.size };
}

async function git(
  args: string[],
  cwd: string,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") {
      throw new UpdateError(
        "VALIDATION_ERROR",
        "本机没有 git，无法按版本打包",
        400,
      );
    }
    const detail = (err.stderr || err.message || "").trim();
    throw new UpdateError(
      "VALIDATION_ERROR",
      detail ? `git 失败：${detail}` : "git 失败",
      400,
    );
  }
}

async function extractGitMainTree(ref: string, destDir: string): Promise<void> {
  const repoRoot = await git(["rev-parse", "--show-toplevel"], process.cwd());
  await git(["rev-parse", "--verify", `${ref}^{commit}`], repoRoot);
  await mkdir(destDir, { recursive: true });
  const archivePath = path.join(
    os.tmpdir(),
    `myblog-git-archive-${randomUUID()}.tar.gz`,
  );
  try {
    await git(
      ["archive", "--format=tar.gz", "-o", archivePath, `${ref}:main`],
      repoRoot,
    );
  } catch (error) {
    if (error instanceof UpdateError && error.message.includes("git 失败")) {
      throw new UpdateError(
        "VALIDATION_ERROR",
        `找不到 ${ref} 里的 main/ 目录（应用代码在仓库的 main/ 下）`,
        400,
      );
    }
    throw error;
  }
  try {
    await walkTarGz(
      archivePath,
      async (entry) => {
        const posix = toPosixPath(entry.name);
        if (!posix || posix.endsWith("/")) {
          await entry.discard();
          return;
        }
        await entry.readToFile(path.join(destDir, ...posix.split("/")));
      },
      { label: "git 导出" },
    );
  } finally {
    await unlinkQuiet(archivePath);
  }
}

/** Pack the `main/` tree at a git ref. Output still lands in this working copy's updates dir / --out path. */
export async function packAppFromGitRef(
  ref: string,
  destPath?: string,
): Promise<PackedUpdate | { fileCount: number; createdAt: string; size: number; path: string }> {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new UpdateError("VALIDATION_ERROR", "请提供 git 引用，例如 v0.1.0 或 HEAD", 400);
  }
  const workDir = path.join(os.tmpdir(), `myblog-update-git-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  try {
    await extractGitMainTree(trimmed, workDir);
    if (destPath) {
      const packed = await packCurrentAppTo(destPath, workDir);
      return { ...packed, path: destPath };
    }
    return await packCurrentApp(workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function unlinkQuiet(filePath: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  await unlink(filePath).catch(() => undefined);
}

export async function packFixtureArchive(
  archivePath: string,
  files: { name: string; data: string | Buffer }[],
  meta?: Record<string, unknown>,
): Promise<void> {
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
  for (const file of files) {
    archive.append(file.data, { name: file.name });
  }
  await archive.finalize();
  await done;
}

export function tempPackDir(): string {
  return path.join(os.tmpdir(), `myblog-update-pack-${randomUUID()}`);
}
