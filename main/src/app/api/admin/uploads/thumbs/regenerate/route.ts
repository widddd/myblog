import { requireAdmin } from "@/lib/auth/guard";
import { handleAdminError, jsonData } from "@/lib/admin/http";
import { regenerateThumbs } from "@/lib/uploads/thumbs";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    await requireAdmin();
    return jsonData(await regenerateThumbs());
  } catch (error) {
    return handleAdminError(error, "重新生成缩略图失败");
  }
}
