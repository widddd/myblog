import type { Upload } from "@prisma/client";

import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";
import {
  getDriver,
  loadCosSettings,
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
import {
  beginFinalizeProgress,
  endFinalizeProgress,
  FINALIZE_DERIVATIVES_END,
  finalizeCosPercent,
  finalizeReadPercent,
  finalizeThumbsPercent,
  reportFinalizeProgress,
} from "@/lib/uploads/progress";
import { shouldSkipCosStep, type MediaStep } from "@/lib/uploads/steps";
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

  // 读原图（大图要几百 ms）+ sharp 算两张缩略图：这段以前是"55% 之前的一小段黑盒"，
  // 现在至少能报出"开始算"和"算完了"两个点（见 lib/uploads/progress.ts）
  reportFinalizeProgress(row.hash, {
    stage: "derivatives",
    percent: finalizeReadPercent(),
  });
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
  reportFinalizeProgress(row.hash, {
    stage: "derivatives",
    percent: finalizeThumbsPercent(),
  });

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

async function readStorageBytes(
  driver: ReturnType<typeof getDriver>,
  key: string,
): Promise<Buffer> {
  const object = await driver.get(key);
  const chunks: Uint8Array[] = [];
  const reader = object.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks);
}

async function replicateToCos(row: Upload): Promise<Upload> {
  if (onCos(row) && (!row.mime.startsWith("image/") || hasThumb(row))) {
    return row;
  }

  await requireCos();
  reportFinalizeProgress(row.hash, {
    stage: "replicate",
    percent: FINALIZE_DERIVATIVES_END,
  });
  const buffer = await readOriginalBuffer(row);
  const variants = parseVariants(row.variants);
  const cos = getDriver("cos");
  const local = getDriver("local");

  // 先攒齐这一次要传的对象与总字节数：进度条要的是"整段上云的百分比"，
  // 所以原图与缩略图得放进同一个分母（缩略图很小，实际几乎只反映原图的字节）
  const objects: { key: string; bytes: Uint8Array; withProgress: boolean }[] = [
    { key: row.key, bytes: buffer, withProgress: true },
  ];
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
    objects.push({
      key: thumbKey,
      bytes: await readStorageBytes(local, thumbKey),
      // 几十 KB 的缩略图不值得为它开一条计数流：字节数照算进分母，进度只有原图那一段
      withProgress: false,
    });
  }
  const totalBytes = objects.reduce(
    (sum, object) => sum + object.bytes.byteLength,
    0,
  );
  let doneBytes = 0;

  for (const object of objects) {
    await cos.put(
      object.key,
      object.bytes,
      object.withProgress
        ? {
            // 真实字节进度：来自 lib/storage/progress-stream.ts 的自计数流（按 socket 回压推进）
            onProgress: (loaded) => {
              const finished = doneBytes + loaded;
              reportFinalizeProgress(row.hash, {
                stage: "replicate",
                percent: finalizeCosPercent(finished, totalBytes),
                loadedBytes: finished,
                totalBytes,
              });
            },
          }
        : undefined,
    );
    doneBytes += object.bytes.byteLength;
    reportFinalizeProgress(row.hash, {
      stage: "replicate",
      percent: finalizeCosPercent(doneBytes, totalBytes),
      loadedBytes: doneBytes,
      totalBytes,
    });
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
  step: MediaStep,
): Promise<UploadResult | null> {
  const row = await prisma.upload.findUnique({ where: { hash } });
  if (!row) {
    return null;
  }

  // 这里必须用 loadCosSettings()（真的去读配置）而不是 peekCosSettings()（可能还没加载过缓存）：
  // 用 peek 的话，刚启动的进程会把「配了 COS」的站点误判成没配，从而**跳过上云**（漏传而不是报错，更难发现）。
  const cos = await loadCosSettings();
  if (!isUploadPending(row) && cos) {
    return toUploadResult(row);
  }

  // 没配 COS 的站点：只做本地派生（一级/二级缩略图），「上云」那一步**跳过而不是报错**。
  // COS 在本项目里是可选的（见 docs/api-contracts.md 的 /api/upload 条目），
  // 而这一步的调用方有媒体库上传、文章保存发布、发瞬间三条路——它们都不该因为"没配云存储"而失败。
  // 返回 null 会被路由包成 `{skipped:true}`，客户端据此保留本地结果（见 lib/client/upload.ts）。
  if (shouldSkipCosStep(step, Boolean(cos))) {
    return null;
  }

  // 这一段的进度写进进程内的登记表，客户端在请求还没返回时轮询它画进度条
  // （见 lib/uploads/progress.ts；上云那一步的百分比来自 COS SDK 的真实字节进度）
  beginFinalizeProgress(hash, step);
  try {
    const next =
      step === "derivatives"
        ? await writeDerivatives(row)
        : await replicateToCos(row);
    return toUploadResult(next);
  } finally {
    endFinalizeProgress(hash);
  }
}
