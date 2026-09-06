import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError } from "@/lib/admin/http";
import { isNodeNotFoundError } from "@/lib/backup/errors";
import { isManagedUpdateFileName } from "@/lib/update/filename";
import { resolveUpdatePath } from "@/lib/update/files";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ file: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { file } = await context.params;
    const name = decodeURIComponent(file);
    if (!isManagedUpdateFileName(name)) {
      throw new AdminHttpError("VALIDATION_ERROR", "更新包文件名不合法", 400);
    }

    const filePath = resolveUpdatePath(name);
    let metadata;
    try {
      metadata = await stat(filePath);
    } catch (error) {
      if (isNodeNotFoundError(error)) {
        throw new AdminHttpError("NOT_FOUND", "更新包不存在", 404);
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
    return handleAdminError(error, "下载更新包失败");
  }
}
