import { handleAdminError, jsonPage } from "@/lib/admin/http";
import { listPublicMoments } from "@/lib/moments/query";
import { fingerprint, getClientIp } from "@/lib/utils/fingerprint";
import { parsePage, parsePageSize } from "@/lib/utils/page";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fp = fingerprint(
      getClientIp(request.headers),
      request.headers.get("user-agent") ?? "",
    );
    const result = await listPublicMoments({
      page: parsePage(url.searchParams.get("page") ?? undefined),
      pageSize: parsePageSize(url.searchParams.get("pageSize") ?? undefined, 12, 50),
      fingerprint: fp,
    });
    return jsonPage(result.data, result.total, result.page, result.pageSize);
  } catch (error) {
    return handleAdminError(error, "读取瞬间失败");
  }
}
