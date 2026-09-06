import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { deleteAdminUpload, inspectAdminUpload } from "@/lib/uploads/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(raw: string) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("VALIDATION_ERROR", "无效的文件 ID", 400);
  }
  return id;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id: raw } = await context.params;
    return jsonData(await inspectAdminUpload(parseId(raw)));
  } catch (error) {
    return handleAdminError(error, "读取文件信息失败");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id: raw } = await context.params;
    const id = parseId(raw);
    let keepCos = new URL(request.url).searchParams.get("keepCos") === "1";
    try {
      const body = (await request.json()) as { keepCos?: unknown };
      if (body?.keepCos === true) {
        keepCos = true;
      }
    } catch {
      // DELETE may have an empty body
    }
    await deleteAdminUpload(id, { keepCos });
    return jsonData({ ok: true, keepCos });
  } catch (error) {
    return handleAdminError(error, "删除文件失败");
  }
}
