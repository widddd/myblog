import { requireAdmin } from "@/lib/auth/guard";
import { runBackup } from "@/lib/backup/backup";
import { handleAdminError, jsonData } from "@/lib/admin/http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    await requireAdmin();
    const backup = await runBackup();
    return jsonData(backup);
  } catch (error) {
    return handleAdminError(error, "备份失败");
  }
}
