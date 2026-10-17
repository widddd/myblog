/**
 * 相册的**后台写**层：相册 CRUD + 卷 CRUD + 图片归册 / 归卷 / 移出 / 设封面。
 *
 * 红线：
 * 1. 所有写成功后都要 `revalidateAlbumContent()` —— 相册页在 `cachedPublic` 里，
 *    而「哪张图属于哪个相册 / 哪一卷」是 `Upload.albumId` / `Upload.volumeId` 这类跨表字段，
 *    必须**立即**过期（P-089）。
 * 2. **不变量：照片的卷必须属于它所在的相册**（`volume.albumId === upload.albumId`）。
 *    凡是要改 `albumId` 的地方，必须同时处理 `volumeId`：换相册 = 卷清零，
 *    归卷 = 先确认卷与照片同相册。数据库没有跨列约束，这条只能在这里守。
 *
 * 相册只收图片（`image/*`）：非图片在归册时被跳过并回报条数，不报错（媒体库里视频/音频
 * 不上相册下拉，这里只是兜住 API 直连的情况）。
 */

import type { Upload } from "@prisma/client";

import { AdminHttpError } from "@/lib/admin/http";
import { revalidateAlbumContent } from "@/lib/admin/revalidate";
import { prisma } from "@/lib/db";
import { resolvePublicImageUrl } from "@/lib/moments/media";
import { loadCosSettings } from "@/lib/storage";
import { toUploadResult, type UploadResult } from "@/lib/upload/handle";
import { parseVariants } from "@/lib/upload/handle";
import { formatDateTimeSeconds } from "@/lib/utils/date";

import { ALBUM_IMAGE_MIME_PREFIX, type AdminAlbumView, type AdminAlbumVolumeView } from "./types";
import {
  albumSlugFromTitle,
  isValidAlbumSlug,
  normalizeAlbumSlugInput,
  uniqueAlbumSlug,
} from "./slug";

/** 后台相册详情页一次最多列多少张（再多就该用媒体库筛了）。 */
export const ALBUM_ADMIN_IMAGES_MAX = 240;

type AlbumRow = {
  id: number;
  slug: string;
  title: string;
  description: string;
  enabled: boolean;
  sort: number;
  coverId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 一级缩略图地址（列表 / 详情的小封面都用它，省流量）。 */
function thumbUrlOf(row: Pick<Upload, "key" | "variants">): string | null {
  const variants = parseVariants(row.variants);
  return (
    resolvePublicImageUrl(variants.thumb?.key) ?? resolvePublicImageUrl(row.key)
  );
}

function toView(
  row: AlbumRow,
  extras: { count: number; coverThumbSrc: string | null },
): AdminAlbumView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    enabled: row.enabled,
    sort: row.sort,
    count: extras.count,
    coverId: row.coverId,
    coverThumbSrc: extras.coverThumbSrc,
    createdAtText: formatDateTimeSeconds(row.createdAt),
    updatedAtText: formatDateTimeSeconds(row.updatedAt),
  };
}

async function takenSlugs(exceptId?: number): Promise<string[]> {
  const rows = await prisma.album.findMany({
    where: exceptId ? { id: { not: exceptId } } : {},
    select: { slug: true },
  });
  return rows.map((row) => row.slug);
}

async function requireAlbum(id: number): Promise<AlbumRow> {
  const row = await prisma.album.findUnique({ where: { id } });
  if (!row) {
    throw new AdminHttpError("NOT_FOUND", "相册不存在，请刷新页面重试", 404);
  }
  return row;
}

/**
 * 手填地址名优先；留空则从标题生成并去重。
 * 手填撞名直接 409（不偷偷改名——用户看到的就是他填的，撞了让他改）。
 */
async function resolveSlug(
  input: { slug?: string; title: string },
  exceptId?: number,
): Promise<string> {
  const manual = input.slug ? normalizeAlbumSlugInput(input.slug) : "";
  const taken = await takenSlugs(exceptId);
  if (!manual) {
    return uniqueAlbumSlug(albumSlugFromTitle(input.title), taken);
  }
  if (!isValidAlbumSlug(manual)) {
    throw new AdminHttpError(
      "VALIDATION_ERROR",
      "地址名只能用字母、数字、汉字、- 和 _，且不能以符号开头或结尾",
      400,
    );
  }
  if (taken.includes(manual)) {
    throw new AdminHttpError("VALIDATION_ERROR", `地址名「${manual}」已被占用`, 409);
  }
  return manual;
}

export async function listAdminAlbums(): Promise<AdminAlbumView[]> {
  await loadCosSettings();
  const rows = await prisma.album.findMany({
    orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
    include: { cover: true },
  });
  if (rows.length === 0) {
    return [];
  }

  const counts = await prisma.upload.groupBy({
    by: ["albumId"],
    where: {
      albumId: { in: rows.map((row) => row.id) },
      mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX },
    },
    _count: { _all: true },
  });
  const countByAlbum = new Map(
    counts.map((entry) => [entry.albumId, entry._count._all] as const),
  );

  const firstImages = await prisma.upload.findMany({
    where: {
      albumId: { in: rows.map((row) => row.id) },
      mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, albumId: true, key: true, variants: true },
  });
  const firstByAlbum = new Map<number, (typeof firstImages)[number]>();
  for (const image of firstImages) {
    if (image.albumId != null && !firstByAlbum.has(image.albumId)) {
      firstByAlbum.set(image.albumId, image);
    }
  }

  return rows.map((row) => {
    const cover =
      row.cover &&
      row.cover.mime.startsWith(ALBUM_IMAGE_MIME_PREFIX) &&
      // 封面必须**仍在这个相册里**：图片被移到别的相册 / 被移出时 coverId 可能还指着它
      row.cover.albumId === row.id
        ? row.cover
        : (firstByAlbum.get(row.id) ?? null);
    return toView(row, {
      count: countByAlbum.get(row.id) ?? 0,
      coverThumbSrc: cover ? thumbUrlOf(cover) : null,
    });
  });
}

/** 后台相册详情：相册本体 + 已入册的图片（媒体库卡片同款式）。 */
export async function getAdminAlbum(id: number): Promise<{
  album: AdminAlbumView;
  images: UploadResult[];
  imagesTruncated: boolean;
} | null> {
  await loadCosSettings();
  const row = await prisma.album.findUnique({
    where: { id },
    include: { cover: true },
  });
  if (!row) {
    return null;
  }

  const where = { albumId: id, mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX } };
  const [total, images] = await Promise.all([
    prisma.upload.count({ where }),
    prisma.upload.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ALBUM_ADMIN_IMAGES_MAX,
    }),
  ]);

  const cover =
    row.cover &&
    row.cover.mime.startsWith(ALBUM_IMAGE_MIME_PREFIX) &&
    row.cover.albumId === row.id
      ? row.cover
      : (images[0] ?? null);

  return {
    album: toView(row, {
      count: total,
      coverThumbSrc: cover ? thumbUrlOf(cover) : null,
    }),
    images: images.map((image) => toUploadResult(image)),
    imagesTruncated: total > images.length,
  };
}

export async function createAlbum(input: {
  title: string;
  slug?: string;
  description?: string;
  enabled?: boolean;
  sort?: number;
}): Promise<AdminAlbumView> {
  const slug = await resolveSlug({ slug: input.slug, title: input.title });
  const row = await prisma.album.create({
    data: {
      slug,
      title: input.title,
      description: input.description ?? "",
      enabled: input.enabled ?? true,
      sort: input.sort ?? 0,
    },
  });
  revalidateAlbumContent(slug);
  return toView(row, { count: 0, coverThumbSrc: null });
}

export async function updateAlbum(
  id: number,
  patch: {
    title?: string;
    slug?: string;
    description?: string;
    enabled?: boolean;
    sort?: number;
    coverId?: number | null;
  },
): Promise<AdminAlbumView> {
  const current = await requireAlbum(id);

  // 手填了地址名才改；留空 = 保持原地址（改标题不会偷偷改地址，链接不能悄悄失效）
  const slug = patch.slug ? await resolveSlug({ slug: patch.slug, title: patch.title ?? current.title }, id) : undefined;

  if (patch.coverId != null) {
    const cover = await prisma.upload.findUnique({
      where: { id: patch.coverId },
      select: { albumId: true, mime: true },
    });
    if (!cover || cover.albumId !== id || !cover.mime.startsWith(ALBUM_IMAGE_MIME_PREFIX)) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        "封面只能是这个相册里的图片",
        400,
      );
    }
  }

  const row = await prisma.album.update({
    where: { id },
    data: {
      title: patch.title ?? undefined,
      slug,
      description: patch.description ?? undefined,
      enabled: patch.enabled ?? undefined,
      sort: patch.sort ?? undefined,
      coverId: patch.coverId === undefined ? undefined : patch.coverId,
    },
    include: { cover: true },
  });

  const count = await prisma.upload.count({
    where: { albumId: id, mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX } },
  });
  const first = row.cover
    ? row.cover
    : await prisma.upload.findFirst({
        where: { albumId: id, mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });

  revalidateAlbumContent(row.slug);
  return toView(row, {
    count,
    coverThumbSrc: first ? thumbUrlOf(first) : null,
  });
}

/** 删除相册：**只解绑不删图**（外键 SetNull），返回受影响张数供后台二次确认文案。 */
export async function deleteAlbum(id: number): Promise<{
  id: number;
  slug: string;
  title: string;
  affectedImages: number;
}> {
  const current = await requireAlbum(id);
  const affectedImages = await prisma.upload.count({
    where: { albumId: id, mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX } },
  });
  await prisma.album.delete({ where: { id } });
  revalidateAlbumContent(current.slug);
  return {
    id: current.id,
    slug: current.slug,
    title: current.title,
    affectedImages,
  };
}

/** 批量归册。只吃图片；非图片 / 不存在的 id 记进 `skipped`，不报错。
 *  **换相册 = 卷清零**（不变量：卷必须属于照片所在相册），调用方要的话再单独归卷。 */
export async function assignUploads(
  albumId: number,
  uploadIds: number[],
): Promise<{ assigned: number; skipped: number; total: number }> {
  await requireAlbum(albumId);
  const unique = [...new Set(uploadIds)];
  const result = await prisma.upload.updateMany({
    where: { id: { in: unique }, mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX } },
    data: { albumId, volumeId: null },
  });
  revalidateAlbumContent();
  return {
    assigned: result.count,
    skipped: unique.length - result.count,
    total: unique.length,
  };
}

/** 批量移出（回到「未分类」）。只影响本来就在这个相册里的行；卷一并清零。 */
export async function removeUploads(
  albumId: number,
  uploadIds: number[],
): Promise<{ removed: number }> {
  await requireAlbum(albumId);
  const unique = [...new Set(uploadIds)];
  const result = await prisma.upload.updateMany({
    where: { id: { in: unique }, albumId },
    data: { albumId: null, volumeId: null },
  });
  // 被移出的那张正好是封面 → 一起清掉，否则封面会指向一个已经不在相册里的图
  if (result.count > 0) {
    await prisma.album.updateMany({
      where: { id: albumId, coverId: { in: unique } },
      data: { coverId: null },
    });
  }
  revalidateAlbumContent();
  return { removed: result.count };
}

/* ------------------------------------------------------------------ 卷（AlbumVolume） */

async function requireVolume(id: number): Promise<{
  id: number;
  albumId: number;
  title: string;
  sort: number;
}> {
  const row = await prisma.albumVolume.findUnique({ where: { id } });
  if (!row) {
    throw new AdminHttpError("NOT_FOUND", "这一卷不存在，请刷新页面重试", 404);
  }
  return row;
}

/** 某相册的卷（后台）：按 sort → id，带各自的图片数。 */
export async function listAlbumVolumes(
  albumId: number,
): Promise<AdminAlbumVolumeView[]> {
  const rows = await prisma.albumVolume.findMany({
    where: { albumId },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    select: { id: true, albumId: true, title: true, sort: true },
  });
  const counts = await prisma.upload.groupBy({
    by: ["volumeId"],
    where: {
      volumeId: { in: rows.map((row) => row.id) },
      mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX },
    },
    _count: { _all: true },
  });
  const countByVolume = new Map(
    counts.map((entry) => [entry.volumeId, entry._count._all] as const),
  );
  return rows.map((row) => ({
    ...row,
    count: countByVolume.get(row.id) ?? 0,
  }));
}

/**
 * 建卷。**标题留空 = 服务端给「第 N 卷」**（友好默认，保留）：
 * 新建时"空着不填"是「我懒得起名」，不是「我要一个无名的筐」——
 * 想要后者请走「改名清空」（`updateAlbumVolume` 收空串，读层把它并入「不属于任何卷」那组）。
 * 排到末尾。
 */
export async function createAlbumVolume(
  albumId: number,
  input: { title?: string } = {},
): Promise<AdminAlbumVolumeView> {
  await requireAlbum(albumId);
  const existing = await prisma.albumVolume.findMany({
    where: { albumId },
    select: { sort: true },
    orderBy: { sort: "desc" },
    take: 1,
  });
  const sort = (existing[0]?.sort ?? -1) + 1;
  const title = input.title?.trim() || `第 ${sort + 1} 卷`;
  const row = await prisma.albumVolume.create({
    data: { albumId, title, sort },
  });
  revalidateAlbumContent();
  return { id: row.id, albumId: row.albumId, title: row.title, sort: row.sort, count: 0 };
}

/**
 * 改名 / 改排序。**标题可以是空串**（校验层不再 `.min(1)`）：
 * 空卷名 = **这一卷不作为独立分组**，读层把它与散图合成同一个「不属于任何卷」的组
 * （`getPublicAlbum()` 不生成 `volumes` 条目）；卷本身、`Upload.volumeId` 的归属都不动，
 * 所以想让它重新成组只要再填个名字。
 */
export async function updateAlbumVolume(
  id: number,
  patch: { title?: string; sort?: number },
): Promise<AdminAlbumVolumeView> {
  const current = await requireVolume(id);
  const row = await prisma.albumVolume.update({
    where: { id },
    data: {
      title: patch.title === undefined ? undefined : patch.title.trim(),
      sort: patch.sort ?? undefined,
    },
  });
  const count = await prisma.upload.count({
    where: { volumeId: id, mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX } },
  });
  void current;
  revalidateAlbumContent();
  return { id: row.id, albumId: row.albumId, title: row.title, sort: row.sort, count };
}

/** 删卷：**只解绑**（外键 SetNull），照片留在相册里变成「未分类」，不影响媒体文件。 */
export async function deleteAlbumVolume(id: number): Promise<{
  id: number;
  albumId: number;
  affectedImages: number;
}> {
  const current = await requireVolume(id);
  const affectedImages = await prisma.upload.count({
    where: { volumeId: id, mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX } },
  });
  await prisma.albumVolume.delete({ where: { id } });
  revalidateAlbumContent();
  return { id: current.id, albumId: current.albumId, affectedImages };
}

/** 重排卷：按传入的 id 顺序写 sort（不在列表里的卷保持原样，排在其后）。 */
export async function reorderAlbumVolumes(
  albumId: number,
  ids: number[],
): Promise<AdminAlbumVolumeView[]> {
  await requireAlbum(albumId);
  const rows = await prisma.albumVolume.findMany({
    where: { albumId },
    select: { id: true },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
  });
  const wanted = ids.filter((id) => rows.some((row) => row.id === id));
  const rest = rows.map((row) => row.id).filter((id) => !wanted.includes(id));
  const order = [...wanted, ...rest];
  await prisma.$transaction(
    order.map((id, index) =>
      prisma.albumVolume.update({ where: { id }, data: { sort: index } }),
    ),
  );
  revalidateAlbumContent();
  return listAlbumVolumes(albumId);
}

/**
 * 把一批照片放入某卷（`volumeId = null` = 移出该卷，回到未分类）。
 * 只影响**本来就在这个相册里**的图片：跨相册归卷会破坏不变量，直接跳过并计数。
 * （换相册请走 `assignUploads`，它会清零卷，之后再用本函数归卷。）
 */
export async function setUploadsVolume(
  albumId: number,
  uploadIds: number[],
  volumeId: number | null,
): Promise<{ updated: number; skipped: number; total: number }> {
  await requireAlbum(albumId);
  if (volumeId !== null) {
    const volume = await requireVolume(volumeId);
    if (volume.albumId !== albumId) {
      throw new AdminHttpError("VALIDATION_ERROR", "这一卷不属于该相册", 400);
    }
  }
  const unique = [...new Set(uploadIds)];
  const result = await prisma.upload.updateMany({
    where: {
      id: { in: unique },
      albumId,
      mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX },
    },
    data: { volumeId },
  });
  revalidateAlbumContent();
  return {
    updated: result.count,
    skipped: unique.length - result.count,
    total: unique.length,
  };
}

/** 单张照片改卷（媒体库逐张编辑用）：卷必须属于这张照片所在的相册。 */
export async function setUploadVolume(
  uploadId: number,
  volumeId: number | null,
): Promise<{ id: number; albumId: number | null; volumeId: number | null }> {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, albumId: true },
  });
  if (!upload) {
    throw new AdminHttpError("NOT_FOUND", "图片不存在，请刷新页面重试", 404);
  }
  if (volumeId !== null) {
    if (upload.albumId === null) {
      throw new AdminHttpError("VALIDATION_ERROR", "请先给这张图选一个相册，再选卷", 400);
    }
    const volume = await requireVolume(volumeId);
    if (volume.albumId !== upload.albumId) {
      throw new AdminHttpError("VALIDATION_ERROR", "这一卷不属于这张图所在的相册", 400);
    }
  }
  const row = await prisma.upload.update({
    where: { id: uploadId },
    data: { volumeId },
    select: { id: true, albumId: true, volumeId: true },
  });
  revalidateAlbumContent();
  return row;
}
