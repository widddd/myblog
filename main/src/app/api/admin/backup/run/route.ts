import { requireAdmin } from "@/lib/auth/guard";
import { runBackup } from "@/lib/backup/backup";
import { AdminHttpError } from "@/lib/admin/http";
import { backupRunPostSchema } from "@/lib/validation/backup";
import { handleAdminError, jsonData } from "@/lib/admin/http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requireAdmin();
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is valid for non-encrypted backups.
    }
    const parsed = backupRunPostSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "备份口令不合法",
        400,
      );
    }
    const backup = await runBackup(parsed.data.passphrase);
    return jsonData(backup);
  } catch (error) {
    return handleAdminError(error, "备份失败");
  }
}
