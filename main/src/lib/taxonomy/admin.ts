import { AdminHttpError } from "@/lib/admin/http";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils/slugify";

function resolveTaxonomySlug(name: string, requested?: string | null) {
  const slug = (requested?.trim() ? requested.trim() : slugify(name)).toLowerCase();
  if (!slug) {
    throw new AdminHttpError("VALIDATION_ERROR", "无法生成 slug", 400);
  }
  return slug;
}

export async function listCategories() {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { posts: true } } },
  });
}

export async function listTags() {
  return prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { posts: true } } },
  });
}

export async function createCategory(name: string, requestedSlug?: string | null) {
  const slug = resolveTaxonomySlug(name, requestedSlug);
  try {
    const created = await prisma.category.create({ data: { name, slug } });
    revalidatePublicContent();
    return created;
  } catch {
    throw new AdminHttpError("SLUG_TAKEN", "分类 slug 已被占用", 400);
  }
}

export async function createTag(name: string, requestedSlug?: string | null) {
  const slug = resolveTaxonomySlug(name, requestedSlug);
  try {
    const created = await prisma.tag.create({ data: { name, slug } });
    revalidatePublicContent();
    return created;
  } catch {
    throw new AdminHttpError("SLUG_TAKEN", "标签 slug 已被占用", 400);
  }
}
