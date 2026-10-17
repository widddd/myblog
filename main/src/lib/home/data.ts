import { resolveHomeBanner, type HomeBanner } from "@/lib/banner/resolve";
import { listHomeAlbumCards, listHomeAlbumImages } from "@/lib/albums/query";
import type { HomeAlbumImage, PublicAlbum } from "@/lib/albums/types";
import { normalizeAlbumCardLimit, normalizeAlbumLimit } from "@/lib/home/albums";
import {
  getSidebarStats,
  listCategories,
  listPublishedPosts,
  listRecentPosts,
  listRecommendPosts,
  listTags,
} from "@/lib/posts/query";
import type { PostCardModel, TaxonomyItem } from "@/lib/posts/types";
import { listHomeMoments, type HomeMoment } from "@/lib/moments/query";
import { getPublicSettings } from "@/lib/settings";

import type { HomeLayoutItem } from "./types";

export type HomeData = {
  siteName: string;
  announcement: string;
  homeModuleOpacity: number;
  homeBackdropOpacity: number;
  homeBadgeColor: string;
  homeBadgeOpacity: number;
  banner: HomeBanner | null;
  recommend: PostCardModel[];
  recent: PostCardModel[];
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
  stats: { postCount: number; categoryCount: number; tagCount: number } | null;
  listing: {
    posts: PostCardModel[];
    total: number;
    page: number;
    pageSize: number;
    /** 穿插进文章流的瞬间（取数与瞬间模块共用一份，见 collectSources） */
    moments: HomeMoment[];
  } | null;
  moments: HomeMoment[];
  /** 首页相册模块的图池（关掉模块时是空数组，不打数据库） */
  albumImages: HomeAlbumImage[];
  /** 首页「相册卡片」模块的相册（整本卡的投影；关掉模块时是空数组） */
  albums: PublicAlbum[];
  siteStartedAt: string;
};

type NeededSources = {
  banner: boolean;
  recommend: boolean;
  recent: boolean;
  categories: boolean;
  tags: boolean;
  stats: boolean;
  listing: boolean;
  moments: boolean;
  albums: boolean;
  /** 「相册卡片」模块：要不要整本相册的卡（与上面的图池是两条取数，各查各的） */
  albumCards: boolean;
  recommendLimit: number;
  recentLimit: number;
  momentsLimit: number;
  albumLimit: number;
  /** 「相册卡片」模块最多摆几本 */
  albumCardLimit: number;
  /** 空数组 = 全部启用相册（与模块配置的语义一致） */
  albumSlugs: string[];
};

/**
 * 只按当前启用的模块/积木决定要查什么，避免关掉的模块还在打数据库。
 */
function collectSources(items: HomeLayoutItem[]): NeededSources {
  const needed: NeededSources = {
    banner: false,
    recommend: false,
    recent: false,
    categories: false,
    tags: false,
    stats: false,
    listing: false,
    moments: false,
    albums: false,
    albumCards: false,
    recommendLimit: 6,
    recentLimit: 5,
    momentsLimit: 8,
    albumLimit: 12,
    albumCardLimit: 4,
    albumSlugs: [],
  };

  for (const { module } of items) {
    switch (module.builtinKey) {
      case "banner":
        needed.banner = true;
        break;
      case "albums": {
        needed.albums = true;
        needed.albumLimit = Math.max(
          needed.albumLimit,
          normalizeAlbumLimit(module.config.limit),
        );
        // 多个相册模块共存时并集；只要有一个没填（= 全部），整体就是"全部"
        const slugs = module.config.albumSlugs ?? [];
        if (slugs.length === 0) {
          needed.albumSlugs = [];
        } else {
          needed.albumSlugs = [...new Set([...needed.albumSlugs, ...slugs])];
        }
        break;
      }
      case "album-cards": {
        needed.albumCards = true;
        needed.albumCardLimit = Math.max(
          needed.albumCardLimit,
          normalizeAlbumCardLimit(module.config.limit),
        );
        // 与滚动条那版共用同一份筛选语义：留空 = 全部启用相册，
        // 多个模块共存时取并集；只要有一个没填，整体就是"全部"
        const slugs = module.config.albumSlugs ?? [];
        if (slugs.length === 0) {
          needed.albumSlugs = [];
        } else {
          needed.albumSlugs = [...new Set([...needed.albumSlugs, ...slugs])];
        }
        break;
      }
      case "recommend":
        needed.recommend = true;
        needed.recommendLimit = Math.max(
          needed.recommendLimit,
          module.config.limit ?? 6,
        );
        break;
      case "moments":
        needed.moments = true;
        needed.momentsLimit = Math.max(
          needed.momentsLimit,
          module.config.limit ?? 8,
        );
        break;
      case "posts":
        needed.listing = true;
        if (module.config.showCategoryBar !== false) {
          needed.categories = true;
        }
        // 文章卡片里的穿插卡：瞬间与文章按时间混排，第 2 页往后要的是更早的瞬间，
        // 所以直接按首页瞬间池的上限取（12），由前端按本页时间窗筛，不按「最多几条」取。
        if ((module.config.momentLimit ?? 0) > 0) {
          needed.moments = true;
          needed.momentsLimit = Math.max(needed.momentsLimit, 12);
        }
        break;
      case "categories":
        needed.categories = true;
        break;
      case "tags":
        needed.tags = true;
        break;
      case "site":
        needed.stats = true;
        break;
      case "recent":
        needed.recent = true;
        needed.recentLimit = Math.max(needed.recentLimit, module.config.limit ?? 5);
        break;
      default:
        break;
    }

    for (const block of module.blocks) {
      switch (block.type) {
        case "postList":
        case "postGrid":
          if (block.source === "recommend") {
            needed.recommend = true;
            needed.recommendLimit = Math.max(needed.recommendLimit, block.limit ?? 6);
          } else {
            needed.recent = true;
            needed.recentLimit = Math.max(needed.recentLimit, block.limit ?? 5);
          }
          break;
        case "categories":
          needed.categories = true;
          break;
        case "tags":
          needed.tags = true;
          break;
        case "siteStats":
          needed.stats = true;
          break;
        case "recent":
          needed.recent = true;
          needed.recentLimit = Math.max(needed.recentLimit, block.limit ?? 5);
          break;
        default:
          break;
      }
    }
  }

  return needed;
}

export async function loadHomeData(
  items: HomeLayoutItem[],
  page: number,
): Promise<HomeData> {
  const needed = collectSources(items);

  const [
    settings,
    banner,
    recommend,
    recent,
    categories,
    tags,
    stats,
    listing,
    moments,
    albumImages,
    albums,
  ] = await Promise.all([
    getPublicSettings(),
    needed.banner ? resolveHomeBanner() : Promise.resolve(null),
    needed.recommend
      ? listRecommendPosts(needed.recommendLimit)
      : Promise.resolve([]),
    needed.recent ? listRecentPosts(needed.recentLimit) : Promise.resolve([]),
    needed.categories ? listCategories() : Promise.resolve([]),
    needed.tags ? listTags() : Promise.resolve([]),
    needed.stats ? getSidebarStats() : Promise.resolve(null),
    needed.listing ? listPublishedPosts({ page }) : Promise.resolve(null),
    needed.moments ? listHomeMoments(needed.momentsLimit) : Promise.resolve([]),
    needed.albums
      ? listHomeAlbumImages({
          albumSlugs: needed.albumSlugs,
          limit: needed.albumLimit,
        })
      : Promise.resolve([]),
    needed.albumCards
      ? listHomeAlbumCards({
          albumSlugs: needed.albumSlugs,
          limit: needed.albumCardLimit,
        })
      : Promise.resolve([]),
  ]);

  return {
    siteName: settings.siteName,
    announcement: settings.announcement,
    homeModuleOpacity: settings.homeModuleOpacity,
    homeBackdropOpacity: settings.homeBackdropOpacity,
    homeBadgeColor: settings.homeBadgeColor,
    homeBadgeOpacity: settings.homeBadgeOpacity,
    banner,
    recommend,
    recent,
    categories,
    tags,
    stats,
    listing: listing ? { ...listing, moments } : null,
    moments,
    albumImages,
    albums,
    siteStartedAt: settings.siteStartedAt,
  };
}
