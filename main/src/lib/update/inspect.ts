import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { extractNamedFiles, listTarGzEntryNames } from "@/lib/backup/tar";
import { UpdateError } from "@/lib/update/errors";
import { parseUpdateManifest, type UpdateManifest } from "@/lib/update/manifest";
import { assertRequiredUpdateFiles, classifyUpdateEntry } from "@/lib/update/paths";

export type InspectedUpdate = {
  manifest: UpdateManifest;
  files: string[];
};

export async function inspectUpdatePackage(archivePath: string): Promise<InspectedUpdate> {
  const names = await listTarGzEntryNames(archivePath);
  const files: string[] = [];
  let hasMeta = false;
  for (const name of names) {
    const classified = classifyUpdateEntry(name);
    if (!classified) {
      throw new UpdateError("INVALID_ARCHIVE", `更新包含非法路径：${name}`, 400);
    }
    if (classified === "meta.json") {
      hasMeta = true;
      continue;
    }
    files.push(classified);
  }
  if (!hasMeta) {
    throw new UpdateError("INVALID_ARCHIVE", "更新包缺少 meta.json", 400);
  }
  assertRequiredUpdateFiles(files);

  const workDir = path.join(os.tmpdir(), `myblog-update-inspect-${randomUUID()}`);
  try {
    await mkdir(workDir, { recursive: true });
    const extracted = await extractNamedFiles(
      archivePath,
      workDir,
      new Set(["meta.json"]),
      { discardOthers: true },
    );
    const metaPath = extracted.get("meta.json");
    if (!metaPath) {
      throw new UpdateError("INVALID_ARCHIVE", "更新包缺少 meta.json", 400);
    }
    const manifest = parseUpdateManifest(await readFile(metaPath, "utf8"));
    return { manifest, files };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
