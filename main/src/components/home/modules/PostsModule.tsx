import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { PostList } from "@/components/home/PostCard";
import type { PostCardModel, TaxonomyItem } from "@/lib/posts/types";

export function PostsModule({
  listing,
  categories,
  showCategoryBar = true,
}: {
  listing: {
    posts: PostCardModel[];
    total: number;
    page: number;
    pageSize: number;
  };
  categories: TaxonomyItem[];
  showCategoryBar?: boolean;
}) {
  return (
    <div className="home-posts">
      {showCategoryBar && categories.length > 0 ? (
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
  );
}
