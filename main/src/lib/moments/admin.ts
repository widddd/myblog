import { AdminHttpError } from "@/lib/admin/http";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { prisma } from "@/lib/db";
import type { MomentImage } from "@/lib/moments/types";

export type { MomentImage } from "@/lib/moments/types";

function parseImages(raw: string): MomentImage[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as MomentImage[]) : [];
  } catch {
    return [];
  }
}

function toAdminMoment(row: {
  id: number;
  content: string;
  images: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    content: row.content,
    images: parseImages(row.images),
    createdAt: row.createdAt,
  };
}

export async function listAdminMoments(page: number, pageSize: number) {
  const [total, rows] = await Promise.all([
    prisma.moment.count(),
    prisma.moment.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    data: rows.map(toAdminMoment),
    total,
    page,
    pageSize,
  };
}

export async function createAdminMoment(input: {
  content: string;
  images?: MomentImage[];
}) {
  const row = await prisma.moment.create({
    data: {
      content: input.content,
      images: JSON.stringify(input.images ?? []),
    },
  });
  revalidatePublicContent();
  return toAdminMoment(row);
}

export async function updateAdminMoment(
  id: number,
  input: { content?: string; images?: MomentImage[] },
) {
  const current = await prisma.moment.findUnique({ where: { id } });
  if (!current) {
    throw new AdminHttpError("NOT_FOUND", "瞬间不存在", 404);
  }
  const row = await prisma.moment.update({
    where: { id },
    data: {
      content: input.content,
      images:
        input.images === undefined ? undefined : JSON.stringify(input.images),
    },
  });
  revalidatePublicContent();
  return toAdminMoment(row);
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
