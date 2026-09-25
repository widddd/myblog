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

/**
 * 笔名清单：像分类/标签一样可以加多个，写文章时下拉快捷选。
 *
 * 只存名字（作者没有独立页面，不需要 slug），也不 revalidate 公开内容 ——
 * 新建笔名本身不改变任何前台输出，文章署名变化由文章写入路径负责刷新。
 */
export async function listPenNames() {
  return prisma.penName.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function createPenName(name: string) {
  try {
    return await prisma.penName.create({
      data: { name },
      select: { id: true, name: true },
    });
  } catch {
    throw new AdminHttpError("CONFLICT", "这个笔名已经有了", 400);
  }
}
