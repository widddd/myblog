import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
  jsonPage,
} from "@/lib/admin/http";
import { listAdminComments, replyAsAdmin } from "@/lib/comments/service";
import { parsePage, parsePageSize } from "@/lib/utils/page";
import { adminCommentReplySchema } from "@/lib/validation/comment";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const result = await listAdminComments({
      status: url.searchParams.get("status") ?? undefined,
      targetType: url.searchParams.get("targetType") ?? undefined,
      page: parsePage(url.searchParams.get("page") ?? undefined),
      pageSize: parsePageSize(url.searchParams.get("pageSize") ?? undefined),
    });
    return jsonPage(result.data, result.total, result.page, result.pageSize);
  } catch (error) {
    return handleAdminError(error, "读取评论列表失败");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = adminCommentReplySchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "回复字段校验失败",
        400,
      );
    }
    const created = await replyAsAdmin({
      ...parsed.data,
      nickname: session.username,
    });
    return jsonData(created, 201);
  } catch (error) {
    return handleAdminError(error, "发表管理员回复失败");
  }
}
