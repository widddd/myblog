import { listBackups } from "@/lib/backup/files";
import { getDriver } from "@/lib/storage";

import {
  classifyLocalMediaKey,
  type LocalMediaUsage,
  type LocalStorageUsage,
  type MediaUsageBucket,
} from "./usage-format";

export {
  classifyLocalMediaKey,
  formatBytes,
  usagePercent,
  type LocalBackupUsage,
  type LocalMediaUsage,
  type LocalStorageUsage,
  type MediaUsageBucket,
  type MediaUsageKind,
} from "./usage-format";

function emptyBucket(): MediaUsageBucket {
  return { bytes: 0, count: 0 };
}

export async function getLocalStorageUsage(): Promise<LocalStorageUsage> {
  const local = getDriver("local");
  const media: LocalMediaUsage = {
    total: emptyBucket(),
    original: emptyBucket(),
    thumb: emptyBucket(),
    thumb2: emptyBucket(),
  };

  for (const key of await local.listKeys()) {
    const stat = await local.stat(key);
    if (!stat) {
      continue;
    }
    const kind = classifyLocalMediaKey(key);
    media[kind].bytes += stat.size;
    media[kind].count += 1;
    media.total.bytes += stat.size;
    media.total.count += 1;
  }

  const files = await listBackups();
  return {
    media,
    backups: {
      bytes: files.reduce((sum, file) => sum + file.size, 0),
      count: files.length,
      files: files.map((file) => ({ name: file.name, size: file.size })),
    },
  };
}
