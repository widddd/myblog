import { CoverMedia } from "@/components/common/CoverMedia";
import { ViewTracker } from "@/components/post/ViewTracker";
import { WaveDivider } from "@/components/post/WaveDivider";
import { bannerFill } from "@/lib/posts/banner";
import type { PostDetailModel } from "@/lib/posts/types";
import { formatPostDate } from "@/lib/utils/date";

type PostHeroProps = {
  post: PostDetailModel;
};

export function PostHero({ post }: PostHeroProps) {
  const fill = bannerFill(post.bannerStyle, post.bannerColor, post.bannerColor2);

  return (
    <header className="post-hero" data-banner={post.bannerStyle}>
      <div className="post-hero__media">
        {post.bannerStyle === "cover" || !fill ? (
          <CoverMedia alt={post.title} src={post.cover} title={post.title} />
        ) : (
          <div className="post-hero__fill" style={{ background: fill }} />
        )}
      </div>
      <div className="post-hero__shade" />
      <div className="post-hero__inner">
        <div className="post-card__tips">
          {post.locked ? <span className="chip chip--locked">密码</span> : null}
          {post.category ? <span className="chip">{post.category.name}</span> : null}
        </div>
        <h1>{post.title}</h1>
        <div className="post-hero__meta">
          <span>{formatPostDate(post.publishedAt)}</span>
          <ViewTracker initialViews={post.views} publicId={post.publicId} />
          {post.tags.map((tag) => (
            <span key={tag.slug}>#{tag.name}</span>
          ))}
        </div>
      </div>
      <WaveDivider />
    </header>
  );
}
