import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { resolveGroupView } from "@/lib/moments/visibility-group-view";
import {
  createMomentVisibilityGroup,
  getMomentVisibleDays,
  listMomentVisibilityGroups,
} from "@/lib/moments/visibility-groups";
import { momentVisibilityGroupWriteSchema } from "@/lib/validation/moment-visibility";

export const runtime = "nodejs";

async function toView() {
  const [globalDays, groups] = await Promise.all([
    getMomentVisibleDays(),
    listMomentVisibilityGroups(),
  ]);
  return {
    globalDays,
    groups: groups.map((group) => resolveGroupView(group, globalDays)),
  };
}

export async function GET() {
  try {
    await requireAdmin();
    return jsonData(await toView());
  } catch (error) {
    return handleAdminError(error, "读取可见范围组失败");
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
    const parsed = momentVisibilityGroupWriteSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "可见范围组字段校验失败",
        400,
      );
    }
    await createMomentVisibilityGroup(parsed.data);
    return jsonData(await toView(), 201);
  } catch (error) {
    return handleAdminError(error, "创建可见范围组失败");
  }
}
