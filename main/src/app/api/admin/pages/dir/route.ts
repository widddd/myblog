import { requireAdmin } from "@/lib/auth/guard";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { describeDirectoryChange, saveStaticPagesDir } from "@/lib/pages/admin";
import { staticPagesDirPutSchema } from "@/lib/validation/pages";

export const runtime = "nodejs";

/**
 * `dir` 是字面段，Next 里优先级高于同层的 `[id]`，所以 /api/admin/pages/dir 不会
 * 被当成「id 为 dir 的页面」。
 *
 * GET  = 改目录前的体检：新目录是否合法、会影响几条已启用页面的地址。
 * PUT  = 真正改目录（校验一次，不重复读二遍库）。
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const raw = new URL(request.url).searchParams.get("dir") ?? "";
    const result = await describeDirectoryChange(raw);
    return jsonData(result);
  } catch (error) {
    return handleAdminError(error, "检查目录失败");
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = staticPagesDirPutSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "目录字段校验失败",
        400,
      );
    }
    const dir = await saveStaticPagesDir(parsed.data.staticPagesDir);
    revalidatePublicContent();
    return jsonData({ dir });
  } catch (error) {
    return handleAdminError(error, "保存目录失败");
  }
}
