import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";
import { resolvePublicImageUrl, resolveThumb2Src } from "@/lib/moments/media";
import { loadCosSettings } from "@/lib/storage";
import { readThumb2MaxPx } from "@/lib/upload/handle";
import type {
  HomeMoment,
  HomeMomentImage,
  MomentImage,
  PublicMoment,
  PublicMomentImage,
} from "@/lib/moments/types";

export type {
  HomeMoment,
  HomeMomentImage,
  PublicMoment,
  PublicMomentImage,
} from "@/lib/moments/types";

const DEFAULT_PAGE_SIZE = 12;

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

  const [total, rows] = await Promise.all([
    prisma.moment.count(),
    prisma.moment.findMany({
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
  const rows = await prisma.moment.findMany({
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

export async function toggleMomentLike(
  momentId: number,
  fingerprint: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const moment = await prisma.moment.findUnique({
    where: { id: momentId },
    select: { id: true },
  });
  if (!moment) {
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
