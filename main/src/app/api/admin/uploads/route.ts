import { requireAdmin } from "@/lib/auth/guard";
import { handleAdminError, jsonPage } from "@/lib/admin/http";
import { listAdminUploads } from "@/lib/uploads/admin";
import { parsePage, parsePageSize } from "@/lib/utils/page";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const page = parsePage(url.searchParams.get("page") ?? undefined);
    const pageSize = parsePageSize(
      url.searchParams.get("pageSize") ?? undefined,
      24,
    );
    const result = await listAdminUploads(page, pageSize);
    return jsonPage(result.data, result.total, result.page, result.pageSize);
  } catch (error) {
    return handleAdminError(error, "读取媒体库失败");
  }
}
