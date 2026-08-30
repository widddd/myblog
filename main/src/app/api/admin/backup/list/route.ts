import { requireAdmin } from "@/lib/auth/guard";
import { isBackupRunning, listBackups } from "@/lib/backup/backup";
import { handleAdminError, jsonData } from "@/lib/admin/http";
import { getSetting } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const [files, lastBackupAt] = await Promise.all([
      listBackups(),
      getSetting<string | null>("lastBackupAt"),
    ]);
    return jsonData({
      files,
      running: isBackupRunning(),
      lastBackupAt,
    });
  } catch (error) {
    return handleAdminError(error, "读取备份列表失败");
  }
}
