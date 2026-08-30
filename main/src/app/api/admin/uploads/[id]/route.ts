import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { deleteAdminUpload } from "@/lib/uploads/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id: raw } = await context.params;
    const id = Number.parseInt(raw, 10);
    if (!Number.isInteger(id) || id < 1) {
      throw new AdminHttpError("VALIDATION_ERROR", "无效的文件 ID", 400);
    }
    await deleteAdminUpload(id);
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "删除文件失败");
  }
}
