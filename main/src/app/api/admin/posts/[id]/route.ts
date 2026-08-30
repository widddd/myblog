import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import {
  deleteAdminPost,
  getAdminPost,
  updateAdminPost,
} from "@/lib/posts/admin";
import { postPatchSchema } from "@/lib/validation/post";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(raw: string) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("VALIDATION_ERROR", "无效的文章 ID", 400);
  }
  return id;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    return jsonData(await getAdminPost(parseId(id)));
  } catch (error) {
    return handleAdminError(error, "读取文章失败");
  }
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
    const parsed = postPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "文章字段校验失败",
        400,
      );
    }
    return jsonData(await updateAdminPost(parseId(id), parsed.data));
  } catch (error) {
    return handleAdminError(error, "更新文章失败");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    await deleteAdminPost(parseId(id));
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "删除文章失败");
  }
}
