import type { Prisma } from "@prisma/client";

import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";
import { resolvePublicImageUrl, resolveThumb2Src } from "@/lib/moments/media";
import type {
  HomeMoment,
  HomeMomentImage,
  MomentImage,
  PublicMoment,
  PublicMomentImage,
} from "@/lib/moments/types";
import { buildMomentVisibilityFilter } from "@/lib/moments/visibility";
import { loadMomentVisibilityContext } from "@/lib/moments/visibility-groups";
import { loadCosSettings } from "@/lib/storage";
import { readThumb2MaxPx } from "@/lib/upload/handle";

export type {
  HomeMoment,
  HomeMomentImage,
  PublicMoment,
  PublicMomentImage,
} from "@/lib/moments/types";

const DEFAULT_PAGE_SIZE = 12;

/**
 * 公开侧可见期条件（唯一入口）。
 * `buildMomentVisibilityFilter()` 在"全局永久 + 无分组"时返回 undefined，
 * 这里统一转成 `where: undefined`（Prisma 视作不带条件），不要改写成 `{}` / `OR: []`。
 */
function visibleWhere(input: {
  globalDays: number;
  groups: Array<{ id: number; days: number }>;
}): Prisma.MomentWhereInput | undefined {
  return buildMomentVisibilityFilter(input) as Prisma.MomentWhereInput | undefined;
}

function parseImages(raw: string): MomentImage[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as MomentImage[]) : [];
  } catch {
    return [];
  }
}

function toPublicImages(raw: string): PublicMomentImage[] {
  return parseImages(raw)
    .slice(0, 9)
    .flatMap((image) => {
      const original =
        resolvePublicImageUrl(image.key) ?? resolvePublicImageUrl(image.thumb);
      const thumbSrc = resolvePublicImageUrl(image.thumb) ?? original;
      if (!original || !thumbSrc) {
        return [];
      }
      return [
        {
          ...image,
          src: original,
          thumbSrc,
        },
      ];
    });
}

export async function listPublicMoments(options: {
  page?: number;
  pageSize?: number;
  fingerprint?: string | null;
}): Promise<{
  data: PublicMoment[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE));
  await loadCosSettings();

  // 可见期（全局 + 分组）在这里一次性收口：列表、总数、首页模块、点赞校验全走同一个 where。
  const { globalDays, groups } = await loadMomentVisibilityContext();
  const where = visibleWhere({ globalDays, groups });

  const [total, rows] = await Promise.all([
    prisma.moment.count({ where }),
    prisma.moment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        likes: options.fingerprint
          ? {
              where: { fingerprint: options.fingerprint },
              select: { id: true },
            }
          : false,
        _count: { select: { likes: true } },
      },
    }),
  ]);

  return {
    data: rows.map((row) => ({
      id: row.id,
      content: row.content,
      images: toPublicImages(row.images),
      createdAt: row.createdAt,
      likeCount: row._count.likes,
      liked: Array.isArray(row.likes) && row.likes.length > 0,
    })),
    total,
    page,
    pageSize,
  };
}

export async function listHomeMoments(limit: number): Promise<HomeMoment[]> {
  const pageSize = Math.min(12, Math.max(1, Math.round(limit)));
  await loadCosSettings();
  const maxPx = await readThumb2MaxPx();
  const { globalDays, groups } = await loadMomentVisibilityContext();
  const rows = await prisma.moment.findMany({
    where: visibleWhere({ globalDays, groups }),
    orderBy: { createdAt: "desc" },
    take: pageSize,
    select: { id: true, content: true, images: true },
  });

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      content: row.content,
      images: await toHomeImages(row.images, maxPx),
    })),
  );
}

async function toHomeImages(raw: string, maxPx: number): Promise<HomeMomentImage[]> {
  return Promise.all(
    parseImages(raw)
      .slice(0, 9)
      .flatMap((image) => {
        const original =
          resolvePublicImageUrl(image.key) ?? resolvePublicImageUrl(image.thumb);
        const thumbSrc = resolvePublicImageUrl(image.thumb) ?? original;
        if (!original || !thumbSrc) {
          return [];
        }
        return [
          {
            ...image,
            src: original,
            thumbSrc,
            thumb2Src: thumbSrc,
          },
        ];
      })
      .map(async (image) => ({
        ...image,
        thumb2Src: await resolveThumb2Src(image.key, image.thumbSrc, maxPx),
      })),
  );
}

/** 公开侧"这条瞬间现在可见吗"：评论、点赞、列表都走同一个 where，避免多处各写一套。 */
export async function findVisibleMomentId(
  momentId: number,
): Promise<number | null> {
  const { globalDays, groups } = await loadMomentVisibilityContext();
  const moment = await prisma.moment.findFirst({
    where: {
      id: momentId,
      ...visibleWhere({ globalDays, groups }),
    },
    select: { id: true },
  });
  return moment?.id ?? null;
}

export async function toggleMomentLike(
  momentId: number,
  fingerprint: string,
): Promise<{ liked: boolean; likeCount: number }> {
  // 点赞也要过可见期：已过期的瞬间在公开侧一律按"不存在"处理
  const visibleId = await findVisibleMomentId(momentId);
  if (visibleId === null) {
    throw new AdminHttpError("NOT_FOUND", "瞬间不存在", 404);
  }

  const existing = await prisma.momentLike.findUnique({
    where: {
      momentId_fingerprint: { momentId, fingerprint },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.momentLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.momentLike.create({
      data: { momentId, fingerprint },
    });
  }

  const likeCount = await prisma.momentLike.count({ where: { momentId } });
  return { liked: !existing, likeCount };
}
