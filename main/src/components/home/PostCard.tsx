"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type PointerEvent } from "react";

import { CoverMedia } from "@/components/common/CoverMedia";
import { bannerFill, postBannerKind } from "@/lib/posts/banner";
import { postHref } from "@/lib/posts/path";
import type { PostCardModel } from "@/lib/posts/types";
import { formatRelativeDate } from "@/lib/utils/date";

type PostCardProps = {
  post: PostCardModel;
  index?: number;
};

type Ripple = {
  id: number;
  x: number;
  y: number;
  size: number;
};

const LOCKED_LEAD = "这篇文章已加密，标题可见，正文与摘要已隐藏。";

export function PostCard({ post, index = 0 }: PostCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const nextRippleId = useRef(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  // 卡片画什么由 bannerStyle 决定（**不能只看 cover 字段**：选了"纯色 / 混色"的文章
  // 本来就没有图，那是作者选的色块，不是"无封面"）：
  //   image = 封面图 → 原大卡；fill = 纯色/混色 → 大卡 + 色块；none = 无封面 → 细条卡
  const banner = postBannerKind(post.bannerStyle, post.cover);
  const plain = banner === "none";
  const fill =
    banner === "fill"
      ? bannerFill(post.bannerStyle, post.bannerColor, post.bannerColor2)
      : undefined;
  const lead = post.locked ? LOCKED_LEAD : post.excerpt;

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const size =
      Math.hypot(
        Math.max(x, rect.width - x),
        Math.max(y, rect.height - y),
      ) * 2;
    const id = nextRippleId.current++;
    setRipples((current) => [...current, { id, x, y, size }]);
    window.setTimeout(() => {
      setRipples((current) => current.filter((item) => item.id !== id));
    }, 500);
  }, []);

  return (
    <div
      className="post-card-wrap"
      style={{ animationDelay: `${0.08 + index * 0.06}s` }}
    >
      <article
        className={plain ? "post-card post-card--plain glass-card" : "post-card glass-card"}
        onPointerDown={onPointerDown}
        ref={cardRef}
      >
        <Link
          aria-label={post.title}
          className="post-card__hit"
          href={postHref(post)}
        />
        <div aria-hidden="true" className="post-card__ripples">
          {ripples.map((ripple) => (
            <span
              className="post-card__ripple"
              key={ripple.id}
              style={{
                left: ripple.x,
                top: ripple.y,
                width: ripple.size,
                height: ripple.size,
                marginLeft: -ripple.size / 2,
                marginTop: -ripple.size / 2,
              }}
            />
          ))}
        </div>
        {plain ? null : (
          <div className="post-card__cover">
            {banner === "image" ? (
              <CoverMedia alt={post.title} src={post.cover} title={post.title} />
            ) : (
              <div className="post-card__fill" style={{ background: fill }} />
            )}
          </div>
        )}
        <div className="post-card__body">
          <div className="post-card__tips">
            {post.pinned ? <span className="chip chip--pin">置顶</span> : null}
            {post.locked ? <span className="chip chip--locked">密码</span> : null}
            {post.category ? (
              <Link className="chip" href={`/categories/${post.category.slug}`}>
                {post.category.name}
              </Link>
            ) : null}
          </div>
          <h2 className="post-card__title">{post.title}</h2>
          {plain ? (
            lead ? (
              <p className="post-card__lead">
                <span className="post-card__lead-frame">
                  <span className="post-card__lead-text">{lead}</span>
                  {/* 同一行文字再叠一层：它自己被高斯模糊，掩码让模糊从左到右加深、收尾整行隐去 */}
                  <span aria-hidden="true" className="post-card__lead-blur">
                    {lead}
                  </span>
                </span>
              </p>
            ) : null
          ) : (
            <p className="post-card__excerpt">
              {post.locked
                ? LOCKED_LEAD
                : post.excerpt}
            </p>
          )}
          {plain ? (
            /* 无封面细条卡：右下角补一条时间（与有封面卡片的右下角对齐），
               卡片只给相对时间，不显示精确日期 —— 精确日期留给文章页 */
            <time className="post-card__plain-time">
              {formatRelativeDate(post.publishedAt)}
            </time>
          ) : (
            <div className="post-card__meta">
              <div className="tag-row">
                {post.tags.map((tag) => (
                  <Link href={`/tags/${tag.slug}`} key={tag.slug}>
                    #{tag.name}
                  </Link>
                ))}
              </div>
              <time>{formatRelativeDate(post.publishedAt)}</time>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

export function PostList({ posts }: { posts: PostCardModel[] }) {
  return (
    <div className="post-list">
      {posts.map((post, index) => (
        <PostCard index={index} key={post.slug} post={post} />
      ))}
    </div>
  );
}
