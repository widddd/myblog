import type { Upload } from "@prisma/client";

import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";
import {
  getDriver,
  loadCosSettings,
  peekCosSettings,
  thumb2MediaKey,
  thumbMediaKey,
} from "@/lib/storage";
import {
  isUploadPending,
  makeImageThumbs,
  parseVariants,
  readOriginalBuffer,
  readThumb2MaxPx,
  readThumbMaxPx,
  toUploadResult,
  type StoredVariants,
  type UploadResult,
} from "@/lib/upload/handle";
import { pruneLocalMedia } from "@/lib/uploads/quota";
import { logger } from "@/lib/utils/logger";

function variantFromThumb(
  key: string,
  thumb: { info: { width: number; height: number; size: number } },
) {
  return {
    key,
    mime: "image/webp",
    width: thumb.info.width,
    height: thumb.info.height,
    size: thumb.info.size,
  };
}

async function requireCos() {
  const config = await loadCosSettings();
  if (!config) {
    throw new AdminHttpError(
      "COS_NOT_CONFIGURED",
      "请先在设置里填写腾讯云 COS 配置后再发布",
      503,
    );
  }
}

function hasThumb(row: Upload) {
  return Boolean(parseVariants(row.variants).thumb);
}

function onCos(row: Upload) {
  const driver = row.driver.trim().toLowerCase();
  return driver === "cos" || driver === "oss";
}

async function writeDerivatives(row: Upload): Promise<Upload> {
  if (!row.mime.startsWith("image/")) {
    return row;
  }
  if (hasThumb(row)) {
    return row;
  }

  const buffer = await readOriginalBuffer(row);
  const [maxPx, max2Px] = await Promise.all([
    readThumbMaxPx(),
    readThumb2MaxPx(),
  ]);
  const { thumb, thumb2 } = await makeImageThumbs(buffer, maxPx, max2Px);
  const thumbKey = thumbMediaKey(row.hash);
  const thumb2Key = thumb2MediaKey(row.hash);
  const local = getDriver("local");
  const variants = parseVariants(row.variants);

  await local.delete(thumb2Key).catch(() => undefined);
  await Promise.all([
    local.put(thumbKey, thumb.data),
    local.put(thumb2Key, thumb2.data),
  ]);

  return prisma.upload.update({
    where: { id: row.id },
    data: {
      variants: JSON.stringify({
        ...variants,
        thumb: variantFromThumb(thumbKey, thumb),
        thumb2: variantFromThumb(thumb2Key, thumb2),
      } satisfies StoredVariants),
    },
  });
}

async function replicateToCos(row: Upload): Promise<Upload> {
  if (onCos(row) && (!row.mime.startsWith("image/") || hasThumb(row))) {
    return row;
  }

  await requireCos();
  const buffer = await readOriginalBuffer(row);
  const variants = parseVariants(row.variants);
  const cos = getDriver("cos");
  const local = getDriver("local");
  await cos.put(row.key, buffer);

  if (row.mime.startsWith("image/")) {
    const thumbKey = variants.thumb?.key ?? thumbMediaKey(row.hash);
    const localThumb = await local.stat(thumbKey);
    if (!localThumb) {
      throw new AdminHttpError(
        "THUMB_MISSING",
        "请先生成缩略图再上传到云存储",
        409,
      );
    }
    const thumbObject = await local.get(thumbKey);
    const chunks: Uint8Array[] = [];
    const reader = thumbObject.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
      }
    }
    await cos.put(thumbKey, Buffer.concat(chunks));
  }

  const updated = await prisma.upload.update({
    where: { id: row.id },
    data: { driver: "cos" },
  });
  await pruneLocalMedia().catch((error) => {
    logger.warn("发布后清理本地媒体缓存失败", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return updated;
}

export async function finalizeUpload(
  hash: string,
  step: "derivatives" | "replicate",
): Promise<UploadResult | null> {
  const row = await prisma.upload.findUnique({ where: { hash } });
  if (!row) {
    return null;
  }

  if (!isUploadPending(row) && peekCosSettings()) {
    return toUploadResult(row);
  }

  const next =
    step === "derivatives" ? await writeDerivatives(row) : await replicateToCos(row);
  return toUploadResult(next);
}
