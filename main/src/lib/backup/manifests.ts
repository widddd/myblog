import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { isNodeNotFoundError } from "@/lib/backup/errors";
import { isManagedBackupFileName } from "@/lib/backup/filename";
import type {
  BackupManifestView,
  BackupPackageFormat,
} from "@/lib/backup/inspect";

export type StoredBackupManifest = {
  encrypted: boolean;
  format: BackupPackageFormat;
  channel: string | null;
  version: string | null;
};

const MANIFEST_PATH = path.resolve(
  process.cwd(),
  "data",
  "backup-manifests.json",
);

type ManifestStore = Record<string, StoredBackupManifest>;

async function readStore(): Promise<ManifestStore> {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as ManifestStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return {};
    }
    return {};
  }
}

async function writeStore(store: ManifestStore): Promise<void> {
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function readBackupManifest(
  name: string,
): Promise<StoredBackupManifest | null> {
  if (!isManagedBackupFileName(name)) {
    return null;
  }
  const store = await readStore();
  return store[name] ?? null;
}

export async function upsertBackupManifest(
  name: string,
  view: Pick<BackupManifestView, "encrypted" | "format" | "channel" | "version">,
): Promise<void> {
  if (!isManagedBackupFileName(name)) {
    return;
  }
  const store = await readStore();
  store[name] = {
    encrypted: view.encrypted,
    format: view.format,
    channel: view.channel,
    version: view.version,
  };
  await writeStore(store);
}

export async function deleteBackupManifest(name: string): Promise<void> {
  const store = await readStore();
  if (!store[name]) {
    return;
  }
  delete store[name];
  await writeStore(store);
}

export async function clearBackupManifests(): Promise<void> {
  await unlink(MANIFEST_PATH).catch((error) => {
    if (!isNodeNotFoundError(error)) {
      throw error;
    }
  });
}
