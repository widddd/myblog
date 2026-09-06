import { requireAdmin } from "@/lib/auth/guard";
import { BackupError } from "@/lib/backup/errors";
import {
  createHostSecretFromPassphrase,
  hostSecretExists,
} from "@/lib/backup/host-secret";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { backupPassphrasePostSchema } from "@/lib/validation/backup";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return jsonData({ configured: await hostSecretExists() });
  } catch (error) {
    return handleAdminError(error, "读取备份口令状态失败");
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    if (await hostSecretExists()) {
      throw new BackupError("HOST_SECRET_LOCKED", "备份口令已设定，不可更改", 409);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }

    const parsed = backupPassphrasePostSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "请确认备份口令",
        400,
      );
    }

    await createHostSecretFromPassphrase(parsed.data.passphrase);
    return jsonData({ configured: true });
  } catch (error) {
    return handleAdminError(error, "设定备份口令失败");
  }
}
