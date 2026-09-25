import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { UPDATE_DIR, ensureUpdateDir } from "@/lib/update/files";
import { isManagedUpdateFileName } from "@/lib/update/filename";
import type { UpdateManifest } from "@/lib/update/manifest";

export type UpdateSidecar = UpdateManifest & { fileCount: number };

function sidecarPath(name: string): string {
  return path.join(UPDATE_DIR, `${name}.meta.json`);
}

export async function writeUpdateSidecar(
  name: string,
  view: UpdateSidecar,
): Promise<void> {
  if (!isManagedUpdateFileName(name)) {
    return;
  }
  await ensureUpdateDir();
  await writeFile(sidecarPath(name), `${JSON.stringify(view, null, 2)}\n`, "utf8");
}

export async function readUpdateSidecar(name: string): Promise<UpdateSidecar | null> {
  try {
    const raw = await readFile(sidecarPath(name), "utf8");
    return JSON.parse(raw) as UpdateSidecar;
  } catch {
    return null;
  }
}

export async function deleteUpdateSidecar(name: string): Promise<void> {
  await unlink(sidecarPath(name)).catch(() => undefined);
}

export async function clearUpdateSidecars(): Promise<string[]> {
  await ensureUpdateDir();
  const entries = await readdir(UPDATE_DIR, { withFileTypes: true });
  const suffix = ".meta.json";
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(suffix)) {
      continue;
    }
    const name = entry.name.slice(0, -suffix.length);
    if (!isManagedUpdateFileName(name)) {
      continue;
    }
    await unlink(sidecarPath(name)).catch(() => undefined);
    removed.push(name);
  }
  return removed;
}
