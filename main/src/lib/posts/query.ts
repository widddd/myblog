import type { Prisma } from "@prisma/client";

import { cachedPublic, PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import { prisma } from "@/lib/db";
import { resolvePublicImageUrl } from "@/lib/moments/media";
import { getSetting } from "@/lib/settings";

import { isPublicId, postHref } from "./path";
import type { PostCardModel, PostDetailModel, TaxonomyItem } from "./types";

const cardMetaSelect = {
  publicId: true,
  slug: true,
  title: true,
  cover: true,
  bannerStyle: true,
  bannerColor: true,
  bannerColor2: true,
  passwordHash: true,
  pinned: true,
  recommend: true,
  views: true,
  publishedAt: true,
  category: { select: { slug: true, name: true } },
  tags: { select: { tag: { select: { slug: true, name: true } } } },
} satisfies Prisma.PostSelect;

type CardMetaRow = Prisma.PostGetPayload<{ select: typeof cardMetaSelect }>;

/** 前台可见文章：已发布且到达发布时间。scheduler 挂掉时仍靠这条过滤。 */
export function publishedWhere(now = new Date()): Prisma.PostWhereInput {
  return {
    status: "published",
    publishedAt: { lte: now },
  };
}

function toCard(
  row: CardMetaRow,
  excerpts: ReadonlyMap<string, string | null>,
): PostCardModel {
  const locked = Boolean(row.passwordHash);
  return {
    publicId: row.publicId,
    slug: row.slug,
    title: row.title,
    excerpt: locked ? null : (excerpts.get(row.slug) ?? null),
    cover: resolvePublicImageUrl(row.cover) ?? row.cover,
    bannerStyle: row.bannerStyle,
    bannerColor: row.bannerColor,
    bannerColor2: row.bannerColor2,
    locked,
    pinned: row.pinned,
    recommend: row.recommend,
    views: row.views,
    publishedAt: row.publishedAt,
    category: row.category,
    tags: row.tags.map((item) => item.tag),
  };
}

async function toCards(rows: CardMetaRow[]): Promise<PostCardModel[]> {
  const publicSlugs = rows
    .filter((row) => !row.passwordHash)
    .map((row) => row.slug);
  const excerptRows =
    publicSlugs.length === 0
      ? []
      : await prisma.post.findMany({
          where: {
            slug: { in: publicSlugs },
            passwordHash: null,
            ...publishedWhere(),
          },
          select: { slug: true, excerpt: true },
        });
  const excerpts = new Map(
    excerptRows.map((row) => [row.slug, row.excerpt] as const),
  );
  return rows.map((row) => toCard(row, excerpts));
}

async function pageSize(): Promise<number> {
  const size = await getSetting<number>("pageSize");
  return size && size > 0 ? size : 10;
}

export async function listPublishedPosts(options: {
  page?: number;
  categorySlug?: string;
  tagSlug?: string;
} = {}): Promise<{ posts: PostCardModel[]; total: number; page: number; pageSize: number }> {
  const currentPage = Math.max(1, options.page ?? 1);
  return cachedPublic(
    [
      "listPublishedPosts",
      String(currentPage),
      options.categorySlug ?? "",
      options.tagSlug ?? "",
    ],
    [PUBLIC_CACHE_TAGS.posts],
    async () => {
      const size = await pageSize();
      const where: Prisma.PostWhereInput = {
        AND: [
          publishedWhere(),
          options.categorySlug ? { category: { slug: options.categorySlug } } : {},
          options.tagSlug ? { tags: { some: { tag: { slug: options.tagSlug } } } } : {},
        ],
      };

      const [total, rows] = await Promise.all([
        prisma.post.count({ where }),
        prisma.post.findMany({
          where,
          select: cardMetaSelect,
          orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
          skip: (currentPage - 1) * size,
          take: size,
        }),
      ]);

      return {
        posts: await toCards(rows),
        total,
        page: currentPage,
        pageSize: size,
      };
    },
  );
}

export async function listRecommendPosts(limit = 6): Promise<PostCardModel[]> {
  return cachedPublic(
    ["listRecommendPosts", String(limit)],
    [PUBLIC_CACHE_TAGS.posts],
    async () => {
      const featured = await prisma.post.findMany({
        where: { ...publishedWhere(), recommend: true },
        select: cardMetaSelect,
        orderBy: [{ publishedAt: "desc" }],
        take: limit,
      });
      if (featured.length > 0) {
        return toCards(featured);
      }

      const rows = await prisma.post.findMany({
        where: publishedWhere(),
        select: cardMetaSelect,
        orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
        take: limit,
      });
      return toCards(rows);
    },
  );
}

export async function listRecentPosts(limit = 5): Promise<PostCardModel[]> {
  return cachedPublic(
    ["listRecentPosts", String(limit)],
    [PUBLIC_CACHE_TAGS.posts],
    async () => {
      const rows = await prisma.post.findMany({
        where: publishedWhere(),
        select: cardMetaSelect,
        orderBy: { publishedAt: "desc" },
        take: limit,
      });
      return toCards(rows);
    },
  );
}

async function publishedCardBy(
  where: Prisma.PostWhereInput,
  cacheKey: string,
): Promise<PostDetailModel | null> {
  return cachedPublic(
    ["getPublishedPostMeta", cacheKey],
    [PUBLIC_CACHE_TAGS.posts],
    async () => {
      const row = await prisma.post.findFirst({
        where: { ...where, ...publishedWhere() },
        select: { id: true, ...cardMetaSelect },
      });

      if (!row) {
        return null;
      }

      const [post] = await toCards([row]);
      return {
        ...post,
        id: row.id,
        wordCount: 0,
      };
    },
  );
}

export async function getPublishedPostMeta(
  slug: string,
): Promise<PostDetailModel | null> {
  return publishedCardBy({ slug }, `slug:${slug}`);
}

export async function getPublishedPostMetaByPublicId(
  publicId: string,
): Promise<PostDetailModel | null> {
  return publishedCardBy({ publicId }, `publicId:${publicId}`);
}

export async function getPublishedPostContent(
  slug: string,
  unlocked: boolean,
): Promise<{ content: string; excerpt: string | null } | null> {
  return getPublishedPostContentBy({ slug }, unlocked);
}

export async function getPublishedPostContentByPublicId(
  publicId: string,
  unlocked: boolean,
): Promise<{ content: string; excerpt: string | null } | null> {
  return getPublishedPostContentBy({ publicId }, unlocked);
}

async function getPublishedPostContentBy(
  where: Prisma.PostWhereInput,
  unlocked: boolean,
): Promise<{ content: string; excerpt: string | null } | null> {
  return prisma.post.findFirst({
    where: {
      ...where,
      ...publishedWhere(),
      ...(unlocked ? {} : { passwordHash: null }),
    },
    select: {
      content: true,
      excerpt: true,
    },
  });
}

export async function resolveLegacyPostHref(
  key: string,
): Promise<string | null> {
  if (isPublicId(key)) {
    const byId = await prisma.post.findFirst({
      where: { publicId: key, ...publishedWhere() },
      select: { publicId: true, slug: true },
    });
    if (byId) {
      return postHref(byId);
    }
  }
  const bySlug = await prisma.post.findFirst({
    where: { slug: key, ...publishedWhere() },
    select: { publicId: true, slug: true },
  });
  return bySlug ? postHref(bySlug) : null;
}

export async function findPublishedPostByRef(ref: string) {
  if (isPublicId(ref)) {
    const byId = await prisma.post.findFirst({
      where: { publicId: ref, ...publishedWhere() },
      select: {
        id: true,
        publicId: true,
        slug: true,
        passwordHash: true,
        views: true,
      },
    });
    if (byId) {
      return byId;
    }
  }
  return prisma.post.findFirst({
    where: { slug: ref, ...publishedWhere() },
    select: {
      id: true,
      publicId: true,
      slug: true,
      passwordHash: true,
      views: true,
    },
  });
}

export async function listArchivePosts(): Promise<PostCardModel[]> {
  return cachedPublic(["listArchivePosts"], [PUBLIC_CACHE_TAGS.posts], async () => {
    const rows = await prisma.post.findMany({
      where: publishedWhere(),
      select: cardMetaSelect,
      orderBy: { publishedAt: "desc" },
    });
    return toCards(rows);
  });
}

export async function getCategory(slug: string) {
  return cachedPublic(
    ["getCategory", slug],
    [PUBLIC_CACHE_TAGS.taxonomies],
    () =>
      prisma.category.findUnique({
        where: { slug },
        select: { slug: true, name: true },
      }),
  );
}

export async function getTag(slug: string) {
  return cachedPublic(
    ["getTag", slug],
    [PUBLIC_CACHE_TAGS.taxonomies],
    () =>
      prisma.tag.findUnique({
        where: { slug },
        select: { slug: true, name: true },
      }),
  );
}

export async function listCategories(): Promise<TaxonomyItem[]> {
  return cachedPublic(
    ["listCategories"],
    [PUBLIC_CACHE_TAGS.taxonomies],
    async () => {
      const rows = await prisma.category.findMany({
        select: {
          slug: true,
          name: true,
          posts: { where: publishedWhere(), select: { id: true } },
        },
        orderBy: { name: "asc" },
      });

      return rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        count: row.posts.length,
      }));
    },
  );
}

export async function listTags(): Promise<TaxonomyItem[]> {
  return cachedPublic(["listTags"], [PUBLIC_CACHE_TAGS.taxonomies], async () => {
    const rows = await prisma.tag.findMany({
      select: {
        slug: true,
        name: true,
        posts: { where: { post: publishedWhere() }, select: { postId: true } },
      },
      orderBy: { name: "asc" },
    });

    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      count: row.posts.length,
    }));
  });
}

export async function getSidebarStats() {
  return cachedPublic(
    ["getSidebarStats"],
    [PUBLIC_CACHE_TAGS.posts, PUBLIC_CACHE_TAGS.taxonomies],
    async () => {
      const [postCount, categoryCount, tagCount] = await Promise.all([
        prisma.post.count({ where: publishedWhere() }),
        prisma.category.count(),
        prisma.tag.count(),
      ]);

      return { postCount, categoryCount, tagCount };
    },
  );
}
