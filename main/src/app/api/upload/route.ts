import { NextResponse } from "next/server";

import { requireAdmin, UnauthorizedError } from "@/lib/auth/guard";
import { handleUpload, UploadError } from "@/lib/upload/handle";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

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
