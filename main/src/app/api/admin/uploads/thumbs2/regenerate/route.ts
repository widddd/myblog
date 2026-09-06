import { requireAdmin } from "@/lib/auth/guard";
import { handleAdminError, jsonData } from "@/lib/admin/http";
import { regenerateThumb2 } from "@/lib/uploads/thumbs";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    await requireAdmin();
    return jsonData(await regenerateThumb2());
  } catch (error) {
    return handleAdminError(error, "重新生成二级缩略图失败");
  }
}
