import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { resolveGroupView } from "@/lib/moments/visibility-group-view";
import {
  deleteMomentVisibilityGroup,
  describeVisibilityGroupDeletion,
  getMomentVisibleDays,
  listMomentVisibilityGroups,
  updateMomentVisibilityGroup,
} from "@/lib/moments/visibility-groups";
import { momentVisibilityGroupPatchSchema } from "@/lib/validation/moment-visibility";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(raw: string) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("VALIDATION_ERROR", "无效的可见范围组 ID", 400);
  }
  return id;
}

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

/** 删除前预览：会影响几条瞬间、之后按什么规则显示。 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    return jsonData(await describeVisibilityGroupDeletion(parseId(id)));
  } catch (error) {
    return handleAdminError(error, "读取可见范围组失败");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = momentVisibilityGroupPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "可见范围组字段校验失败",
        400,
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new AdminHttpError("VALIDATION_ERROR", "没有要更新的字段", 400);
    }
    await updateMomentVisibilityGroup(parseId(id), parsed.data);
    return jsonData(await toView());
  } catch (error) {
    return handleAdminError(error, "更新可见范围组失败");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    await deleteMomentVisibilityGroup(parseId(id));
    return jsonData(await toView());
  } catch (error) {
    return handleAdminError(error, "删除可见范围组失败");
  }
}
