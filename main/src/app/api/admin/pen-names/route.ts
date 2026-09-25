import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { createPenName, listPenNames } from "@/lib/taxonomy/admin";
import { penNameWriteSchema } from "@/lib/validation/post";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return jsonData(await listPenNames());
  } catch (error) {
    return handleAdminError(error, "读取笔名失败");
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
    const parsed = penNameWriteSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "笔名不合法",
        400,
      );
    }
    return jsonData(await createPenName(parsed.data.name), 201);
  } catch (error) {
    return handleAdminError(error, "新建笔名失败");
  }
}
