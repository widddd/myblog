import { resolveHomeBanner, type HomeBanner } from "@/lib/banner/resolve";
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
  } | null;
  moments: HomeMoment[];
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
  recommendLimit: number;
  recentLimit: number;
  momentsLimit: number;
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
    recommendLimit: 6,
    recentLimit: 5,
    momentsLimit: 8,
  };

  for (const { module } of items) {
    switch (module.builtinKey) {
      case "banner":
        needed.banner = true;
        break;
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

  const [settings, banner, recommend, recent, categories, tags, stats, listing, moments] =
    await Promise.all([
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
    ]);

  return {
    siteName: settings.siteName,
    announcement: settings.announcement,
    homeModuleOpacity: settings.homeModuleOpacity,
    homeBackdropOpacity: settings.homeBackdropOpacity,
    banner,
    recommend,
    recent,
    categories,
    tags,
    stats,
    listing,
    moments,
    siteStartedAt: settings.siteStartedAt,
  };
}
