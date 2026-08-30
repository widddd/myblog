import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { requireAdmin } from "@/lib/auth/guard";
import { getBackupFilePath } from "@/lib/backup/backup";
import { isBackupFileName } from "@/lib/backup/filename";
import {
  AdminHttpError,
  handleAdminError,
} from "@/lib/admin/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ file: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { file } = await context.params;
    const name = decodeURIComponent(file);
    if (!isBackupFileName(name)) {
      throw new AdminHttpError("VALIDATION_ERROR", "备份文件名不合法", 400);
    }

    const filePath = getBackupFilePath(name);
    let metadata;
    try {
      metadata = await stat(filePath);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        throw new AdminHttpError("NOT_FOUND", "备份不存在", 404);
      }
      throw error;
    }

    const stream = Readable.toWeb(
      createReadStream(filePath),
    ) as unknown as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/gzip",
        "Content-Length": String(metadata.size),
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (error) {
    return handleAdminError(error, "下载备份失败");
  }
}
