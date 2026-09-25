import { requireAdmin } from "@/lib/auth/guard";
import { BackupError } from "@/lib/backup/errors";
import { handleAdminError, jsonData } from "@/lib/admin/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return jsonData({ configured: false });
  } catch (error) {
    return handleAdminError(error, "读取备份口令状态失败");
  }
}

export async function POST() {
  try {
    await requireAdmin();
    throw new BackupError("DEPRECATED", "备份口令不保存，请在每次备份或恢复时输入", 410);

  } catch (error) {
    return handleAdminError(error, "设定备份口令失败");
  }
}
