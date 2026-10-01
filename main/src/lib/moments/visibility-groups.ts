import { AdminHttpError } from "@/lib/admin/http";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { prisma } from "@/lib/db";
import {
  MOMENT_VISIBILITY_DAYS_KEY,
  MOMENT_VISIBILITY_UNLIMITED,
  normalizeVisibilityDays,
  type MomentVisibilityGroupInfo,
} from "@/lib/moments/visibility";
import { getSetting } from "@/lib/settings";

export type { MomentVisibilityGroupInfo } from "@/lib/moments/visibility";

export type MomentVisibilityContext = {
  globalDays: number;
  groups: MomentVisibilityGroupInfo[];
};

/** 全局可见期（天，0 = 永久公开）。 */
export async function getMomentVisibleDays(): Promise<number> {
  return normalizeVisibilityDays(await getSetting(MOMENT_VISIBILITY_DAYS_KEY));
}

export async function listMomentVisibilityGroups(): Promise<
  MomentVisibilityGroupInfo[]
> {
  const rows = await prisma.momentVisibilityGroup.findMany({
    orderBy: [{ days: "asc" }, { id: "asc" }],
    select: { id: true, name: true, days: true },
  });
  return rows.map((row) => ({ ...row, days: normalizeVisibilityDays(row.days) }));
}

/** 公开查询一次拿全：全局天数 + 所有组（避免逐条瞬间查库）。 */
export async function loadMomentVisibilityContext(): Promise<MomentVisibilityContext> {
  const [globalDays, groups] = await Promise.all([
    getMomentVisibleDays(),
    listMomentVisibilityGroups(),
  ]);
  return { globalDays, groups };
}

export async function ensureVisibilityGroupExists(id: number): Promise<void> {
  const group = await prisma.momentVisibilityGroup.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!group) {
    throw new AdminHttpError("NOT_FOUND", "可见范围组不存在，请刷新页面重试", 404);
  }
}

export async function createMomentVisibilityGroup(input: {
  name: string;
  days: number;
}): Promise<MomentVisibilityGroupInfo> {
  const name = input.name.trim();
  const existing = await prisma.momentVisibilityGroup.findUnique({
    where: { name },
    select: { id: true },
  });
  if (existing) {
    throw new AdminHttpError("VALIDATION_ERROR", `已经有叫「${name}」的可见范围组`, 409);
  }
  const row = await prisma.momentVisibilityGroup.create({
    data: { name, days: normalizeVisibilityDays(input.days) },
    select: { id: true, name: true, days: true },
  });
  revalidatePublicContent();
  return { ...row, days: normalizeVisibilityDays(row.days) };
}

export async function updateMomentVisibilityGroup(
  id: number,
  input: { name?: string; days?: number },
): Promise<MomentVisibilityGroupInfo> {
  const current = await prisma.momentVisibilityGroup.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!current) {
    throw new AdminHttpError("NOT_FOUND", "可见范围组不存在", 404);
  }
  const name = input.name?.trim();
  if (name) {
    const duplicated = await prisma.momentVisibilityGroup.findUnique({
      where: { name },
      select: { id: true },
    });
    if (duplicated && duplicated.id !== id) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        `已经有叫「${name}」的可见范围组`,
        409,
      );
    }
  }
  const row = await prisma.momentVisibilityGroup.update({
    where: { id },
    data: {
      name: name || undefined,
      days: input.days === undefined ? undefined : normalizeVisibilityDays(input.days),
    },
    select: { id: true, name: true, days: true },
  });
  revalidatePublicContent();
  return { ...row, days: normalizeVisibilityDays(row.days) };
}

/**
 * 删除可见范围组。不删瞬间：用它的瞬间回落到「全局可见期」（外键 SetNull），
 * 返回受影响条数给后台做二次确认文案。
 */
export async function deleteMomentVisibilityGroup(id: number): Promise<{
  id: number;
  affectedMoments: number;
}> {
  const current = await prisma.momentVisibilityGroup.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!current) {
    throw new AdminHttpError("NOT_FOUND", "可见范围组不存在", 404);
  }
  const affectedMoments = await prisma.moment.count({
    where: { visibilityGroupId: id },
  });
  await prisma.momentVisibilityGroup.delete({ where: { id } });
  revalidatePublicContent();
  return { id, affectedMoments };
}

/** 删除前的确认文案：说清会影响几条瞬间、之后按什么规则显示。 */
export async function describeVisibilityGroupDeletion(id: number): Promise<{
  id: number;
  name: string;
  days: number;
  affectedMoments: number;
  globalDays: number;
  fallbackNote: string;
  globalLimited: boolean;
}> {
  const group = await prisma.momentVisibilityGroup.findUnique({
    where: { id },
    select: { id: true, name: true, days: true },
  });
  if (!group) {
    throw new AdminHttpError("NOT_FOUND", "可见范围组不存在", 404);
  }
  const [affectedMoments, globalDays] = await Promise.all([
    prisma.moment.count({ where: { visibilityGroupId: id } }),
    getMomentVisibleDays(),
  ]);
  return {
    id: group.id,
    name: group.name,
    days: normalizeVisibilityDays(group.days),
    affectedMoments,
    globalDays,
    globalLimited: globalDays !== MOMENT_VISIBILITY_UNLIMITED,
    fallbackNote:
      globalDays === MOMENT_VISIBILITY_UNLIMITED
        ? "这些瞬间会改为永久公开（当前全局可见期为「永久」）"
        : `这些瞬间会改按全局可见期的 ${globalDays} 天显示，可能提前或延后到期`,
  };
}
