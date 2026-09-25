import { CoverMedia } from "@/components/common/CoverMedia";
import { ViewTracker } from "@/components/post/ViewTracker";
import { WaveDivider } from "@/components/post/WaveDivider";
import { bannerFill } from "@/lib/posts/banner";
import type { PostDetailModel } from "@/lib/posts/types";
import { formatDateTimeSeconds, formatPostDateDetail } from "@/lib/utils/date";

type PostHeroProps = {
  post: PostDetailModel;
};

export function PostHero({ post }: PostHeroProps) {
  const fill = bannerFill(post.bannerStyle, post.bannerColor, post.bannerColor2);
  // 「已修改」只在真的改过之后才出现：作者在编辑页设置栏里可以关掉（showRevisedAt），
  // 而且修改时间必须晚于发布时间（发布前反复编辑、定时转发布都不算，见 lib/posts/admin.ts）。
  const revisedAt = post.revisedAt ? new Date(post.revisedAt) : null;
  const publishedAt = post.publishedAt ? new Date(post.publishedAt) : null;
  const showRevised =
    Boolean(post.showRevisedAt) &&
    revisedAt != null &&
    publishedAt != null &&
    revisedAt.getTime() > publishedAt.getTime();

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
          {post.authorName ? (
            <span className="post-hero__author">{post.authorName}</span>
          ) : null}
          <span>{formatPostDateDetail(post.publishedAt)}</span>
          {showRevised ? (
            <span className="post-hero__revised">
              已修改 {formatDateTimeSeconds(revisedAt)}
            </span>
          ) : null}
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
