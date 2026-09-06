import Link from "next/link";

import { CoverMedia } from "@/components/common/CoverMedia";
import { PostList } from "@/components/home/PostCard";
import { CategoriesWidget } from "@/components/widgets/CategoriesWidget";
import { RecentPostsWidget } from "@/components/widgets/RecentPostsWidget";
import { SiteStatsWidget } from "@/components/widgets/SiteStatsWidget";
import { TagsWidget } from "@/components/widgets/TagsWidget";
import type { HomeData } from "@/lib/home/data";
import type { HomeBlock } from "@/lib/home/types";
import { isSafeHref } from "@/lib/media/url";
import { postHref } from "@/lib/posts/path";
import { cn } from "@/lib/utils/cn";

function postsFor(block: HomeBlock, data: HomeData) {
  const source = block.source === "recommend" ? data.recommend : data.recent;
  return source.slice(0, block.limit ?? 6);
}

/**
 * 自建模块里的基础积木。全部复用现有前台组件，不新造平行 UI（AGENTS 红线 1）。
 */
export function BlockRenderer({
  block,
  data,
}: {
  block: HomeBlock;
  data: HomeData;
}) {
  switch (block.type) {
    case "heading": {
      const level = block.level ?? 2;
      const Tag = (`h${level}` as const) satisfies keyof HTMLElementTagNameMap;
      return <Tag className="home-block__heading">{block.text}</Tag>;
    }
    case "text":
      return <p className="home-block__text">{block.text}</p>;
    case "html":
      // 管理员内容，按既定决策直接注入（P-034）。
      return (
        <div
          className="home-block__html"
          dangerouslySetInnerHTML={{ __html: block.text ?? "" }}
        />
      );
    case "button":
      return (
        <Link
          className={cn(
            "heo-button",
            block.variant === "ghost" && "heo-button--ghost",
          )}
          href={block.href && isSafeHref(block.href) ? block.href : "/"}
        >
          {block.text || "按钮"}
        </Link>
      );
    case "image":
      return (
        <div className="home-block__image">
          <CoverMedia
            alt={block.alt ?? ""}
            src={block.src ?? null}
            title={block.alt || "图片"}
          />
        </div>
      );
    case "divider":
      return <hr className="home-block__divider" />;
    case "postList":
      return <PostList posts={postsFor(block, data)} />;
    case "postGrid":
      return (
        <div className="dash-recommend">
          {postsFor(block, data).map((post) => (
            <Link
              className="mini-card"
              href={postHref(post)}
              key={post.publicId}
            >
              <CoverMedia alt={post.title} src={post.cover} title={post.title} />
              <div className="mini-card__title">{post.title}</div>
            </Link>
          ))}
        </div>
      );
    case "categories":
      return (
        <CategoriesWidget
          categories={data.categories}
          heading={block.text || "分类"}
        />
      );
    case "tags":
      return <TagsWidget heading={block.text || "标签"} tags={data.tags} />;
    case "siteStats":
      return data.stats ? (
        <SiteStatsWidget heading={block.text || "站点"} stats={data.stats} />
      ) : null;
    case "recent":
      return (
        <RecentPostsWidget
          heading={block.text || "最近发布"}
          posts={data.recent.slice(0, block.limit ?? 5)}
        />
      );
    default:
      return null;
  }
}
