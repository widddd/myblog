import { requireAdmin } from "@/lib/auth/guard";
import { handleAdminError, jsonData } from "@/lib/admin/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireAdmin();
    return jsonData({ username: session.username });
  } catch (error) {
    return handleAdminError(error, "读取会话失败");
  }
}
