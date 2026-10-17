import type { Prisma } from "@prisma/client";

import { AdminHttpError } from "@/lib/admin/http";
import { revalidateAlbumContent } from "@/lib/admin/revalidate";
import { ALBUM_IMAGE_MIME_PREFIX } from "@/lib/albums/types";
import { prisma } from "@/lib/db";
import { toUploadResult, type UploadResult } from "@/lib/upload/handle";
import {
  getDriver,
  loadCosSettings,
  localUploadUrl,
  publicMediaUrl,
} from "@/lib/storage";
import {
  keysForDelete,
  mimePrefixesForKinds,
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
  album?: string | null,
) {
  await loadCosSettings();
  // `?kind=` 支持逗号分隔多值（`image,video` = 瞬间配图的媒体库选择器）；空/非法 = 不过滤
  const prefixes = mimePrefixesForKinds(kind);
  const where: Prisma.UploadWhereInput =
    prefixes.length > 0
      ? { OR: prefixes.map((prefix) => ({ mime: { startsWith: prefix } })) }
      : {};
  // `?album=<id>` 只看某个相册；`?album=none` 只看未分类；缺省/非法值不加条件
  if (album === "none") {
    where.albumId = null;
  } else if (album) {
    const albumId = Number.parseInt(album, 10);
    if (Number.isInteger(albumId) && albumId > 0) {
      where.albumId = albumId;
    }
  }
  const [total, rows] = await Promise.all([
    prisma.upload.count({ where }),
    prisma.upload.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { album: { select: { id: true, title: true, slug: true } } },
    }),
  ]);

  return {
    data: rows.map((row) => toUploadResult(row, row.album)),
    total,
    page,
    pageSize,
  };
}

/**
 * 单张图片改归属（媒体库卡片上的相册下拉）。
 * `albumId` 为 null = 从相册里移出；只接受图片（相册只收图片，见 docs/albums-spec.md D9）。
 * **换相册（含移出）时卷一并清零** —— 不变量：卷必须属于照片所在的相册（旧卷属于原来的相册）。
 */
export async function setUploadAlbum(
  id: number,
  albumId: number | null,
): Promise<UploadResult> {
  await loadCosSettings();
  const row = await prisma.upload.findUnique({ where: { id } });
  if (!row) {
    throw new AdminHttpError("NOT_FOUND", "文件不存在", 404);
  }
  if (!row.mime.startsWith(ALBUM_IMAGE_MIME_PREFIX)) {
    throw new AdminHttpError("VALIDATION_ERROR", "只有图片能归入相册", 400);
  }
  if (albumId !== null) {
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      select: { id: true, title: true, slug: true },
    });
    if (!album) {
      throw new AdminHttpError("NOT_FOUND", "相册不存在，请刷新页面重试", 404);
    }
  }
  const updated = await prisma.upload.update({
    where: { id },
    data: {
      albumId,
      // 同相册不动卷；换相册 / 移出相册一律把卷清零（旧卷不属于新归属）
      ...(albumId === row.albumId ? {} : { volumeId: null }),
    },
    include: { album: { select: { id: true, title: true, slug: true } } },
  });
  // 图片归属是相册页的跨表数据 → 必须立即过期（P-089）
  revalidateAlbumContent();
  return toUploadResult(updated, updated.album);
}

/**
 * 单张媒体的当前视图：`PATCH /api/admin/uploads/[id]` 改完归属后回给前端。
 * 写操作可能有两次（改相册 + 改卷），与其在路由里拼结果，不如重读一次——响应与库里的状态必然一致。
 */
export async function getAdminUploadResult(id: number): Promise<UploadResult> {
  await loadCosSettings();
  const row = await prisma.upload.findUnique({
    where: { id },
    include: { album: { select: { id: true, title: true, slug: true } } },
  });
  if (!row) {
    throw new AdminHttpError("NOT_FOUND", "文件不存在", 404);
  }
  return toUploadResult(row, row.album);
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
