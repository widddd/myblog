import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { PostList } from "@/components/home/PostCard";
import { Sidebar } from "@/components/layout/Sidebar";
import { SiteShell } from "@/components/layout/SiteShell";
import { listPublishedPosts } from "@/lib/posts/query";
import { publicMetadata } from "@/lib/seo/site";
import { parsePage } from "@/lib/utils/page";

export function generateMetadata(): Promise<Metadata> {
  return publicMetadata({
    title: "文章",
    description: "全部已发布文章。",
    path: "/posts",
  });
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const listing = await listPublishedPosts({ page: parsePage(page) });

  return (
    <SiteShell sidebar={<Sidebar />} title="文章">
      {listing.posts.length === 0 ? (
        <EmptyState title="暂无文章" description="还没有已发布且到达发布时间的文章。" />
      ) : (
        <PostList posts={listing.posts} />
      )}
      <Pagination
        basePath="/posts"
        page={listing.page}
        pageSize={listing.pageSize}
        total={listing.total}
      />
    </SiteShell>
  );
}
