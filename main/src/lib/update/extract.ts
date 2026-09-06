import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { BackupError } from "@/lib/backup/errors";
import { walkTarGz } from "@/lib/backup/tar";
import { UpdateError } from "@/lib/update/errors";
import { parseUpdateManifest, type UpdateManifest } from "@/lib/update/manifest";
import { assertRequiredUpdateFiles, classifyUpdateEntry } from "@/lib/update/paths";

export type ExtractedUpdate = {
  stagingDir: string;
  manifest: UpdateManifest;
  files: string[];
};

function asUpdateError(error: unknown): never {
  if (error instanceof UpdateError) {
    throw error;
  }
  if (error instanceof BackupError) {
    throw new UpdateError(error.code, error.message.replaceAll("备份包", "更新包"), error.status);
  }
  throw error;
}

export async function extractUpdateArchive(
  archivePath: string,
  destDir?: string,
): Promise<ExtractedUpdate> {
  const stagingDir =
    destDir ?? path.join(os.tmpdir(), `myblog-update-extract-${randomUUID()}`);
  await mkdir(stagingDir, { recursive: true });
  const files: string[] = [];
  let manifest: UpdateManifest | undefined;

  try {
    await walkTarGz(
      archivePath,
      async (entry) => {
        const classified = classifyUpdateEntry(entry.name);
        if (!classified) {
          throw new UpdateError(
            "INVALID_ARCHIVE",
            `更新包含非法路径：${entry.name}`,
            400,
          );
        }
        if (files.includes(classified) || (classified === "meta.json" && manifest)) {
          throw new UpdateError("INVALID_ARCHIVE", `更新包内有重复条目：${classified}`, 400);
        }
        const destination = path.join(stagingDir, ...classified.split("/"));
        await entry.readToFile(destination);
        if (classified === "meta.json") {
          manifest = parseUpdateManifest(await readFile(destination, "utf8"));
          return;
        }
        files.push(classified);
      },
      { label: "更新包" },
    );
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    asUpdateError(error);
  }

  if (!manifest) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    throw new UpdateError("INVALID_ARCHIVE", "更新包缺少 meta.json", 400);
  }
  try {
    assertRequiredUpdateFiles(files);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  return { stagingDir, manifest, files };
}
