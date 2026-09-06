import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getDriver, loadCosSettings } from "@/lib/storage";
import {
  localOriginalCandidates,
  localThumb2Candidates,
  localThumbCandidates,
  originalExtension,
  originalMediaKey,
} from "@/lib/storage/media-keys";
import { logger } from "@/lib/utils/logger";

const DEFAULT_MB = 512;
const MIN_MB = 64;
const MAX_MB = 10240;

export async function readLocalMediaMaxBytes(): Promise<number> {
  const configured = await getSetting<number>("localMediaMaxMB");
  const megabytes =
    configured && Number.isFinite(configured) ? Math.round(configured) : DEFAULT_MB;
  return Math.min(MAX_MB, Math.max(MIN_MB, megabytes)) * 1024 * 1024;
}

async function cosHasObject(key: string): Promise<boolean> {
  try {
    return Boolean(await getDriver("cos").stat(key));
  } catch {
    return false;
  }
}

export async function pruneLocalMedia(): Promise<{
  deleted: number;
  bytes: number;
} | null> {
  const cos = await loadCosSettings();
  if (!cos) {
    return null;
  }

  const maxBytes = await readLocalMediaMaxBytes();
  const local = getDriver("local");
  const sizes = new Map<string, number>();
  let total = 0;
  for (const key of await local.listKeys()) {
    const stat = await local.stat(key);
    if (!stat) {
      continue;
    }
    sizes.set(key, stat.size);
    total += stat.size;
  }
  if (total <= maxBytes) {
    return { deleted: 0, bytes: 0 };
  }

  const rows = await prisma.upload.findMany({
    orderBy: { createdAt: "asc" },
    select: { hash: true, key: true, mime: true },
  });

  let deleted = 0;
  let freed = 0;

  async function deleteLocal(key: string) {
    const size = sizes.get(key);
    if (size == null) {
      return;
    }
    await local.delete(key);
    sizes.delete(key);
    total -= size;
    deleted += 1;
    freed += size;
  }

  for (const row of rows) {
    if (total <= maxBytes) {
      break;
    }
    const dest = originalMediaKey(
      row.hash,
      row.mime,
      originalExtension(row.key, row.mime),
    );
    const onCos = (await cosHasObject(dest)) || (await cosHasObject(row.key));
    if (!onCos) {
      continue;
    }
    for (const key of localOriginalCandidates(row)) {
      if (total <= maxBytes) {
        break;
      }
      await deleteLocal(key);
    }
  }

  for (const row of rows) {
    if (total <= maxBytes) {
      break;
    }
    const thumbs = localThumbCandidates(row);
    let thumbOnCos = false;
    for (const key of thumbs) {
      if (await cosHasObject(key)) {
        thumbOnCos = true;
        break;
      }
    }
    if (!thumbOnCos) {
      continue;
    }
    for (const key of thumbs) {
      if (total <= maxBytes) {
        break;
      }
      await deleteLocal(key);
    }
  }

  for (const row of rows) {
    if (total <= maxBytes) {
      break;
    }
    if (!row.mime.startsWith("image/")) {
      continue;
    }
    for (const key of localThumb2Candidates(row)) {
      if (total <= maxBytes) {
        break;
      }
      await deleteLocal(key);
    }
  }

  if (deleted > 0) {
    logger.info("已按本地媒体上限清理缓存", { deleted, freed });
  }
  return { deleted, bytes: freed };
}
