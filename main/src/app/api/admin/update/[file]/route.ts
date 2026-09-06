import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { deleteUpdateFile } from "@/lib/update/files";
import { isManagedUpdateFileName } from "@/lib/update/filename";
import { readPendingUpdate } from "@/lib/update/pending";
import { deleteUpdateSidecar } from "@/lib/update/sidecar";
import { UpdateError } from "@/lib/update/errors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ file: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { file } = await context.params;
    const name = decodeURIComponent(file);
    if (!isManagedUpdateFileName(name)) {
      throw new AdminHttpError("VALIDATION_ERROR", "更新包文件名不合法", 400);
    }
    const pending = await readPendingUpdate();
    if (pending?.name === name) {
      throw new UpdateError("UPDATE_PENDING", "已预约应用此更新包，请先取消预约再删除", 409);
    }
    await deleteUpdateFile(name);
    await deleteUpdateSidecar(name);
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "删除更新包失败");
  }
}
