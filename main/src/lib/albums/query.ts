/**
 * 相册的**公开读**层。图片地址解析**复用瞬间那套现成口径**
 * （`lib/moments/media.ts` 的 `resolvePublicImageUrl` / `resolveThumb2Src`）——
 * 那里是「原图 / 一级 / 二级」三档 URL 的唯一实现，不要再写第二套。
 *
 * **分层原则（见 docs/albums-spec.md §3.4）**：
 * - 列表页：二级缩略图（320，只本地），且一次取最多 4 张做「一叠」的封面；
 * - 详情页：一级缩略图（480），**包括 banner**；原图地址只写进 `data-lightbox-*`，点击才加载；
 * - 所以详情取数**不调 `resolveThumb2Src`**（那会为每张图当场生成二级缩略图，白烧 CPU/IO）。
 *
 * 缓存策略（见 docs/albums-spec.md §3.5）：
 * - 相册列表 / 详情走 `cachedPublic`，写入侧必须 `revalidateAlbumContent()` 立即过期
 *   （相册页依赖跨表的 `Upload.albumId` / `Upload.volumeId`，`revalidateTag(tag,"max")` 是 SWR，
 *   会先发旧值，P-089）；
 * - 首页图池**不套缓存**，与 `listHomeMoments()` 同一口径：每次渲染一查，随时反映相册增删。
 */

import type { Prisma } from "@prisma/client";

import { cachedPublic, PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import { prisma } from "@/lib/db";
import { resolvePublicImageUrl, resolveThumb2Src } from "@/lib/moments/media";
import { loadCosSettings } from "@/lib/storage";
import { parseVariants, readThumb2MaxPx } from "@/lib/upload/handle";
import { formatMonthDay } from "@/lib/utils/date";

import { isValidAlbumSlug } from "./slug";
import {
  ALBUM_IMAGE_MIME_PREFIX,
  type AlbumGridImage,
  type AlbumPhoto,
  type HomeAlbumImage,
  type PublicAlbum,
  type PublicAlbumDetail,
  type PublicAlbumVolume,
} from "./types";

export { ALBUM_IMAGE_MIME_PREFIX } from "./types";

/** 相册详情一次最多取多少张（版式不再分页，一页就是一整本；这是防呆上限）。 */
export const ALBUM_DETAIL_MAX = 500;

/** 列表卡封面那一叠最多几张（与 demo 的 `min(张数, 4)` 一致）。 */
export const ALBUM_COVER_STACK_MAX = 4;

/** 首页相册模块的取数上限：总共几张、每个相册最多贡献几张。 */
export const HOME_ALBUM_LIMIT_MAX = 24;
export const HOME_ALBUM_PER_ALBUM_MAX = 4;

const IMAGE_ONLY = {
  mime: { startsWith: ALBUM_IMAGE_MIME_PREFIX },
} satisfies Prisma.UploadWhereInput;

const uploadImageSelect = {
  id: true,
  hash: true,
  key: true,
  mime: true,
  width: true,
  height: true,
  variants: true,
  createdAt: true,
  // 封面必须校验「这张图仍属于本相册」，所以要把归属读出来
  albumId: true,
  volumeId: true,
} satisfies Prisma.UploadSelect;

type UploadImageRow = Prisma.UploadGetPayload<{
  select: typeof uploadImageSelect;
}>;

const uploadImageOrder = [
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.UploadOrderByWithRelationInput[];

/** Upload 行 → 展示用照片：一级缩略图 + 原图地址（原图地址只给灯箱，不进 `<img src>`）。 */
function toPhoto(row: UploadImageRow): AlbumPhoto | null {
  const variants = parseVariants(row.variants);
  const thumbKey = variants.thumb?.key;
  const original = resolvePublicImageUrl(row.key) ?? resolvePublicImageUrl(thumbKey);
  const thumbSrc = resolvePublicImageUrl(thumbKey) ?? original;
  if (!original || !thumbSrc) {
    return null;
  }
  return {
    key: row.key,
    src: original,
    thumbSrc,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
  };
}

/** 列表 / 首页用：多一张二级缩略图（按需生成，本地缺了就回退一级）。 */
async function toGridImage(
  row: UploadImageRow,
  maxPx: number,
): Promise<AlbumGridImage | null> {
  const photo = toPhoto(row);
  if (!photo) {
    return null;
  }
  return {
    ...photo,
    thumb2Src: await resolveThumb2Src(row.key, photo.thumbSrc, maxPx),
  };
}

async function toGridImages(
  rows: UploadImageRow[],
  maxPx: number,
): Promise<AlbumGridImage[]> {
  const resolved = await Promise.all(rows.map((row) => toGridImage(row, maxPx)));
  return resolved.filter((image): image is AlbumGridImage => image !== null);
}

/** 封面：手选的优先（但它必须**仍是这个相册里的图**），否则回落到相册里的第一张。 */
function pickCoverRow(album: {
  id: number;
  cover: UploadImageRow | null;
  uploads: UploadImageRow[];
}): UploadImageRow | null {
  const cover = album.cover;
  if (
    cover &&
    cover.mime.startsWith(ALBUM_IMAGE_MIME_PREFIX) &&
    cover.albumId === album.id
  ) {
    return cover;
  }
  return album.uploads[0] ?? null;
}

/** 列表卡的「一叠」：封面在最上，后面按上传时间倒序补到 `ALBUM_COVER_STACK_MAX` 张。 */
function stackRows(
  coverRow: UploadImageRow | null,
  rows: UploadImageRow[],
): UploadImageRow[] {
  const picked: UploadImageRow[] = [];
  const seen = new Set<number>();
  for (const row of coverRow ? [coverRow, ...rows] : rows) {
    if (row.mime.startsWith(ALBUM_IMAGE_MIME_PREFIX) && !seen.has(row.id)) {
      seen.add(row.id);
      picked.push(row);
      if (picked.length >= ALBUM_COVER_STACK_MAX) {
        break;
      }
    }
  }
  return picked;
}

/** 相册列表面（只含启用中的相册），含封面那一叠与张数。 */
export async function listPublicAlbums(): Promise<PublicAlbum[]> {
  await loadCosSettings();
  const maxPx = await readThumb2MaxPx();
  return cachedPublic(
    ["listPublicAlbums"],
    [PUBLIC_CACHE_TAGS.albums],
    async () => {
      const rows = await prisma.album.findMany({
        where: { enabled: true },
        orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          cover: { select: uploadImageSelect },
          volumes: { select: { id: true } },
          uploads: {
            where: IMAGE_ONLY,
            orderBy: uploadImageOrder,
            take: ALBUM_COVER_STACK_MAX,
            select: uploadImageSelect,
          },
        },
      });

      if (rows.length === 0) {
        return [];
      }

      const counts = await prisma.upload.groupBy({
        by: ["albumId"],
        where: { albumId: { in: rows.map((row) => row.id) }, ...IMAGE_ONLY },
        _count: { _all: true },
      });
      const countByAlbum = new Map(
        counts.map((entry) => [entry.albumId, entry._count._all] as const),
      );

      return Promise.all(
        rows.map(async (row) => {
          const images = await toGridImages(
            stackRows(pickCoverRow(row), row.uploads),
            maxPx,
          );
          return {
            slug: row.slug,
            title: row.title,
            description: row.description,
            count: countByAlbum.get(row.id) ?? 0,
            volumeCount: row.volumes.length,
            dateText: albumDateText(row.uploads),
            cover: images[0] ?? null,
            images,
          };
        }),
      );
    },
  );
}

/**
 * 相册（整册）的日期区间文案：由照片的上传时间实时算 —— 单天给一个日期，
 * 跨天给区间。**只用于相册头图元信息**（`PublicAlbum.dateText` / `PublicAlbumDetail.dateText`）；
 * 卷组头不再有自动日期（空卷名 = 并入「不属于任何卷」那组，组头只显示张数）。
 */
function albumDateText(rows: readonly { createdAt: Date }[]): string {
  if (rows.length === 0) {
    return "";
  }
  let min = rows[0].createdAt;
  let max = rows[0].createdAt;
  for (const row of rows) {
    if (row.createdAt < min) min = row.createdAt;
    if (row.createdAt > max) max = row.createdAt;
  }
  const from = formatMonthDay(min);
  const to = formatMonthDay(max);
  return from === to ? from : `${from} — ${to}`;
}

/** 相册详情：按卷分好组的照片 + 未分卷的那些。不存在或已关闭 → null（页面据此 404）。 */
export async function getPublicAlbum(slug: string): Promise<PublicAlbumDetail | null> {
  await loadCosSettings();
  return cachedPublic(
    ["getPublicAlbum", slug],
    [PUBLIC_CACHE_TAGS.albums],
    async () => {
      const album = await prisma.album.findFirst({
        where: { slug, enabled: true },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          cover: { select: uploadImageSelect },
          volumes: {
            orderBy: [{ sort: "asc" }, { id: "asc" }],
            select: { id: true, title: true },
          },
          uploads: {
            where: IMAGE_ONLY,
            orderBy: uploadImageOrder,
            take: ALBUM_DETAIL_MAX,
            select: uploadImageSelect,
          },
        },
      });
      if (!album) {
        return null;
      }

      const total = await prisma.upload.count({
        where: { albumId: album.id, ...IMAGE_ONLY },
      });

      const coverRow = pickCoverRow({ ...album, uploads: album.uploads });
      const cover = coverRow ? toPhoto(coverRow) : null;

      // 归组：只有**属于本相册、且卷名非空**的卷才成组（按 sort → id）；
      // 其余照片全部归「不属于任何卷」那一组，且绝不丢照片：
      // - 卷已被删 / 指向别的相册的行 → 落进这一组；
      // - **空卷名（trim 后为空）= 这一卷不作为独立分组**：它的照片与散图合成同一组
      //   （页面上只有一组无名的，绝不出现两个同名组，见 docs/albums-spec.md §3.5）。
      const namedVolumes = album.volumes.filter((volume) => volume.title.trim() !== "");
      const namedVolumeIds = new Set(namedVolumes.map((volume) => volume.id));
      const photosByVolume = new Map<number, AlbumPhoto[]>();
      // 空卷名的卷也按 sort → id 收一份，最后追加到该组末尾（散图恒在最前）
      const looseByVolume = new Map<number, AlbumPhoto[]>();
      const loose: AlbumPhoto[] = [];
      for (const row of album.uploads) {
        const photo = toPhoto(row);
        if (!photo) {
          continue;
        }
        const volumeId = row.volumeId;
        if (volumeId === null) {
          loose.push(photo);
        } else if (namedVolumeIds.has(volumeId)) {
          const list = photosByVolume.get(volumeId) ?? [];
          list.push(photo);
          photosByVolume.set(volumeId, list);
        } else {
          const list = looseByVolume.get(volumeId) ?? [];
          list.push(photo);
          looseByVolume.set(volumeId, list);
        }
      }
      for (const volume of album.volumes) {
        loose.push(...(looseByVolume.get(volume.id) ?? []));
      }

      const volumes: PublicAlbumVolume[] = namedVolumes
        .map((volume) => ({
          id: volume.id,
          title: volume.title,
          photos: photosByVolume.get(volume.id) ?? [],
        }))
        // 空卷不渲染（组头下一叠空照片没有意义）；卷本身还在后台留着
        .filter((volume) => volume.photos.length > 0);

      return {
        slug: album.slug,
        title: album.title,
        description: album.description,
        count: total,
        dateText: albumDateText(album.uploads),
        cover,
        volumes,
        loose,
        total,
      };
    },
  );
}

/**
 * 首页相册模块的图池：**多个相册轮流取**（round-robin，每册最多 4 张），
 * 所以是「部分相册的部分照片」混排，而不是某一个相册霸屏。
 * `albumSlugs` 为空 = 取全部启用相册（按 sort → 创建时间）。
 */
export async function listHomeAlbumImages(options: {
  albumSlugs?: readonly string[];
  limit: number;
}): Promise<HomeAlbumImage[]> {
  const limit = Math.min(
    HOME_ALBUM_LIMIT_MAX,
    Math.max(1, Math.round(options.limit)),
  );
  const slugs = (options.albumSlugs ?? []).filter(isValidAlbumSlug);

  await loadCosSettings();
  const maxPx = await readThumb2MaxPx();

  const albums = await prisma.album.findMany({
    where: slugs.length > 0 ? { enabled: true, slug: { in: slugs } } : { enabled: true },
    orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
    select: {
      slug: true,
      title: true,
      uploads: {
        where: IMAGE_ONLY,
        orderBy: uploadImageOrder,
        take: HOME_ALBUM_PER_ALBUM_MAX,
        select: uploadImageSelect,
      },
    },
  });

  const picked: Array<{ album: (typeof albums)[number]; row: UploadImageRow }> = [];
  for (let index = 0; picked.length < limit; index += 1) {
    let advanced = false;
    for (const album of albums) {
      const row = album.uploads[index];
      if (row) {
        advanced = true;
        if (picked.length < limit) {
          picked.push({ album, row });
        }
      }
    }
    if (!advanced) {
      break;
    }
  }

  const resolved = await Promise.all(
    picked.map(async ({ album, row }) => {
      const image = await toGridImage(row, maxPx);
      return image
        ? { ...image, albumSlug: album.slug, albumTitle: album.title }
        : null;
    }),
  );
  return resolved.filter((image): image is HomeAlbumImage => image !== null);
}

/**
 * 首页「相册卡片」模块的取数：**整本相册的卡**（不是图池）。
 *
 * 直接把相册列表面的那份数据裁前 N 本 —— 每本自带封面那一叠（最多 4 张 L2）、
 * 张数、卷数与日期区间，后台改一次相册首页立刻跟着变，不必另写一套投影。
 * 复用 `cachedPublic(listPublicAlbums)`：它已经挂在 `PUBLIC_CACHE_TAGS.albums` 上，
 * 相册 / 归册 / 删图的写入侧本来就会立即过期（P-089），这里不新增失效路径。
 *
 * `albumSlugs` 留空 = 全部启用相册（与滚动条那版同一语义）。
 */
export async function listHomeAlbumCards(options: {
  albumSlugs?: readonly string[];
  limit: number;
}): Promise<PublicAlbum[]> {
  const limit = Math.max(1, Math.round(options.limit));
  const wanted = new Set((options.albumSlugs ?? []).filter(isValidAlbumSlug));
  const albums = await listPublicAlbums();
  // 筛选与截断都在内存里做：相册列表本来就只有「启用中的相册」那么多，
  // 为每份名单各查一次库不划算（键会碎成一堆互不相干的缓存）
  const filtered = wanted.size > 0
    ? albums.filter((album) => wanted.has(album.slug))
    : albums;
  return filtered.slice(0, limit);
}

/** 后台：某个相册的图片（不分页，给编辑页的入册网格用）。 */
export async function listAlbumImageIds(albumId: number): Promise<number[]> {
  const rows = await prisma.upload.findMany({
    where: { albumId, ...IMAGE_ONLY },
    orderBy: uploadImageOrder,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
