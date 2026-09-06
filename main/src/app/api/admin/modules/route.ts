import { requireAdmin } from "@/lib/auth/guard";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { createCustomModule, listHomeModules } from "@/lib/home/layout";
import { moduleCreateSchema } from "@/lib/validation/home";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const items = await listHomeModules();
    return jsonData(
      items.map(({ module, placement }) => ({
        id: module.id,
        slug: module.slug,
        name: module.name,
        kind: module.kind,
        builtinKey: module.builtinKey,
        system: module.system,
        blockCount: module.blocks.length,
        hasCode: Boolean(module.html || module.css || module.js),
        enabled: placement.enabled,
      })),
    );
  } catch (error) {
    return handleAdminError(error, "读取模块列表失败");
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

    const parsed = moduleCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "模块字段校验失败",
        400,
      );
    }

    const id = await createCustomModule(parsed.data);
    revalidatePublicContent();
    return jsonData({ id }, 201);
  } catch (error) {
    return handleAdminError(error, "新建模块失败");
  }
}
