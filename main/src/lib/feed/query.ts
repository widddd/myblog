import { cachedPublic, PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import { prisma } from "@/lib/db";
import type { FeedMomentItem, FeedPostItem } from "@/lib/feed/updates";
import { toFeedMomentItem, toFeedPostItem } from "@/lib/feed/updates";
import { loadMomentVisibilityContext } from "@/lib/moments/visibility-groups";
import { buildMomentVisibilityFilter } from "@/lib/moments/visibility";
import { postHref } from "@/lib/posts/path";
import { publishedWhere } from "@/lib/posts/query";
import { loadCosSettings } from "@/lib/storage";

/**
 * 「新增内容」取数（App 通知的兜底源，见 docs/android/push-plan.md）。
 *
 * 两处刻意的选择：
 *  1. **只算真正新增的行**（`createdAt > since`），不看 `updatedAt` —— `@updatedAt` 会被
 *     浏览量自增、定时发布、publicId 回填刷成"现在"（P-087），拿它当通知判据会把
 *     「有人看了一眼你的文章」变成一条推送。
 *  2. **不解析瞬间图片**：通知只显示一行字，解析图片要走 COS 判定与缩略图生成
 *     （`listHomeMoments` 那条重链路），在轮询接口里是不必要的成本。
 *
 * 时间比较用 `createdAt` 而不是 `publishedAt`：定时发布（scheduled → published）时
 * `publishedAt` 可能是过去的时间，用它会漏推。
 */

export type FeedWindow = {
  /** 客户端游标；`null` = 首次调用，只回最新一批用于建立基线 */
  since: Date | null;
  limit: number;
};

export type FeedPayload = {
  /** 服务端"现在"：客户端拿它当下一轮的游标，避免依赖手机自己的时钟 */
  serverTime: string;
  nextCursor: string;
  posts: FeedPostItem[];
  moments: FeedMomentItem[];
};

/** 缓存窗口的粗细：把 `since` 对齐到 15 秒，让轮询期间同一窗口命中同一份结果。 */
export const FEED_BUCKET_MS = 15_000;

/** 把游标对齐到桶（向下取整）；`null` 保持 null（走"最新一批"分支）。 */
export function bucketFeedCursor(since: Date | null): Date | null {
  if (!since) {
    return null;
  }
  return new Date(Math.floor(since.getTime() / FEED_BUCKET_MS) * FEED_BUCKET_MS);
}

/**
 * 公开侧新增内容（未登录视角）。
 *
 * `cachedPublic` + 桶化游标：轮询是又短又频的请求，不缓存的话每次都要打三张表；
 * 缓存键带上桶化后的游标，所以"同一窗口内的多次轮询"共用一份结果，而游标一变就重新取数。
 * 缓存标签与 RSS 同源（`seo` / `posts`），发文章时已有的 revalidate 顺手就把这里刷了。
 */
export async function loadFeedWindow(window: FeedWindow): Promise<FeedPayload> {
  const bucket = bucketFeedCursor(window.since);
  const key = [
    "feed-updates",
    bucket ? String(bucket.getTime()) : "latest",
    String(window.limit),
  ];

  return cachedPublic(key, [PUBLIC_CACHE_TAGS.seo, PUBLIC_CACHE_TAGS.posts], () =>
    queryFeedWindow(window),
  );
}

async function queryFeedWindow(window: FeedWindow): Promise<FeedPayload> {
  await loadCosSettings();

  const { globalDays, groups } = await loadMomentVisibilityContext();
  const visibility = buildMomentVisibilityFilter({ globalDays, groups });

  const postWhere = {
    ...publishedWhere(),
    ...(window.since ? { createdAt: { gt: window.since } } : {}),
  };
  const momentWhere = {
    ...(visibility ?? {}),
    ...(window.since ? { createdAt: { gt: window.since } } : {}),
  };

  const [postRows, momentRows] = await Promise.all([
    prisma.post.findMany({
      where: postWhere,
      orderBy: { createdAt: "desc" },
      take: window.limit,
      select: {
        publicId: true,
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        createdAt: true,
      },
    }),
    prisma.moment.findMany({
      where: momentWhere,
      orderBy: { createdAt: "desc" },
      take: window.limit,
      // images 是 JSON 字符串：只为「只发媒体不发文字」的瞬间通知文案服务（见 lib/feed/updates.ts）
      select: { id: true, content: true, images: true, createdAt: true },
    }),
  ]);

  const serverTime = new Date();
  return {
    serverTime: serverTime.toISOString(),
    // 下一轮游标取「服务端现在」而不是最后一条的时间：否则并发写入的间隙会漏推
    nextCursor: serverTime.toISOString(),
    posts: postRows.map((row) => toFeedPostItem(row, postHref(row))),
    moments: momentRows.map(toFeedMomentItem),
  };
}

/** 管理员视角（App 已登录后台）：带上未发布与密码文，按 `createdAt` 走同一条窗口逻辑。 */
export async function loadAdminFeedWindow(window: FeedWindow): Promise<FeedPayload> {
  const [postRows, momentRows] = await Promise.all([
    prisma.post.findMany({
      where: window.since ? { createdAt: { gt: window.since } } : {},
      orderBy: { createdAt: "desc" },
      take: window.limit,
      select: {
        publicId: true,
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        createdAt: true,
      },
    }),
    prisma.moment.findMany({
      where: window.since ? { createdAt: { gt: window.since } } : {},
      orderBy: { createdAt: "desc" },
      take: window.limit,
      select: { id: true, content: true, images: true, createdAt: true },
    }),
  ]);

  const serverTime = new Date();
  return {
    serverTime: serverTime.toISOString(),
    nextCursor: serverTime.toISOString(),
    posts: postRows.map((row) => toFeedPostItem(row, postHref(row))),
    moments: momentRows.map(toFeedMomentItem),
  };
}
