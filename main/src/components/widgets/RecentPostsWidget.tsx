import Link from "next/link";

import { CoverMedia } from "@/components/common/CoverMedia";
import { postHref } from "@/lib/posts/path";
import type { PostCardModel } from "@/lib/posts/types";
import { formatPostDate } from "@/lib/utils/date";

export function RecentPostsWidget({
  heading = "最近发布",
  posts,
}: {
  heading?: string;
  posts: PostCardModel[];
}) {
  return (
    <section className="widget glass-card">
      <h2 className="widget__title">{heading}</h2>
      {posts.length === 0 ? (
        <p className="widget__empty">还没有文章。</p>
      ) : (
        <div>
          {posts.map((post) => (
            <Link
              className="recent-item"
              href={postHref(post)}
              key={post.publicId}
            >
              <CoverMedia alt={post.title} src={post.cover} title={post.title} />
              <div>
                <div className="recent-item__title">{post.title}</div>
                <time>{formatPostDate(post.publishedAt)}</time>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
