import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { CosNotConfiguredError } from "@/lib/storage";
import { migrateLocalUploadsToCos } from "@/lib/uploads/migrate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    await requireAdmin();
    return jsonData(await migrateLocalUploadsToCos());
  } catch (error) {
    if (error instanceof CosNotConfiguredError) {
      return handleAdminError(
        new AdminHttpError("COS_NOT_CONFIGURED", error.message, 503),
        "请先填写完整的 COS 配置",
      );
    }
    return handleAdminError(error, "迁移到 COS 失败");
  }
}
