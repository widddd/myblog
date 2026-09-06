import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";
import { toUploadResult } from "@/lib/upload/handle";
import {
  getDriver,
  loadCosSettings,
  localUploadUrl,
  publicMediaUrl,
} from "@/lib/storage";
import {
  keysForDelete,
  mimePrefixForKind,
  plannedLocations,
  uniqueKeys,
} from "@/lib/uploads/locations";

export type UploadReference = {
  posts: Array<{ id: number; title: string }>;
  moments: Array<{ id: number }>;
};

export type UploadLocationView = {
  place: "local" | "cos";
  role: "original" | "thumb" | "thumb2" | "content";
  key: string;
  url: string;
  size: number | null;
};

function referenceNeedles(keys: string[]) {
  return uniqueKeys([
    ...keys,
    ...keys.map((item) => getDriver("local").getUrl(item)),
    ...keys.map((item) => publicMediaUrl(item)),
    ...keys.map((item) => localUploadUrl(item)),
  ]);
}

async function findUploadReferences(
  keys: string[],
): Promise<UploadReference> {
  const needles = referenceNeedles(keys);
  if (needles.length === 0) {
    return { posts: [], moments: [] };
  }

  const [posts, moments] = await Promise.all([
    prisma.post.findMany({
      where: {
        OR: needles.flatMap((needle) => [
          { cover: { contains: needle } },
          { content: { contains: needle } },
        ]),
      },
      select: { id: true, title: true },
      take: 20,
    }),
    prisma.moment.findMany({
      where: {
        OR: needles.map((needle) => ({ images: { contains: needle } })),
      },
      select: { id: true },
      take: 20,
    }),
  ]);

  return { posts, moments };
}

async function statKey(place: "local" | "cos", key: string): Promise<number | null> {
  try {
    const stat = await getDriver(place).stat(key);
    return stat?.size ?? null;
  } catch {
    return null;
  }
}

export async function listAdminUploads(
  page: number,
  pageSize: number,
  kind?: string | null,
) {
  await loadCosSettings();
  const prefix = mimePrefixForKind(kind);
  const where = prefix ? { mime: { startsWith: prefix } } : {};
  const [total, rows] = await Promise.all([
    prisma.upload.count({ where }),
    prisma.upload.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: rows.map((row) => toUploadResult(row)),
    total,
    page,
    pageSize,
  };
}

export async function inspectAdminUpload(id: number) {
  const cos = await loadCosSettings();
  const row = await prisma.upload.findUnique({ where: { id } });
  if (!row) {
    throw new AdminHttpError("NOT_FOUND", "文件不存在", 404);
  }

  const locations: UploadLocationView[] = [];
  for (const plan of plannedLocations(row)) {
    if (plan.place === "cos" && !cos) {
      continue;
    }
    let chosen = plan.keys[0] ?? "";
    let size: number | null = null;
    for (const key of plan.keys) {
      const found = await statKey(plan.place, key);
      if (found != null) {
        chosen = key;
        size = found;
        break;
      }
    }
    if (!chosen) {
      continue;
    }
    locations.push({
      place: plan.place,
      role: plan.role,
      key: chosen,
      url: plan.place === "local" ? localUploadUrl(chosen) : publicMediaUrl(chosen),
      size,
    });
  }

  return {
    file: toUploadResult(row),
    locations,
    references: await findUploadReferences(keysForDelete(row)),
  };
}

export async function deleteAdminUpload(
  id: number,
  options: { keepCos?: boolean } = {},
) {
  await loadCosSettings();
  const row = await prisma.upload.findUnique({ where: { id } });
  if (!row) {
    throw new AdminHttpError("NOT_FOUND", "文件不存在", 404);
  }

  const keys = keysForDelete(row);
  const local = getDriver("local");
  await Promise.all(keys.map((key) => local.delete(key).catch(() => undefined)));

  if (!options.keepCos) {
    const cos = getDriver("cos");
    await Promise.all(keys.map((key) => cos.delete(key).catch(() => undefined)));
    await prisma.upload.delete({ where: { id } });
  }
}

export { uniqueKeys };
