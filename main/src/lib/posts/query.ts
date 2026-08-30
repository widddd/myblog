import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";

import type { PostCardModel, PostDetailModel, TaxonomyItem } from "./types";

const cardMetaSelect = {
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
    slug: row.slug,
    title: row.title,
    excerpt: locked ? null : (excerpts.get(row.slug) ?? null),
    cover: row.cover,
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
}

export async function listRecommendPosts(limit = 6): Promise<PostCardModel[]> {
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
}

export async function listRecentPosts(limit = 5): Promise<PostCardModel[]> {
  const rows = await prisma.post.findMany({
    where: publishedWhere(),
    select: cardMetaSelect,
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  return toCards(rows);
}

export async function getPublishedPostMeta(
  slug: string,
): Promise<PostDetailModel | null> {
  const row = await prisma.post.findFirst({
    where: { slug, ...publishedWhere() },
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
}

export async function getPublishedPostContent(
  slug: string,
  unlocked: boolean,
): Promise<{ content: string; excerpt: string | null } | null> {
  return prisma.post.findFirst({
    where: {
      slug,
      ...publishedWhere(),
      ...(unlocked ? {} : { passwordHash: null }),
    },
    select: {
      content: true,
      excerpt: true,
    },
  });
}

export async function listArchivePosts(): Promise<PostCardModel[]> {
  const rows = await prisma.post.findMany({
    where: publishedWhere(),
    select: cardMetaSelect,
    orderBy: { publishedAt: "desc" },
  });
  return toCards(rows);
}

export async function getCategory(slug: string) {
  return prisma.category.findUnique({
    where: { slug },
    select: { slug: true, name: true },
  });
}

export async function getTag(slug: string) {
  return prisma.tag.findUnique({
    where: { slug },
    select: { slug: true, name: true },
  });
}

export async function listCategories(): Promise<TaxonomyItem[]> {
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
}

export async function listTags(): Promise<TaxonomyItem[]> {
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
}

export async function getSidebarStats() {
  const [postCount, categoryCount, tagCount] = await Promise.all([
    prisma.post.count({ where: publishedWhere() }),
    prisma.category.count(),
    prisma.tag.count(),
  ]);

  return { postCount, categoryCount, tagCount };
}
