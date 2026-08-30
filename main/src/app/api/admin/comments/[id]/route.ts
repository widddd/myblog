import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { deleteComment, moderateComment } from "@/lib/comments/service";
import { adminCommentPatchSchema } from "@/lib/validation/comment";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(raw: string) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("VALIDATION_ERROR", "无效的评论 ID", 400);
  }
  return id;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = adminCommentPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "审核字段校验失败",
        400,
      );
    }
    return jsonData(await moderateComment(parseId(id), parsed.data.status));
  } catch (error) {
    return handleAdminError(error, "审核评论失败");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    await deleteComment(parseId(id));
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "删除评论失败");
  }
}
