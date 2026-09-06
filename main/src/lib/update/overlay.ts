import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { isNodeNotFoundError } from "@/lib/backup/errors";
import { overlayRootsFromFiles } from "@/lib/update/paths";

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

function toAbs(cwd: string, posix: string): string {
  return path.join(cwd, ...posix.split("/"));
}

export async function overlayUpdateFiles(
  stagingDir: string,
  files: string[],
  cwd = process.cwd(),
): Promise<{ copied: number; removed: number }> {
  const overlay = files.filter((name) => name !== "meta.json");
  for (const posix of overlay) {
    const from = toAbs(stagingDir, posix);
    const to = toAbs(cwd, posix);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, { force: true });
  }

  const present = new Set(overlay);
  const roots = overlayRootsFromFiles(overlay);

  let removed = 0;
  for (const root of roots) {
    removed += await removeMissing(toAbs(cwd, root), root, present);
  }
  return { copied: overlay.length, removed };
}

async function removeMissing(
  absDir: string,
  posixDir: string,
  present: Set<string>,
): Promise<number> {
  if (!(await pathExists(absDir))) {
    return 0;
  }
  const entries = await readdir(absDir, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    const posix = `${posixDir}/${entry.name}`;
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      removed += await removeMissing(abs, posix, present);
      const leftover = await readdir(abs).catch(() => []);
      if (leftover.length === 0 && ![...present].some((name) => name.startsWith(`${posix}/`))) {
        await rm(abs, { recursive: true, force: true });
        removed += 1;
      }
      continue;
    }
    if (!present.has(posix)) {
      await rm(abs, { force: true });
      removed += 1;
    }
  }
  return removed;
}
