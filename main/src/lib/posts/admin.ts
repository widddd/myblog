import type { Prisma } from "@prisma/client";

import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { AdminHttpError } from "@/lib/admin/http";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils/slugify";
import type { AdminPostView } from "@/lib/posts/admin-types";
import { normalizePostContent } from "@/lib/posts/normalize-content";
import type { postPatchSchema, postWriteSchema } from "@/lib/validation/post";
import type { z } from "zod";

type PostWrite = z.infer<typeof postWriteSchema>;
type PostPatch = z.infer<typeof postPatchSchema>;

const adminPostInclude = {
  category: { select: { id: true, slug: true, name: true } },
  tags: { select: { tag: { select: { id: true, slug: true, name: true } } } },
} satisfies Prisma.PostInclude;

export type AdminPost = AdminPostView;

function toAdminPost(
  row: Prisma.PostGetPayload<{ include: typeof adminPostInclude }>,
) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    excerpt: row.excerpt,
    cover: row.cover,
    bannerStyle: row.bannerStyle,
    bannerColor: row.bannerColor,
    bannerColor2: row.bannerColor2,
    status: row.status,
    publishedAt: row.publishedAt,
    pinned: row.pinned,
    recommend: row.recommend,
    views: row.views,
    hasPassword: Boolean(row.passwordHash),
    category: row.category,
    tags: row.tags.map((item) => item.tag),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function resolveSlug(title: string, requested?: string | null) {
  const slug = (requested?.trim() ? requested.trim() : slugify(title)).toLowerCase();
  if (!slug) {
    throw new AdminHttpError("VALIDATION_ERROR", "无法生成 slug", 400);
  }
  return slug;
}

function parsePublishedAt(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AdminHttpError("VALIDATION_ERROR", "发布时间格式无效", 400);
  }
  return date;
}

function resolveSchedule(input: {
  status: string;
  publishedAt?: string | null;
}): { status: string; publishedAt: Date | null } {
  const publishedAt = parsePublishedAt(input.publishedAt);
  if (input.status === "published") {
    return { status: "published", publishedAt: publishedAt ?? new Date() };
  }
  if (input.status === "scheduled") {
    if (!publishedAt || publishedAt.getTime() <= Date.now()) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        "定时发布必须选择未来的发布时间",
        400,
      );
    }
    return { status: "scheduled", publishedAt };
  }
  return { status: "draft", publishedAt };
}

async function assertSlugAvailable(slug: string, excludeId?: number) {
  const existing = await prisma.post.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing && existing.id !== excludeId) {
    throw new AdminHttpError("SLUG_TAKEN", "slug 已被占用", 400);
  }
}

async function assertTaxonomy(categoryId?: number | null, tagIds?: number[]) {
  if (categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new AdminHttpError("NOT_FOUND", "分类不存在", 400);
    }
  }
  if (tagIds && tagIds.length > 0) {
    const count = await prisma.tag.count({ where: { id: { in: tagIds } } });
    if (count !== tagIds.length) {
      throw new AdminHttpError("NOT_FOUND", "部分标签不存在", 400);
    }
  }
}

export async function listAdminPosts(options: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
  const where: Prisma.PostWhereInput = {};
  if (options.status && options.status !== "all") {
    where.status = options.status;
  }
  if (options.q) {
    where.OR = [
      { title: { contains: options.q } },
      { slug: { contains: options.q } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      include: adminPostInclude,
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  return {
    data: rows.map(toAdminPost),
    total,
    page: options.page,
    pageSize: options.pageSize,
  };
}

export async function getAdminPost(id: number) {
  const row = await prisma.post.findUnique({
    where: { id },
    include: adminPostInclude,
  });
  if (!row) {
    throw new AdminHttpError("NOT_FOUND", "文章不存在", 404);
  }
  return toAdminPost(row);
}

export async function createAdminPost(input: PostWrite) {
  const slug = resolveSlug(input.title, input.slug);
  await assertSlugAvailable(slug);
  await assertTaxonomy(input.categoryId, input.tagIds);
  const schedule = resolveSchedule(input);
  const passwordHash = input.password
    ? await hashPassword(input.password)
    : null;

  const row = await prisma.post.create({
    data: {
      title: input.title,
      slug,
      content: normalizePostContent(input.content),
      excerpt: input.excerpt ?? null,
      cover: input.cover ?? null,
      bannerStyle: input.bannerStyle ?? "cover",
      bannerColor: input.bannerColor ?? null,
      bannerColor2: input.bannerColor2 ?? null,
      status: schedule.status,
      publishedAt: schedule.publishedAt,
      pinned: input.pinned ?? false,
      recommend: input.recommend ?? false,
      passwordHash,
      categoryId: input.categoryId ?? null,
      tags: input.tagIds
        ? { create: input.tagIds.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: adminPostInclude,
  });

  revalidatePublicContent(row.slug);
  return toAdminPost(row);
}

export async function updateAdminPost(id: number, input: PostPatch) {
  const current = await prisma.post.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, status: true, publishedAt: true },
  });
  if (!current) {
    throw new AdminHttpError("NOT_FOUND", "文章不存在", 404);
  }

  const title = input.title ?? current.title;
  const slug =
    input.slug !== undefined || input.title
      ? resolveSlug(title, input.slug === undefined ? current.slug : input.slug)
      : current.slug;
  await assertSlugAvailable(slug, id);
  await assertTaxonomy(input.categoryId, input.tagIds);

  const schedule =
    input.status || input.publishedAt !== undefined
      ? resolveSchedule({
          status: input.status ?? current.status,
          publishedAt:
            input.publishedAt !== undefined
              ? input.publishedAt
              : current.publishedAt?.toISOString() ?? null,
        })
      : null;

  const passwordHash =
    input.password === undefined
      ? undefined
      : input.password
        ? await hashPassword(input.password)
        : null;

  const row = await prisma.$transaction(async (tx) => {
    if (input.tagIds) {
      await tx.postTag.deleteMany({ where: { postId: id } });
    }
    return tx.post.update({
      where: { id },
      data: {
        title: input.title,
        slug,
        content:
          input.content === undefined
            ? undefined
            : normalizePostContent(input.content),
        excerpt: input.excerpt,
        cover: input.cover,
        bannerStyle: input.bannerStyle,
        bannerColor: input.bannerColor,
        bannerColor2: input.bannerColor2,
        status: schedule?.status,
        publishedAt: schedule?.publishedAt,
        pinned: input.pinned,
        recommend: input.recommend,
        passwordHash,
        categoryId: input.categoryId,
        tags: input.tagIds
          ? { create: input.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: adminPostInclude,
    });
  });

  revalidatePublicContent(current.slug);
  if (row.slug !== current.slug) {
    revalidatePublicContent(row.slug);
  }
  return toAdminPost(row);
}

export async function deleteAdminPost(id: number) {
  const current = await prisma.post.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });
  if (!current) {
    throw new AdminHttpError("NOT_FOUND", "文章不存在", 404);
  }

  await prisma.$transaction([
    prisma.comment.deleteMany({
      where: { targetType: "post", targetId: id },
    }),
    prisma.post.delete({ where: { id } }),
  ]);
  revalidatePublicContent(current.slug);
}
