import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { HomeBanner } from "@/components/home/HomeBanner";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { PostList } from "@/components/home/PostCard";
import { Sidebar } from "@/components/layout/Sidebar";
import { resolveHomeBanner } from "@/lib/banner/resolve";
import { listCategories, listPublishedPosts, listRecommendPosts } from "@/lib/posts/query";
import { getPublicSettings } from "@/lib/settings";
import { parsePage } from "@/lib/utils/page";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const [settings, banner, recommend, listing, categories] = await Promise.all([
    getPublicSettings(),
    resolveHomeBanner(),
    listRecommendPosts(6),
    listPublishedPosts({ page }),
    listCategories(),
  ]);

  return (
    <div className="home-page">
      <HomeBanner banner={banner} siteName={settings.siteName} />
      <div className="home-below" id="home-content">
        <HomeDashboard posts={recommend} />
        <div className="layout">
          <div className="layout__main">
            {categories.length > 0 ? (
              <nav className="category-bar glass-card" aria-label="分类">
                <Link className="is-active" href="/">
                  全部
                </Link>
                {categories.map((item) => (
                  <Link href={`/categories/${item.slug}`} key={item.slug}>
                    {item.name}
                  </Link>
                ))}
              </nav>
            ) : null}
            {listing.posts.length === 0 ? (
              <EmptyState
                title="还没有已发布的文章"
                description="运行 pnpm db:seed 写入演示数据，或到后台发布第一篇。"
              />
            ) : (
              <PostList posts={listing.posts} />
            )}
            <Pagination
              basePath="/"
              page={listing.page}
              pageSize={listing.pageSize}
              total={listing.total}
            />
          </div>
          <aside className="layout__aside">
            <Sidebar />
          </aside>
        </div>
      </div>
    </div>
  );
}
