import { requireAdmin } from "@/lib/auth/guard";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import {
  deleteStaticPage,
  getStaticPage,
  updateStaticPage,
} from "@/lib/pages/admin";
import { staticPagePatchSchema } from "@/lib/validation/pages";

export const runtime = "nodejs";

function parseId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("NOT_FOUND", "页面不存在", 404);
  }
  return id;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const page = await getStaticPage(parseId(id));
    if (!page) {
      throw new AdminHttpError("NOT_FOUND", "页面不存在", 404);
    }
    return jsonData(page);
  } catch (error) {
    return handleAdminError(error, "读取页面失败");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = staticPagePatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "页面字段校验失败",
        400,
      );
    }
    await updateStaticPage(parseId(id), parsed.data);
    revalidatePublicContent();
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "保存页面失败");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    await deleteStaticPage(parseId(id));
    revalidatePublicContent();
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "删除页面失败");
  }
}
