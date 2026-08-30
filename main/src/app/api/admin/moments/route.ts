import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
  jsonPage,
} from "@/lib/admin/http";
import { createAdminMoment, listAdminMoments } from "@/lib/moments/admin";
import { parsePage, parsePageSize } from "@/lib/utils/page";
import { momentWriteSchema } from "@/lib/validation/post";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const page = parsePage(url.searchParams.get("page") ?? undefined);
    const pageSize = parsePageSize(url.searchParams.get("pageSize") ?? undefined);
    const result = await listAdminMoments(page, pageSize);
    return jsonPage(result.data, result.total, result.page, result.pageSize);
  } catch (error) {
    return handleAdminError(error, "读取瞬间失败");
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = momentWriteSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "瞬间字段校验失败",
        400,
      );
    }
    return jsonData(await createAdminMoment(parsed.data), 201);
  } catch (error) {
    return handleAdminError(error, "发布瞬间失败");
  }
}
