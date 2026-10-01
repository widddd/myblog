import { NextResponse } from "next/server";

import { getSetting } from "@/lib/settings";
import {
  IMAGE_UPLOAD_MIME_TYPES,
  resolveMaxImagesPerBatch,
  resolveUploadMaxBytes,
  type UploadLimits,
} from "@/lib/upload/limits";

export const dynamic = "force-dynamic";

/**
 * 公开只读：客户端（Android 壳的相册视图）据此决定「一次能选几张」。
 *
 * 两个数都**在后台可配**（`uploadMaxImagesPerBatch` / `uploadMaxSizeMB`），
 * 且换算都走 `lib/upload/limits.ts` 里那两个 resolve 函数 —— 与 `handleUpload()` 用的是同一段逻辑，
 * 保证「接口说的」和「上传时会怎样」一致（别在这里另写一遍 clamp，那是 P-004）。
 */
export async function GET() {
  const [maxImagesMB, maxSizeMB] = await Promise.all([
    getSetting<number>("uploadMaxImagesPerBatch"),
    getSetting<number>("uploadMaxSizeMB"),
  ]);
  const limits: UploadLimits = {
    maxImages: resolveMaxImagesPerBatch(maxImagesMB),
    maxBytes: resolveUploadMaxBytes(maxSizeMB),
    imageTypes: [...IMAGE_UPLOAD_MIME_TYPES],
  };
  return NextResponse.json(limits, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
