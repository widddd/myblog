import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";
import { resolvePublicImageUrl } from "@/lib/moments/media";
import type { MomentImage, PublicMoment, PublicMomentImage } from "@/lib/moments/types";

export type { PublicMoment, PublicMomentImage } from "@/lib/moments/types";

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
      const src =
        resolvePublicImageUrl(image.thumb) ?? resolvePublicImageUrl(image.key);
      if (!src) {
        return [];
      }
      return [
        {
          ...image,
          src,
          thumbSrc: resolvePublicImageUrl(image.thumb) ?? src,
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
