import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { deleteAdminMoment, updateAdminMoment } from "@/lib/moments/admin";
import { momentPatchSchema } from "@/lib/validation/post";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(raw: string) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("VALIDATION_ERROR", "无效的瞬间 ID", 400);
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
    const parsed = momentPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "瞬间字段校验失败",
        400,
      );
    }
    return jsonData(await updateAdminMoment(parseId(id), parsed.data));
  } catch (error) {
    return handleAdminError(error, "更新瞬间失败");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    await deleteAdminMoment(parseId(id));
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "删除瞬间失败");
  }
}
