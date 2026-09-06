import { requireAdmin } from "@/lib/auth/guard";
import { setBackupEncrypt } from "@/lib/backup/encrypt-policy";
import { handleAdminError, jsonData, AdminHttpError } from "@/lib/admin/http";
import { backupEncryptPutSchema } from "@/lib/validation/backup";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    const parsed = backupEncryptPutSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError("VALIDATION_ERROR", "请选择是否加密备份", 400);
    }
    return jsonData(await setBackupEncrypt(parsed.data.enabled));
  } catch (error) {
    return handleAdminError(error, "更新备份加密开关失败");
  }
}
