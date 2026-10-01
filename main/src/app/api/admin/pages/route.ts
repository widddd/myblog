import { requireAdmin } from "@/lib/auth/guard";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import {
  createStaticPage,
  getStaticPagesDir,
  listStaticPages,
} from "@/lib/pages/admin";
import { RESERVED_SEGMENTS } from "@/lib/pages/directories";
import { staticPageWriteSchema } from "@/lib/validation/pages";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const [dir, items] = await Promise.all([getStaticPagesDir(), listStaticPages()]);
    return jsonData({
      dir,
      reserved: RESERVED_SEGMENTS,
      items: items.map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        description: item.description,
        enabled: item.enabled,
        hasCode: item.hasCode,
        codeSize: item.codeSize,
        href: `/${dir}/${item.slug}`,
      })),
    });
  } catch (error) {
    return handleAdminError(error, "读取静态页面失败");
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
    const parsed = staticPageWriteSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "页面字段校验失败",
        400,
      );
    }
    const id = await createStaticPage(parsed.data);
    revalidatePublicContent();
    return jsonData({ id }, 201);
  } catch (error) {
    return handleAdminError(error, "新建静态页面失败");
  }
}
