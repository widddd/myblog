import { AdminHttpError } from "@/lib/admin/http";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { prisma } from "@/lib/db";
import type { MomentImage } from "@/lib/moments/types";
import {
  describeMomentVisibility,
  momentVisibilityPhrase,
  type MomentVisibility,
} from "@/lib/moments/visibility";
import {
  ensureVisibilityGroupExists,
  loadMomentVisibilityContext,
} from "@/lib/moments/visibility-groups";

export type { MomentImage } from "@/lib/moments/types";

export type AdminMoment = {
  id: number;
  content: string;
  images: MomentImage[];
  createdAt: Date;
  /** 生效的可见性：天数 / 到期时刻 / 是否已过期 / 被谁收紧（见 lib/moments/visibility.ts） */
  visibility: MomentVisibility;
  /** 后台列表短语，例如「3 天（三天可见组）」 */
  visibilityText: string;
};

function parseImages(raw: string): MomentImage[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as MomentImage[]) : [];
  } catch {
    return [];
  }
}

type MomentRow = {
  id: number;
  content: string;
  images: string;
  createdAt: Date;
  visibilityGroupId?: number | null;
  visibilityGroup?: { id: number; name: string; days: number } | null;
};

function toAdminMoment(
  row: MomentRow,
  context: { globalDays: number },
  now: Date,
): AdminMoment {
  const visibility = describeMomentVisibility(
    {
      createdAt: row.createdAt,
      globalDays: context.globalDays,
      groupId: row.visibilityGroupId ?? row.visibilityGroup?.id ?? null,
      groupName: row.visibilityGroup?.name ?? null,
      groupDays: row.visibilityGroup?.days ?? null,
    },
    now,
  );
  return {
    id: row.id,
    content: row.content,
    images: parseImages(row.images),
    createdAt: row.createdAt,
    visibility,
    visibilityText: momentVisibilityPhrase(visibility),
  };
}

/** 后台列表要带上可见范围组，否则无法显示"这条按什么规则对外"。 */
const ADMIN_MOMENT_INCLUDE = {
  visibilityGroup: { select: { id: true, name: true, days: true } },
} as const;

export async function listAdminMoments(
  page: number,
  pageSize: number,
  now: Date = new Date(),
) {
  const context = await loadMomentVisibilityContext();
  const [total, rows] = await Promise.all([
    prisma.moment.count(),
    prisma.moment.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ADMIN_MOMENT_INCLUDE,
    }),
  ]);
  return {
    data: rows.map((row) => toAdminMoment(row, context, now)),
    total,
    page,
    pageSize,
  };
}

export async function createAdminMoment(input: {
  content: string;
  images?: MomentImage[];
  visibilityGroupId?: number | null;
}) {
  const groupId = input.visibilityGroupId ?? null;
  if (groupId !== null) {
    await ensureVisibilityGroupExists(groupId);
  }
  const row = await prisma.moment.create({
    data: {
      content: input.content,
      images: JSON.stringify(input.images ?? []),
      visibilityGroupId: groupId,
    },
    include: ADMIN_MOMENT_INCLUDE,
  });
  revalidatePublicContent();
  return toAdminMoment(row, await loadMomentVisibilityContext(), new Date());
}

export async function updateAdminMoment(
  id: number,
  input: {
    content?: string;
    images?: MomentImage[];
    visibilityGroupId?: number | null;
  },
) {
  const current = await prisma.moment.findUnique({ where: { id } });
  if (!current) {
    throw new AdminHttpError("NOT_FOUND", "瞬间不存在", 404);
  }
  if (input.visibilityGroupId !== undefined && input.visibilityGroupId !== null) {
    await ensureVisibilityGroupExists(input.visibilityGroupId);
  }
  const row = await prisma.moment.update({
    where: { id },
    data: {
      content: input.content,
      images:
        input.images === undefined ? undefined : JSON.stringify(input.images),
      // null = 显式改回「跟随全局可见期」，所以这里不能用 undefined 顶替
      visibilityGroupId:
        input.visibilityGroupId === undefined ? undefined : input.visibilityGroupId,
    },
    include: ADMIN_MOMENT_INCLUDE,
  });
  revalidatePublicContent();
  return toAdminMoment(row, await loadMomentVisibilityContext(), new Date());
}

export async function deleteAdminMoment(id: number) {
  const current = await prisma.moment.findUnique({ where: { id } });
  if (!current) {
    throw new AdminHttpError("NOT_FOUND", "瞬间不存在", 404);
  }
  await prisma.$transaction([
    prisma.comment.deleteMany({
      where: { targetType: "moment", targetId: id },
    }),
    prisma.moment.delete({ where: { id } }),
  ]);
  revalidatePublicContent();
}
