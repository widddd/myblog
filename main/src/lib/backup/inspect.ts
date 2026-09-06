import { mkdir, readFile } from "node:fs/promises";

import { peekBackupPackage } from "@/lib/backup/container";
import { extractNamedFiles, listTarGzEntryNames } from "@/lib/backup/tar";
import {
  backupReleaseLabel,
  parseOptionalReleaseField,
} from "@/lib/release";

export type BackupPackageFormat = "plain" | "v1" | "v2" | "unknown";

export type BackupManifestView = {
  encrypted: boolean;
  format: BackupPackageFormat;
  channel: string | null;
  version: string | null;
  releaseLabel: string;
};

const PLAIN_META_NAME = "meta.json";

function unknownView(
  encrypted: boolean,
  format: BackupPackageFormat = encrypted ? "v2" : "unknown",
): BackupManifestView {
  return {
    encrypted,
    format,
    channel: null,
    version: null,
    releaseLabel: "未知版本",
  };
}

function fromFields(
  encrypted: boolean,
  format: BackupPackageFormat,
  channel: string | null,
  version: string | null,
): BackupManifestView {
  return {
    encrypted,
    format,
    channel,
    version,
    releaseLabel: backupReleaseLabel(channel, version),
  };
}

export function manifestFromStored(
  stored: {
    encrypted: boolean;
    format?: BackupPackageFormat;
    channel: string | null;
    version: string | null;
  } | null,
  encryptedFallback: boolean,
): BackupManifestView {
  if (!stored) {
    return unknownView(encryptedFallback);
  }
  return fromFields(
    stored.encrypted,
    stored.format ?? (stored.encrypted ? "v2" : "plain"),
    stored.channel,
    stored.version,
  );
}

export async function inspectBackupPackage(
  archivePath: string,
  workDir: string,
): Promise<BackupManifestView> {
  await mkdir(workDir, { recursive: true });
  const peeked = await peekBackupPackage(archivePath, workDir);

  if (peeked.format === "v2") {
    return fromFields(
      true,
      "v2",
      parseOptionalReleaseField(peeked.meta.channel),
      parseOptionalReleaseField(peeked.meta.version),
    );
  }

  if (peeked.format === "v1") {
    return unknownView(true, "v1");
  }

  const names = await listTarGzEntryNames(archivePath);
  if (!names.includes(PLAIN_META_NAME)) {
    return fromFields(false, "plain", null, null);
  }

  const files = await extractNamedFiles(
    archivePath,
    workDir,
    new Set([PLAIN_META_NAME]),
    { discardOthers: true },
  );
  const metaPath = files.get(PLAIN_META_NAME);
  if (!metaPath) {
    return fromFields(false, "plain", null, null);
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
  } catch {
    return fromFields(false, "plain", null, null);
  }

  return fromFields(
    false,
    "plain",
    parseOptionalReleaseField(parsed.channel),
    parseOptionalReleaseField(parsed.version),
  );
}
