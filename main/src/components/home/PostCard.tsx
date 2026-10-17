"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, type PointerEvent } from "react";

import { CoverMedia } from "@/components/common/CoverMedia";
import { MomentCard } from "@/components/home/modules/MomentCard";
import { interleaveByDate } from "@/lib/home/interleave";
import type { HomeMoment } from "@/lib/moments/types";
import { focalPosition, resolveCoverVisual } from "@/lib/posts/banner";
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

  // 列表卡只看封面自己的配置，**不再受 bannerStyle 影响**：
  //   image = 封面图 → 原大卡；fill = 纯色/混色 → 大卡 + 色块；none = 无封面 → 细条卡
  const cover = resolveCoverVisual(
    post.coverStyle,
    post.cover,
    post.coverColor,
    post.coverColor2,
  );
  const plain = cover.kind === "none";
  const fill = cover.kind === "fill" ? cover.background : undefined;
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
            {cover.kind === "image" ? (
              <CoverMedia
                alt={post.title}
                objectPosition={focalPosition(post.coverFocalX, post.coverFocalY)}
                src={cover.src}
                title={post.title}
              />
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

export type PostListProps = {
  posts: PostCardModel[];
  /**
   * 穿插进文章流里的瞬间（一个卡片一条瞬间）。不传 = 纯文章列表，行为与之前一致。
   * 取数在 `loadHomeData()` 里一次拿好，两个模块（瞬间模块 / 文章卡片）共用同一份。
   */
  moments?: HomeMoment[];
  /** 一页最多穿插几条瞬间；0 = 不插 */
  momentLimit?: number;
};

export function PostList({ posts, moments = [], momentLimit }: PostListProps) {
  // 瞬间与文章按时间穿插：发布时刻更早的排前面；比本页最后一篇还早的瞬间留给后面的页
  const sequence = useMemo(() => {
    if (moments.length === 0 || !momentLimit) {
      return null;
    }
    return interleaveByDate(posts, moments, {
      postDate: (post) => post.publishedAt,
      momentDate: (moment) => moment.createdAt,
      limit: momentLimit,
    });
  }, [posts, moments, momentLimit]);

  if (!sequence) {
    return (
      <div className="post-list">
        {posts.map((post, index) => (
          <PostCard index={index} key={post.slug} post={post} />
        ))}
      </div>
    );
  }

  return (
    <div className="post-list">
      {sequence.map((entry, index) =>
        entry.kind === "post" ? (
          <PostCard index={index} key={`post-${entry.item.slug}`} post={entry.item} />
        ) : (
          <MomentCard
            index={index}
            key={`moment-${entry.item.id}`}
            moment={entry.item}
          />
        ),
      )}
    </div>
  );
}
