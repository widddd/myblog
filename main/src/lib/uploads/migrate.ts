import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Upload } from "@prisma/client";

import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";
import {
  CosNotConfiguredError,
  getDriver,
  isCanonicalOriginalKey,
  loadCosSettings,
  localOriginalCandidates,
  localThumbCandidates,
  mediaFolderForMime,
  normalizeDriverName,
  originalExtension,
  originalMediaKey,
  thumbMediaKey,
} from "@/lib/storage";
import { parseVariants } from "@/lib/upload/handle";
import { pruneLocalMedia } from "@/lib/uploads/quota";
import { logger } from "@/lib/utils/logger";

const globalForMigrate = globalThis as typeof globalThis & {
  myblogCosMigrateRunning?: boolean;
};

export { mediaFolderForMime, originalExtension };

export function destCosOriginalKey(row: Pick<Upload, "hash" | "key" | "mime">) {
  return originalMediaKey(row.hash, row.mime, originalExtension(row.key, row.mime));
}

export function destCosThumbKey(row: Pick<Upload, "hash">) {
  return thumbMediaKey(row.hash);
}

export function alreadyOnCos(row: Pick<Upload, "driver" | "key">) {
  return (
    normalizeDriverName(row.driver) === "cos" &&
    (isCanonicalOriginalKey(row.key) || row.key.startsWith("media/"))
  );
}

async function findLocalOriginalKey(row: Upload): Promise<string | null> {
  const local = getDriver("local");
  const variants = parseVariants(row.variants);
  const candidates = [
    ...localOriginalCandidates(row),
    variants.content?.key ?? "",
  ].filter(Boolean);
  const seen = new Set<string>();
  for (const key of candidates) {
    if (seen.has(key) || key.includes("-thumb.")) {
      continue;
    }
    seen.add(key);
    if (await local.stat(key)) {
      return key;
    }
  }
  return null;
}

async function putLocalFileToCos(sourceKey: string, destKey: string) {
  const local = getDriver("local");
  const cos = getDriver("cos");
  const tempPath = path.join(
    os.tmpdir(),
    `myblog-cos-migrate-${destKey.replaceAll("/", "-").slice(-48)}-${randomUUID()}`,
  );
  try {
    await local.getToFile(sourceKey, tempPath);
    await cos.putFile(destKey, tempPath, { publicRead: true });
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

async function migrateThumb(row: Upload) {
  if (!row.mime.startsWith("image/")) {
    return;
  }
  const local = getDriver("local");
  const cos = getDriver("cos");
  const destKey = destCosThumbKey(row);
  if (await cos.stat(destKey)) {
    const variants = parseVariants(row.variants);
    if (variants.thumb?.key !== destKey) {
      await prisma.upload.update({
        where: { id: row.id },
        data: {
          variants: JSON.stringify({
            ...variants,
            thumb: {
              ...(variants.thumb ?? {
                mime: "image/webp",
                width: null,
                height: null,
                size: 0,
              }),
              key: destKey,
            },
          }),
        },
      });
    }
    return;
  }

  for (const sourceKey of localThumbCandidates(row)) {
    if (!(await local.stat(sourceKey))) {
      continue;
    }
    await putLocalFileToCos(sourceKey, destKey);
    const variants = parseVariants(row.variants);
    await prisma.upload.update({
      where: { id: row.id },
      data: {
        variants: JSON.stringify({
          ...variants,
          thumb: {
            ...(variants.thumb ?? {
              mime: "image/webp",
              width: null,
              height: null,
              size: 0,
            }),
            key: destKey,
          },
        }),
      },
    });
    return;
  }
}

export async function migrateLocalUploadsToCos() {
  if (globalForMigrate.myblogCosMigrateRunning) {
    throw new AdminHttpError("MIGRATE_BUSY", "已有迁移任务在进行", 409);
  }

  const config = await loadCosSettings();
  if (!config) {
    throw new CosNotConfiguredError("请先在设置里填写腾讯云 COS 配置");
  }

  globalForMigrate.myblogCosMigrateRunning = true;
  const cos = getDriver("cos");
  const rows = await prisma.upload.findMany({ orderBy: { id: "asc" } });

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let updated = 0;

  try {
    for (const row of rows) {
      const destKey = destCosOriginalKey(row);
      try {
        const remote = await cos.stat(destKey);
        if (remote) {
          if (!alreadyOnCos(row) || row.key !== destKey) {
            await prisma.upload.update({
              where: { id: row.id },
              data: { driver: "cos", key: destKey },
            });
            updated += 1;
          }
          skipped += 1;
          await migrateThumb(row);
          continue;
        }

        const sourceKey = await findLocalOriginalKey(row);
        if (!sourceKey) {
          failed += 1;
          logger.error("迁移到 COS 失败：本地没有原文件", {
            id: row.id,
            key: row.key,
          });
          continue;
        }

        await putLocalFileToCos(sourceKey, destKey);
        await prisma.upload.update({
          where: { id: row.id },
          data: { driver: "cos", key: destKey },
        });
        uploaded += 1;
        await migrateThumb(row);
      } catch (error) {
        failed += 1;
        logger.error("迁移到 COS 失败", {
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    globalForMigrate.myblogCosMigrateRunning = false;
  }

  await pruneLocalMedia().catch((error) => {
    logger.warn("迁移后清理本地媒体缓存失败", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  logger.info("媒体迁移到 COS 完成", {
    total: rows.length,
    uploaded,
    skipped,
    updated,
    failed,
  });
  return { total: rows.length, uploaded, skipped, updated, failed };
}
