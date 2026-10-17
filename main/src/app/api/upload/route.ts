import { NextResponse } from "next/server";

import { requireAdmin, UnauthorizedError } from "@/lib/auth/guard";
import { handleUpload, UploadError } from "@/lib/upload/handle";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 上传一个文件。multipart 字段：`file`、`kind`、音频的 `duration`，
 * 以及图片可选的 `albumId` / `volumeId`（媒体库上传预览里选的相册与卷）。
 * 字段解析与校验都在 `handleUpload()` 里（`volumeId` 必须与 `albumId` 同时给且属于该相册，
 * **写盘之前**就拒掉，不留孤儿文件）——这里只负责鉴权与错误映射。
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const result = await handleUpload(request);
    return NextResponse.json(
      { data: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { code: "UNAUTHORIZED", message: error.message },
        { status: 401 },
      );
    }
    if (error instanceof UploadError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }

    logger.error("文件上传处理失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "文件上传失败，请稍后重试" },
      { status: 500 },
    );
  }
}
