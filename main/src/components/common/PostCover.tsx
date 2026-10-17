import { CoverMedia } from "@/components/common/CoverMedia";
import { focalPosition, resolveCoverVisual } from "@/lib/posts/banner";
import type { PostCardModel } from "@/lib/posts/types";

type PostCoverProps = {
  post: Pick<
    PostCardModel,
    "cover" | "coverStyle" | "coverColor" | "coverColor2" | "coverFocalX" | "coverFocalY"
  >;
  alt: string;
};

/**
 * 文章封面的统一渲染：图片 / 纯色混色 / 无图占位。
 *
 * 封面形态只看 `coverStyle`，不再借用 `bannerStyle`；首页推荐、最近文章、
 * 自建模块的文章格都走这里，避免「列表卡显示图片、推荐卡却显示成占位」。
 */
export function PostCover({ post, alt }: PostCoverProps) {
  const visual = resolveCoverVisual(
    post.coverStyle,
    post.cover,
    post.coverColor,
    post.coverColor2,
  );
  if (visual.kind === "fill") {
    return (
      <div className="cover-media">
        <div className="cover-fill" style={{ background: visual.background }} />
      </div>
    );
  }
  if (visual.kind === "image") {
    return (
      <CoverMedia
        alt={alt}
        objectPosition={focalPosition(post.coverFocalX, post.coverFocalY)}
        src={visual.src}
        title={alt}
      />
    );
  }
  return <CoverMedia alt={alt} src={null} title={alt} />;
}
