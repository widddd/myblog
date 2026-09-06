import { requireAdmin } from "@/lib/auth/guard";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { listHomeModules, saveHomeLayout } from "@/lib/home/layout";
import { homeLayoutPutSchema } from "@/lib/validation/home";

export const runtime = "nodejs";

function toPayload(
  items: Awaited<ReturnType<typeof listHomeModules>>,
) {
  return items.map(({ module, placement }) => ({
    moduleId: module.id,
    slug: module.slug,
    name: module.name,
    kind: module.kind,
    builtinKey: module.builtinKey,
    system: module.system,
    enabled: placement.enabled,
    col: placement.col,
    colSpan: placement.colSpan,
    row: placement.row,
    hPct: placement.hPct,
    mobileCol: placement.mobileCol,
    mobileColSpan: placement.mobileColSpan,
    mobileRow: placement.mobileRow,
    mobileHPct: placement.mobileHPct,
    sort: placement.sort,
  }));
}

export async function GET() {
  try {
    await requireAdmin();
    return jsonData(toPayload(await listHomeModules()));
  } catch (error) {
    return handleAdminError(error, "读取首页布局失败");
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }

    const parsed = homeLayoutPutSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "布局字段校验失败",
        400,
      );
    }

    await saveHomeLayout(parsed.data.items);
    revalidatePublicContent();
    return jsonData(toPayload(await listHomeModules()));
  } catch (error) {
    return handleAdminError(error, "保存首页布局失败");
  }
}
