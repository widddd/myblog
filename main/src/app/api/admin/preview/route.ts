import { z } from "zod";

import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { MAX_PREVIEW_CHARS, renderMdxHtml } from "@/lib/markdown/preview";

export const runtime = "nodejs";

const previewSchema = z.object({
  content: z.string().max(MAX_PREVIEW_CHARS, "预览正文过长"),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "预览参数无效",
        400,
      );
    }

    try {
      const html = await renderMdxHtml(parsed.data.content);
      return jsonData({ html });
    } catch (error) {
      throw new AdminHttpError(
        "PREVIEW_FAILED",
        error instanceof Error ? error.message : "正文无法预览",
        400,
      );
    }
  } catch (error) {
    return handleAdminError(error, "生成预览失败");
  }
}
