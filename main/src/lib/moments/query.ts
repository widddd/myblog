import type { Prisma } from "@prisma/client";

import { AdminHttpError } from "@/lib/admin/http";
import {
  MOMENT_MAX_AUDIOS,
  MOMENT_MAX_MEDIA_ITEMS,
} from "@/lib/moments/compose-rules";
import { prisma } from "@/lib/db";
import { resolvePublicImageUrl, resolveThumb2Src } from "@/lib/moments/media";
import type {
  HomeMoment,
  HomeMomentImage,
  MomentImage,
  PublicMoment,
  PublicMomentImage,
} from "@/lib/moments/types";
import { momentMediaKind } from "@/lib/moments/types";
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

/**
 * 公开投影：图片 + 视频 + 语音。
 *
 * 条数按**分项**截断（图片/视频 ≤ 9、语音 ≤ 5）—— 不能沿用"整个数组切前 9 个"，
 * 那样一条瞬间里放在后面的语音会被无声丢掉（见 docs/moment-audio-spec.md §2.6）。
 * 视频与语音都没有一级缩略图（站点不装 ffmpeg）：渲染端按 kind 走播放瓦片 / 播放行。
 */
function toPublicImages(raw: string): PublicMomentImage[] {
  const result: PublicMomentImage[] = [];
  let visual = 0;
  let audios = 0;
  for (const media of parseImages(raw)) {
    const kind = momentMediaKind(media);
    if (kind === "audio") {
      if (audios >= MOMENT_MAX_AUDIOS) {
        continue;
      }
      audios += 1;
    } else {
      if (visual >= MOMENT_MAX_MEDIA_ITEMS) {
        continue;
      }
      visual += 1;
    }
    const original =
      resolvePublicImageUrl(media.key) ?? resolvePublicImageUrl(media.thumb);
    if (!original) {
      continue;
    }
    if (kind === "image") {
      const thumbSrc = resolvePublicImageUrl(media.thumb) ?? original;
      result.push({ ...media, kind, src: original, thumbSrc });
    } else {
      result.push({ ...media, kind, src: original });
    }
  }
  return result;
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

/** 首页瞬间池的上限：瞬间模块与文章卡片的穿插共用这一批（再大也只是白查）。 */
const HOME_MOMENTS_MAX = 12;

export async function listHomeMoments(limit: number): Promise<HomeMoment[]> {
  const pageSize = Math.min(HOME_MOMENTS_MAX, Math.max(1, Math.round(limit)));
  await loadCosSettings();
  const maxPx = await readThumb2MaxPx();
  const { globalDays, groups } = await loadMomentVisibilityContext();
  const rows = await prisma.moment.findMany({
    where: visibleWhere({ globalDays, groups }),
    orderBy: { createdAt: "desc" },
    take: pageSize,
    select: { id: true, content: true, images: true, createdAt: true },
  });

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      content: row.content,
      createdAt: row.createdAt,
      images: await toHomeImages(row.images, maxPx),
    })),
  );
}

async function toHomeImages(raw: string, maxPx: number): Promise<HomeMomentImage[]> {
  const base: HomeMomentImage[] = [];
  let visual = 0;
  let audios = 0;
  for (const media of parseImages(raw)) {
    const kind = momentMediaKind(media);
    if (kind === "audio") {
      if (audios >= MOMENT_MAX_AUDIOS) {
        continue;
      }
      audios += 1;
    } else {
      if (visual >= MOMENT_MAX_MEDIA_ITEMS) {
        continue;
      }
      visual += 1;
    }
    const original =
      resolvePublicImageUrl(media.key) ?? resolvePublicImageUrl(media.thumb);
    if (!original) {
      continue;
    }
    if (kind === "image") {
      const thumbSrc = resolvePublicImageUrl(media.thumb) ?? original;
      base.push({ ...media, kind, src: original, thumbSrc, thumb2Src: thumbSrc });
    } else {
      // 视频 / 语音都不进二级缩略图链路（没有封面文件，查了也只是徒劳的 stat/生成）
      base.push({ ...media, kind, src: original });
    }
  }

  return Promise.all(
    base.map(async (image) =>
      momentMediaKind(image) === "image"
        ? {
            ...image,
            thumb2Src: await resolveThumb2Src(
              image.key,
              image.thumbSrc ?? image.src,
              maxPx,
            ),
          }
        : image,
    ),
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
