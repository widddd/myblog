/**
 * 相册的对外投影类型。**不 import prisma / react**，client 组件与测试都能直接引。
 * 设计说明见 docs/albums-spec.md。
 *
 * 三档图片地址的口径（与瞬间模块完全同一套，见 docs/moments-home-spec.md §2.6）：
 * - `thumb2Src` 二级缩略图（只本地，默认最长边 320）= 网格与首页滚动预览；
 * - `thumbSrc`  一级缩略图（本地 + COS，默认 480）= 相册里「展开」的那一张；
 * - `src`       原图（COS 直连优先）= 灯箱大图。
 */

/**
 * 相册只收图片——**这个前缀是唯一口径**（后台归册、相册页、首页图池、媒体库下拉共用）。
 * 放在类型文件里的原因：它要被 query / admin / uploads-admin 三处共用，而本文件没有依赖。
 */
export const ALBUM_IMAGE_MIME_PREFIX = "image/";

/** 相册详情页每页多少张（与 `lib/albums/query.ts` 共用，放这儿是为了让页面也能引）。 */
export const ALBUM_PAGE_SIZE = 60;

/** 相册里的一张照片（**展示层**）：只带一级缩略图 + 原图地址。
 *  原图地址只写进 `data-lightbox-src`，默认展示阶段**不加载**（见 docs/albums-spec.md §3.4）。 */
export type AlbumPhoto = {
  /** 原图 storage key（灯箱按它取原图 / 命中缓存） */
  key: string;
  /** 原图公开地址（已配 COS 时是直链）——只用于灯箱，别直接进 `<img src>` */
  src: string;
  /** 一级缩略图：相册详情的照片与 banner 都用它 */
  thumbSrc: string;
  width?: number;
  height?: number;
};

/** 相册列表 / 首页滚动预览用：多一张二级缩略图（只本地，最省流量）。 */
export type AlbumGridImage = AlbumPhoto & {
  /** 二级缩略图（只本地；缺文件时查询层与 `Thumb2Image` 都会回退到一级） */
  thumb2Src: string;
};

/** @deprecated 新代码请用 `AlbumGridImage`（列表/首页）或 `AlbumPhoto`（详情）。
 *  保留别名只是为了让既有调用点（首页相册模块、灯箱接线）不在同一次改动里被迫搬家。 */
export type AlbumImage = AlbumGridImage;

/**
 * 详情页里的一"卷"：组头（卷名 · 张数）+ 这一卷的照片。
 *
 * **只有卷名非空的卷才会出现在 `volumes` 里**：卷名为空 = 这一卷不作为独立分组，
 * 它的照片并入 `PublicAlbumDetail.loose`（「不属于任何卷」那一组，排在最前，组头只显示张数）。
 * 也正因为组头不再有自动日期，这里没有 `dateText`（`album.dateText` 只给相册头图元信息用）。
 */
export type PublicAlbumVolume = {
  id: number;
  title: string;
  photos: AlbumPhoto[];
};

export type PublicAlbum = {
  slug: string;
  title: string;
  description: string;
  /** 相册里的图片张数 */
  count: number;
  /** 卷数（详情页组头与列表元信息用） */
  volumeCount: number;
  /** 全部照片的日期区间（组头同款文案，如「3 月 28 日 — 4 月 2 日」）；没有照片时为 "" */
  dateText: string;
  /** 封面：手动选的优先，否则第一张；相册里没有图时为 null */
  cover: AlbumGridImage | null;
  /** 列表卡封面那一叠：最多 4 张（封面在最上），二级缩略图 */
  images: AlbumGridImage[];
};

export type PublicAlbumDetail = {
  slug: string;
  title: string;
  description: string;
  count: number;
  /** 全部照片的日期区间（组头同款文案，如「3 月 28 日 — 4 月 2 日」）；没有照片时为 "" */
  dateText: string;
  /** banner 用一级缩略图（图更大，二级会糊） */
  cover: AlbumPhoto | null;
  /** 有卷时按卷分组（按 sort → id）；**只含卷名非空的卷**；空卷名的卷并入 `loose` */
  volumes: PublicAlbumVolume[];
  /**
   * 「不属于任何卷」的照片，**排在最前**：相册没建卷时 = 全部照片；建了卷但没归卷的散图、
   * 以及**卷名为空的卷**里的照片，全都合进这一组（页面上只有一组无名的，组头只显示张数）
   */
  loose: AlbumPhoto[];
  total: number;
};

/** 首页相册模块的图池：每张带它属于哪个相册（点图直接去那个相册）。 */
export type HomeAlbumImage = AlbumGridImage & {
  albumSlug: string;
  albumTitle: string;
};

/** 下拉里的一个卷选项（只要 id + 标题，别把张数带进 client）。 */
export type AlbumVolumeOption = {
  id: number;
  title: string;
};

/**
 * 后台「相册 + 它的卷」选项：**上传预览弹窗与媒体库卡片的相册 / 卷下拉共用同一个形状**。
 * 服务端页面查好后传进来（`listAdminAlbums()` + 每个相册一次 `listAlbumVolumes()`），
 * client 组件不必各自拼数据。`volumes` 为空数组 = 这个相册还没建卷（或调用方拿不到卷数据）
 * → 卷下拉退化成只有「暂不分类」一项，不报错、也不挡上传（见 docs/albums-spec.md §3.7）。
 */
export type AlbumOption = {
  id: number;
  title: string;
  /** 该相册的卷，按 `sort → id` 排好 */
  volumes: AlbumVolumeOption[];
};

/** 后台：相册里的一卷（给相册编辑页 / 上传弹窗的卷下拉用）。 */
export type AdminAlbumVolumeView = {
  id: number;
  albumId: number;
  title: string;
  sort: number;
  /** 已归入本卷的图片张数 */
  count: number;
};

/** 后台列表 / 详情用的相册视图（时间文案由服务端算好，client 不调 toLocaleString）。 */
export type AdminAlbumView = {
  id: number;
  slug: string;
  title: string;
  description: string;
  enabled: boolean;
  sort: number;
  count: number;
  coverId: number | null;
  coverThumbSrc: string | null;
  createdAtText: string;
  updatedAtText: string;
};
