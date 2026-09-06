import { requireAdmin } from "@/lib/auth/guard";
import { handleAdminError, jsonData } from "@/lib/admin/http";
import { getLocalStorageUsage } from "@/lib/uploads/usage";

export const runtime = "nodejs";

export async function POST() {
  try {
    await requireAdmin();
    return jsonData(await getLocalStorageUsage());
  } catch (error) {
    return handleAdminError(error, "扫描本机占用失败");
  }
}
