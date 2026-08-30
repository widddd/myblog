import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { PostList } from "@/components/home/PostCard";
import { Sidebar } from "@/components/layout/Sidebar";
import { SiteShell } from "@/components/layout/SiteShell";
import { getTag, listPublishedPosts } from "@/lib/posts/query";
import { parsePage } from "@/lib/utils/page";

type TagPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tag = await getTag(slug);
  return { title: tag ? `#${tag.name}` : "标签" };
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params;
  const { page } = await searchParams;
  const tag = await getTag(slug);

  if (!tag) {
    notFound();
  }

  const listing = await listPublishedPosts({
    page: parsePage(page),
    tagSlug: slug,
  });

  return (
    <SiteShell sidebar={<Sidebar />} title={`#${tag.name}`}>
      {listing.posts.length === 0 ? (
        <EmptyState title="这个标签还是空的" description="还没有已发布文章使用此标签。" />
      ) : (
        <PostList posts={listing.posts} />
      )}
      <Pagination
        basePath={`/tags/${slug}`}
        page={listing.page}
        pageSize={listing.pageSize}
        total={listing.total}
      />
    </SiteShell>
  );
}
