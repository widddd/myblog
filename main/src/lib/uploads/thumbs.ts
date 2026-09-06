import { prisma } from "@/lib/db";
import {
  getDriver,
  loadCosSettings,
  localThumb2Candidates,
  localThumbCandidates,
  peekCosSettings,
  thumb2MediaKey,
  thumbMediaKey,
} from "@/lib/storage";
import {
  makeThumbBuffer,
  parseVariants,
  readOriginalBuffer,
  readThumb2MaxPx,
  readThumbMaxPx,
} from "@/lib/upload/handle";
import { pruneLocalMedia } from "@/lib/uploads/quota";
import { logger } from "@/lib/utils/logger";

export async function regenerateThumbs() {
  await loadCosSettings();
  const maxPx = await readThumbMaxPx();
  const rows = await prisma.upload.findMany({
    where: { mime: { startsWith: "image/" } },
    orderBy: { id: "asc" },
  });

  const local = getDriver("local");
  const cosConfigured = Boolean(peekCosSettings());
  const cos = cosConfigured ? getDriver("cos") : null;

  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const original = await readOriginalBuffer(row);
      const { thumb } = await makeThumbBuffer(original, maxPx);
      const variants = parseVariants(row.variants);
      const thumbKey = thumbMediaKey(row.hash);
      const staleKeys = new Set(
        [...localThumbCandidates(row), variants.thumb?.key ?? ""].filter(Boolean),
      );
      await Promise.all(
        [...staleKeys].map((key) => local.delete(key).catch(() => undefined)),
      );
      await local.put(thumbKey, thumb.data);
      if (cos) {
        await cos.put(thumbKey, thumb.data);
      }
      await prisma.upload.update({
        where: { id: row.id },
        data: {
          variants: JSON.stringify({
            ...variants,
            thumb: {
              key: thumbKey,
              mime: "image/webp",
              width: thumb.info.width,
              height: thumb.info.height,
              size: thumb.info.size,
            },
          }),
        },
      });
      updated += 1;
    } catch (error) {
      failed += 1;
      logger.error("重新生成缩略图失败", {
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await pruneLocalMedia().catch((error) => {
    logger.warn("重生成缩略图后清理本地媒体缓存失败", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return { total: rows.length, updated, failed, thumbMaxPx: maxPx };
}

export async function regenerateThumb2() {
  await loadCosSettings();
  const maxPx = await readThumb2MaxPx();
  const local = getDriver("local");
  const stale = await local.listKeys("images/thumbs2");
  await Promise.all(stale.map((key) => local.delete(key).catch(() => undefined)));

  const rows = await prisma.upload.findMany({
    where: { mime: { startsWith: "image/" } },
    orderBy: { id: "asc" },
  });

  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const original = await readOriginalBuffer(row);
      const { thumb } = await makeThumbBuffer(original, maxPx);
      const thumb2Key = thumb2MediaKey(row.hash);
      const variants = parseVariants(row.variants);
      await Promise.all(
        [...localThumb2Candidates(row), variants.thumb2?.key ?? ""]
          .filter(Boolean)
          .map((key) => local.delete(key).catch(() => undefined)),
      );
      await local.put(thumb2Key, thumb.data);
      await prisma.upload.update({
        where: { id: row.id },
        data: {
          variants: JSON.stringify({
            ...variants,
            thumb2: {
              key: thumb2Key,
              mime: "image/webp",
              width: thumb.info.width,
              height: thumb.info.height,
              size: thumb.info.size,
            },
          }),
        },
      });
      updated += 1;
    } catch (error) {
      failed += 1;
      logger.error("重新生成二级缩略图失败", {
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await pruneLocalMedia().catch((error) => {
    logger.warn("重生成二级缩略图后清理本地媒体缓存失败", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return { total: rows.length, updated, failed, thumb2MaxPx: maxPx };
}
