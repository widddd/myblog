import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { PostList } from "@/components/home/PostCard";
import { Sidebar } from "@/components/layout/Sidebar";
import { SiteShell } from "@/components/layout/SiteShell";
import { getCategory, listPublishedPosts } from "@/lib/posts/query";
import { publicMetadata } from "@/lib/seo/site";
import { parsePage } from "@/lib/utils/page";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  return publicMetadata({
    title: category?.name ?? "分类",
    description: category ? `${category.name} 分类下的文章` : "分类",
    path: `/categories/${slug}`,
    index: Boolean(category),
  });
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const { page } = await searchParams;
  const category = await getCategory(slug);

  if (!category) {
    notFound();
  }

  const listing = await listPublishedPosts({
    page: parsePage(page),
    categorySlug: slug,
  });

  return (
    <SiteShell sidebar={<Sidebar />} title={category.name}>
      {listing.posts.length === 0 ? (
        <EmptyState title="这个分类还是空的" description="还没有已发布文章归入此分类。" />
      ) : (
        <PostList posts={listing.posts} />
      )}
      <Pagination
        basePath={`/categories/${slug}`}
        page={listing.page}
        pageSize={listing.pageSize}
        total={listing.total}
      />
    </SiteShell>
  );
}
