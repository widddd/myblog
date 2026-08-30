import { requireAdmin } from "@/lib/auth/guard";
import { deleteBackup } from "@/lib/backup/backup";
import { isBackupFileName } from "@/lib/backup/filename";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ file: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { file } = await context.params;
    const name = decodeURIComponent(file);
    if (!isBackupFileName(name)) {
      throw new AdminHttpError("VALIDATION_ERROR", "备份文件名不合法", 400);
    }
    await deleteBackup(name);
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "删除备份失败");
  }
}
