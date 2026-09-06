import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { CosNotConfiguredError, testCosConnection } from "@/lib/storage/cos";

export const runtime = "nodejs";

export async function POST() {
  try {
    await requireAdmin();
    const result = await testCosConnection();
    return jsonData(result);
  } catch (error) {
    if (error instanceof CosNotConfiguredError) {
      return handleAdminError(
        new AdminHttpError("COS_NOT_CONFIGURED", error.message, 503),
        "请先填写完整的 COS 配置",
      );
    }
    return handleAdminError(error, "COS 连接失败");
  }
}
