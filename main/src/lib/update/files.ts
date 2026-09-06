import { copyFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { isNodeNotFoundError } from "@/lib/backup/errors";
import { UpdateError } from "@/lib/update/errors";
import { isManagedUpdateFileName } from "@/lib/update/filename";

export type UpdateFileInfo = {
  name: string;
  size: number;
  createdAt: string;
};

export const UPDATE_DIR = path.resolve(process.cwd(), "data", "updates");
export const MAX_UPDATE_PACKAGE_BYTES = 512 * 1024 * 1024;

function assertInside(resolved: string, root: string, message: string): string {
  const comparableResolved =
    process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const comparableRoot =
    process.platform === "win32"
      ? `${root}${path.sep}`.toLowerCase()
      : `${root}${path.sep}`;
  if (!comparableResolved.startsWith(comparableRoot)) {
    throw new UpdateError("VALIDATION_ERROR", message, 400);
  }
  return resolved;
}

export function resolveUpdatePath(name: string): string {
  if (!isManagedUpdateFileName(name)) {
    throw new UpdateError("VALIDATION_ERROR", "更新包文件名不合法", 400);
  }
  return assertInside(
    path.resolve(UPDATE_DIR, name),
    UPDATE_DIR,
    "更新包路径不合法",
  );
}

export async function ensureUpdateDir(): Promise<void> {
  await mkdir(UPDATE_DIR, { recursive: true });
}

export async function updatePackageExists(name: string): Promise<boolean> {
  try {
    const metadata = await stat(resolveUpdatePath(name));
    return metadata.isFile();
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

export async function listUpdatePackages(): Promise<UpdateFileInfo[]> {
  await ensureUpdateDir();
  const entries = await readdir(UPDATE_DIR, { withFileTypes: true });
  const files: UpdateFileInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isManagedUpdateFileName(entry.name)) {
      continue;
    }
    const filePath = path.join(UPDATE_DIR, entry.name);
    const metadata = await stat(filePath);
    files.push({
      name: entry.name,
      size: metadata.size,
      createdAt: metadata.mtime.toISOString(),
    });
  }
  return files.sort((left, right) => right.name.localeCompare(left.name));
}

export async function deleteUpdateFile(name: string): Promise<void> {
  await unlink(resolveUpdatePath(name));
}

export async function copyUpdateFile(from: string, name: string): Promise<string> {
  await ensureUpdateDir();
  const dest = resolveUpdatePath(name);
  await copyFile(from, dest);
  return dest;
}

export async function moveUpdateFile(from: string, name: string): Promise<string> {
  await ensureUpdateDir();
  const dest = resolveUpdatePath(name);
  try {
    await rename(from, dest);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EXDEV") {
      throw error;
    }
    await copyFile(from, dest);
    await unlink(from);
  }
  return dest;
}
