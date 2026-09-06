import Link from "next/link";

import { CoverMedia } from "@/components/common/CoverMedia";
import { postHref } from "@/lib/posts/path";
import type { PostCardModel } from "@/lib/posts/types";

export function RecommendModule({
  posts,
  limit = 6,
}: {
  posts: PostCardModel[];
  limit?: number;
}) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <div className="dash-recommend">
      {posts.slice(0, limit).map((post) => (
        <Link className="mini-card" href={postHref(post)} key={post.publicId}>
          {post.recommend ? <span className="mini-card__badge">荐</span> : null}
          <CoverMedia alt={post.title} src={post.cover} title={post.title} />
          <div className="mini-card__title">{post.title}</div>
        </Link>
      ))}
    </div>
  );
}
