/**
 * 「有什么新内容」的纯逻辑（App 通知的判据，见 docs/android/push-plan.md）。
 *
 * 这里**不含 prisma / next**：行 → 载荷的映射、游标解析、指纹与标题派生都是纯函数，
 * 单测直接喂合成行。真正取数在 `lib/feed/query.ts`。
 *
 * 为什么不用 RSS 当 App 的通知源：
 *  1. 现在的 RSS **只有文章**（`/rss.xml` 取 `listArchivePosts()`），瞬间根本不在里面；
 *  2. RSS 面向阅读器轮询（分钟级 + 中间缓存），拿它当通知源会把「延迟」变成产物特性；
 *  3. 通知要的是**增量**（"给我 since 之后的新东西"），RSS 每次都是一份完整列表，
 *     客户端还得自己比对 guid，白费流量。
 * 所以给 App 的是一条薄接口（`GET /api/feed/updates?since=…`），RSS 的地位不变。
 */

/** 一次最多返回多少条（App 只用来弹通知，不需要翻页）。 */
export const FEED_LIMIT_MAX = 50;

/**
 * 瞬间正文在通知里最多显示多少字（通知本身也只显示一两行）。
 * 超长截断加省略号，**不保留换行**——通知栏里换行会被压成空格，留着反而难看。
 */
export const MOMENT_NOTIFY_CHARS = 60;

/**
 * 解析 `?since=` 游标。
 *
 * 收口成三种结果，别让每个调用方各写一遍：
 *  - 合法时间戳 → `{ mode: "since", value }`
 *  - 缺省/空串 → `{ mode: "latest" }`（只取最新几条，用于 App 首次建立基线）
 *  - 解析不出来 → `{ mode: "invalid" }`（由路由回 400，别静默当成 latest 或以前）
 *
 * 只接受带时区的 ISO 8601（`Date.parse` 也认 `2026-10-05` 这种"日期当 UTC 午夜"，
 * 但那只会在客户端时区上错位一天，所以显式要求 `T`）。
 */
export type FeedCursor =
  | { mode: "since"; value: Date }
  | { mode: "latest" }
  | { mode: "invalid" };

export function parseFeedCursor(raw: string | null | undefined): FeedCursor {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return { mode: "latest" };
  }
  const text = raw.trim();
  // `Date.parse("2026-10-05")` 是合法的（按 UTC 午夜），但客户端算出来的永远是本地时间，
  // 这种少一段的字符串基本是手写错误 → 直接判非法，避免"每次都少推一天"的静默错误。
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return { mode: "invalid" };
  }
  const value = new Date(text);
  if (Number.isNaN(value.getTime())) {
    return { mode: "invalid" };
  }
  return { mode: "since", value };
}

/** 一行瞬间的最小形状（prisma 侧 select 出来的字段）。 */
export type MomentFeedRow = {
  id: number;
  content: string;
  createdAt: Date;
  /**
   * 2026-10 起瞬间可以只发媒体不发文字，通知文案要能说出「分享了一张图片 / 一个视频」。
   * Prisma 里是 JSON 字符串，这里收 `unknown`、由 `momentImageKinds()` 归一（旧调用点不传也不会炸）。
   */
  images?: unknown;
};

/**
 * 瞬间 `images` 字段 → 通知文案需要的极简形状（只留 kind）。
 *
 * 通知不需要 URL / 宽高，更不该在这里解析媒体地址；库里存的是 JSON 字符串，
 * 坏值一律当空数组（通知文案退化成「（无文字）」，绝不因为一段脏 JSON 让整条推送失败）。
 */
export function momentImageKinds(
  raw: unknown,
): Array<{ kind?: "image" | "video" | "audio" }> {
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      const kind = item && typeof item === "object" ? (item as { kind?: unknown }).kind : undefined;
      if (kind === "video") {
        return { kind: "video" as const };
      }
      // 语音与图片都要能和旧的"缺 kind = 图片"区分开（否则通知里会把语音说成图片）
      return kind === "audio" ? { kind: "audio" as const } : { kind: "image" as const };
    });
  }
  if (typeof raw !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return momentImageKinds(parsed);
  } catch {
    return [];
  }
}

/** 一篇文章的最小形状。 */
export type PostFeedRow = {
  publicId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
  createdAt: Date;
};

export type FeedMomentItem = {
  id: number;
  /** 列表页高亮用的锚点（与 `MomentHighlight` 同一口径 `/moments#moment-{id}`） */
  href: string;
  text: string;
  createdAt: string;
};

export type FeedPostItem = {
  href: string;
  title: string;
  excerpt: string | null;
  /** 排序与展示都按它（可能为空 = 排期表里还没落时间，取 createdAt 兜底） */
  publishedAt: string;
  createdAt: string;
};

/** 通知指纹：同一篇内容改标题/改正文不该再推一次，所以指纹里**不含正文**。 */
export function momentFingerprint(id: number): string {
  return `moment:${id}`;
}

export function postFingerprint(publicId: string): string {
  return `post:${publicId}`;
}

/** 一瞬间在通知里显示的那行字：压掉空白、超长截断；只发媒体不发文字时给一句人话。 */
export function momentNotifyText(
  content: string,
  images?: Array<{ kind?: "image" | "video" | "audio" }>,
): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (!flat) {
    // 空文案不能往通知栏里塞一行空白（瞬间从 2026-10 起允许只发媒体，见 docs/moment-video-spec.md）
    if (!images || images.length === 0) {
      return "（无文字）";
    }
    // 语音优先说语音：一条瞬间里同时有图和语音时，「说了句话」比「发了张图」更贴近内容
    if (images.some((image) => image.kind === "audio")) {
      return "发了一段语音";
    }
    return images.some((image) => image.kind === "video")
      ? "分享了一个视频"
      : "分享了一张图片";
  }
  if (flat.length <= MOMENT_NOTIFY_CHARS) {
    return flat;
  }
  return `${flat.slice(0, MOMENT_NOTIFY_CHARS)}…`;
}

/** 文章通知的正文：优先摘要，没有就用标题（不为通知去解析正文，那是另一条链路的事）。 */
export function postNotifyText(row: Pick<PostFeedRow, "title" | "excerpt">): string {
  const excerpt = row.excerpt?.replace(/\s+/g, " ").trim();
  return excerpt ? excerpt : row.title;
}

/** 把文章行收成接口载荷。`href` 走统一的 `postHref` 口径（由调用方传入，避免这里 import 依赖）。 */
export function toFeedPostItem(row: PostFeedRow, href: string): FeedPostItem {
  const published = row.publishedAt ?? row.createdAt;
  return {
    href,
    title: row.title,
    excerpt: row.excerpt,
    publishedAt: published.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** 把瞬间行收成接口载荷。 */
export function toFeedMomentItem(row: MomentFeedRow): FeedMomentItem {
  return {
    id: row.id,
    href: `/moments#moment-${row.id}`,
    text: momentNotifyText(row.content, momentImageKinds(row.images)),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * 取数上限：请求条数收进 `1..FEED_LIMIT_MAX`，非法值用默认。
 * 与 `lib/upload/limits.ts` 里那几个 resolve 函数同一风格——**别在路由里另写一遍 clamp**。
 */
export function resolveFeedLimit(raw: string | null | undefined, fallback = 20): number {
  // 空串要当"没给"处理：`Number("")` 是 0（会被夹成 1），而调用方传空串的本意是"用默认值"
  const text = raw?.trim() ?? "";
  const value = text === "" ? Number.NaN : Number(text);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(FEED_LIMIT_MAX, Math.max(1, Math.round(value)));
}
