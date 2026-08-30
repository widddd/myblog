import { requireAdmin } from "@/lib/auth/guard";
import {
  handleAdminError,
  jsonData,
  jsonPage,
  AdminHttpError,
} from "@/lib/admin/http";
import { createAdminPost, listAdminPosts } from "@/lib/posts/admin";
import { parsePage, parsePageSize } from "@/lib/utils/page";
import { postWriteSchema } from "@/lib/validation/post";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const page = parsePage(url.searchParams.get("page") ?? undefined);
    const pageSize = parsePageSize(url.searchParams.get("pageSize") ?? undefined);
    const status = url.searchParams.get("status") ?? undefined;
    const q = url.searchParams.get("q")?.trim() || undefined;
    const result = await listAdminPosts({ page, pageSize, status, q });
    return jsonPage(result.data, result.total, result.page, result.pageSize);
  } catch (error) {
    return handleAdminError(error, "读取文章列表失败");
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = postWriteSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "文章字段校验失败",
        400,
      );
    }
    const created = await createAdminPost(parsed.data);
    return jsonData(created, 201);
  } catch (error) {
    return handleAdminError(error, "创建文章失败");
  }
}
