import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";
import { getDriver } from "@/lib/storage";

type StoredVariants = {
  thumb?: { key: string };
  content?: { key: string };
};

function parseVariants(raw: string): StoredVariants {
  try {
    const parsed = JSON.parse(raw) as StoredVariants;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function referenceNeedles(key: string, extraKeys: string[]) {
  const keys = [key, ...extraKeys];
  const urls = keys.map((item) => getDriver("local").getUrl(item));
  return [...keys, ...urls];
}

export async function listAdminUploads(page: number, pageSize: number) {
  const [total, rows] = await Promise.all([
    prisma.upload.count(),
    prisma.upload.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: rows.map((row) => {
      const variants = parseVariants(row.variants);
      const driver = getDriver(row.driver);
      return {
        id: row.id,
        hash: row.hash,
        mime: row.mime,
        size: row.size,
        width: row.width,
        height: row.height,
        createdAt: row.createdAt,
        original: { key: row.key, url: driver.getUrl(row.key) },
        thumb: variants.thumb
          ? { key: variants.thumb.key, url: driver.getUrl(variants.thumb.key) }
          : null,
        content: variants.content
          ? {
              key: variants.content.key,
              url: driver.getUrl(variants.content.key),
            }
          : null,
      };
    }),
    total,
    page,
    pageSize,
  };
}

export async function deleteAdminUpload(id: number) {
  const row = await prisma.upload.findUnique({ where: { id } });
  if (!row) {
    throw new AdminHttpError("NOT_FOUND", "文件不存在", 404);
  }

  const variants = parseVariants(row.variants);
  const extraKeys = [variants.thumb?.key, variants.content?.key].filter(
    (value): value is string => Boolean(value),
  );
  const needles = referenceNeedles(row.key, extraKeys);

  const [postHit, momentHit] = await Promise.all([
    prisma.post.findFirst({
      where: {
        OR: needles.flatMap((needle) => [
          { cover: { contains: needle } },
          { content: { contains: needle } },
        ]),
      },
      select: { id: true },
    }),
    prisma.moment.findFirst({
      where: {
        OR: needles.map((needle) => ({ images: { contains: needle } })),
      },
      select: { id: true },
    }),
  ]);

  if (postHit || momentHit) {
    throw new AdminHttpError("IN_USE", "文件仍被文章或瞬间引用，无法删除", 409);
  }

  const driver = getDriver(row.driver);
  await Promise.all(
    [row.key, ...extraKeys].map((key) => driver.delete(key).catch(() => undefined)),
  );
  await prisma.upload.delete({ where: { id } });
}
