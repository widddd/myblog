import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { createCategory, listCategories } from "@/lib/taxonomy/admin";
import { taxonomyWriteSchema } from "@/lib/validation/post";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return jsonData(await listCategories());
  } catch (error) {
    return handleAdminError(error, "读取分类失败");
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
    const parsed = taxonomyWriteSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "分类字段校验失败",
        400,
      );
    }
    return jsonData(
      await createCategory(parsed.data.name, parsed.data.slug),
      201,
    );
  } catch (error) {
    return handleAdminError(error, "创建分类失败");
  }
}
