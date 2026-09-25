import type { Prisma } from "@prisma/client";

import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { AdminHttpError } from "@/lib/admin/http";
import { readDefaultPenName } from "@/lib/auth/account";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils/slugify";
import type { AdminPostView } from "@/lib/posts/admin-types";
import { normalizeAuthorName } from "@/lib/posts/author";
import { normalizePostContent } from "@/lib/posts/normalize-content";
import { ARTICLE_SEGMENT } from "@/lib/posts/path";
import { allocatePublicId } from "@/lib/posts/public-id";
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
    publicId: row.publicId,
    slug: row.slug,
    title: row.title,
    authorName: row.authorName,
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
    revisedAt: row.revisedAt,
    showRevisedAt: row.showRevisedAt,
  };
}

/** 标签集合比对：顺序无所谓，只比成员是否一致 */
function sameIds(next: number[], current: number[]): boolean {
  if (next.length !== current.length) {
    return false;
  }
  const set = new Set(next);
  return current.every((id) => set.has(id));
}

function resolveSlug(title: string, requested?: string | null) {
  const slug = (requested?.trim() ? requested.trim() : slugify(title)).toLowerCase();
  return slug || ARTICLE_SEGMENT;
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
      { publicId: { contains: options.q } },
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
  // 作者默认取管理员账号上的笔名（编辑器也会预填，这里是服务端兜底）
  const authorName =
    normalizeAuthorName(input.authorName) ??
    normalizeAuthorName(await readDefaultPenName());

  const row = await prisma.post.create({
    data: {
      title: input.title,
      authorName,
      publicId: await allocatePublicId(),
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
      showRevisedAt: input.showRevisedAt ?? true,
      passwordHash,
      categoryId: input.categoryId ?? null,
      tags: input.tagIds
        ? { create: input.tagIds.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: adminPostInclude,
  });

  revalidatePublicContent({ slug: row.slug, publicId: row.publicId });
  return toAdminPost(row);
}

export async function updateAdminPost(id: number, input: PostPatch) {
  const current = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      publicId: true,
      slug: true,
      title: true,
      status: true,
      publishedAt: true,
      authorName: true,
      content: true,
      excerpt: true,
      cover: true,
      bannerStyle: true,
      bannerColor: true,
      bannerColor2: true,
      passwordHash: true,
      categoryId: true,
      tags: { select: { tagId: true } },
    },
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

  const nextContent =
    input.content === undefined ? undefined : normalizePostContent(input.content);
  const nextPasswordHash =
    passwordHash === undefined ? current.passwordHash : passwordHash;
  const nextCategoryId =
    input.categoryId === undefined ? current.categoryId : (input.categoryId ?? null);
  const nextAuthorName =
    input.authorName === undefined
      ? current.authorName
      : normalizeAuthorName(input.authorName);

  // 只比「读者能看到的内容」：状态、发布时间、浏览量、更新时间的被动刷新都不算一次修改。
  const contentChanged =
    (nextContent !== undefined && nextContent !== current.content) ||
    (input.title !== undefined && input.title !== current.title) ||
    slug !== current.slug ||
    (input.authorName !== undefined && nextAuthorName !== current.authorName) ||
    (input.excerpt !== undefined && (input.excerpt ?? null) !== current.excerpt) ||
    (input.cover !== undefined && (input.cover ?? null) !== current.cover) ||
    (input.bannerStyle !== undefined && input.bannerStyle !== current.bannerStyle) ||
    (input.bannerColor !== undefined &&
      (input.bannerColor ?? null) !== current.bannerColor) ||
    (input.bannerColor2 !== undefined &&
      (input.bannerColor2 ?? null) !== current.bannerColor2) ||
    nextPasswordHash !== current.passwordHash ||
    nextCategoryId !== current.categoryId ||
    (input.tagIds !== undefined &&
      !sameIds(input.tagIds, current.tags.map((item) => item.tagId)));

  const nextStatus = schedule?.status ?? current.status;
  // 只有「已经发布 + 改完还是发布 + 内容真的变了」才记一次修订；
  // 发布前反复编辑、定时转发布都不算（那些情况 revisedAt 会早于 publishedAt，前台自然不显示）。
  const revisedAt =
    current.status === "published" && nextStatus === "published" && contentChanged
      ? new Date()
      : undefined;

  const row = await prisma.$transaction(async (tx) => {
    if (input.tagIds) {
      await tx.postTag.deleteMany({ where: { postId: id } });
    }
    return tx.post.update({
      where: { id },
      data: {
        title: input.title,
        slug,
        authorName: input.authorName === undefined ? undefined : nextAuthorName,
        content: nextContent,
        excerpt: input.excerpt,
        cover: input.cover,
        bannerStyle: input.bannerStyle,
        bannerColor: input.bannerColor,
        bannerColor2: input.bannerColor2,
        status: schedule?.status,
        publishedAt: schedule?.publishedAt,
        pinned: input.pinned,
        recommend: input.recommend,
        showRevisedAt: input.showRevisedAt,
        revisedAt,
        passwordHash,
        categoryId: input.categoryId,
        tags: input.tagIds
          ? { create: input.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: adminPostInclude,
    });
  });

  revalidatePublicContent({ slug: current.slug, publicId: current.publicId });
  if (row.slug !== current.slug) {
    revalidatePublicContent({ slug: row.slug, publicId: row.publicId });
  }
  return toAdminPost(row);
}

export async function deleteAdminPost(id: number) {
  const current = await prisma.post.findUnique({
    where: { id },
    select: { id: true, slug: true, publicId: true },
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
  revalidatePublicContent({ slug: current.slug, publicId: current.publicId });
}
