import { requireAdmin } from "@/lib/auth/guard";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import {
  deleteHomeModule,
  getHomeModule,
  updateHomeModule,
} from "@/lib/home/layout";
import { modulePatchSchema } from "@/lib/validation/home";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(raw: string) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("VALIDATION_ERROR", "无效的模块 ID", 400);
  }
  return id;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const item = await getHomeModule(parseId(id));
    if (!item) {
      throw new AdminHttpError("NOT_FOUND", "模块不存在", 404);
    }
    return jsonData(item);
  } catch (error) {
    return handleAdminError(error, "读取模块失败");
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

    const parsed = modulePatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "模块字段校验失败",
        400,
      );
    }

    await updateHomeModule(parseId(id), parsed.data);
    revalidatePublicContent();
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "更新模块失败");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    await deleteHomeModule(parseId(id));
    revalidatePublicContent();
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "删除模块失败");
  }
}
