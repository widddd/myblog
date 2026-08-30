"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type PointerEvent } from "react";

import { CoverMedia } from "@/components/common/CoverMedia";
import type { PostCardModel } from "@/lib/posts/types";
import { formatPostDate } from "@/lib/utils/date";

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

export function PostCard({ post, index = 0 }: PostCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const nextRippleId = useRef(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);

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
      <article className="post-card glass-card" onPointerDown={onPointerDown} ref={cardRef}>
        <Link
          aria-label={post.title}
          className="post-card__hit"
          href={`/posts/${post.slug}`}
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
        <div className="post-card__cover">
          <CoverMedia alt={post.title} src={post.cover} title={post.title} />
        </div>
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
          <p className="post-card__excerpt">
            {post.locked
              ? "这篇文章已加密，标题可见，正文与摘要已隐藏。"
              : post.excerpt}
          </p>
          <div className="post-card__meta">
            <div className="tag-row">
              {post.tags.map((tag) => (
                <Link href={`/tags/${tag.slug}`} key={tag.slug}>
                  #{tag.name}
                </Link>
              ))}
            </div>
            <time>{formatPostDate(post.publishedAt)}</time>
          </div>
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
