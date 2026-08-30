"use client";

import { useState } from "react";

import { CommentForm } from "@/components/comment/CommentForm";
import { CommentItem } from "@/components/comment/CommentItem";
import type { CommentTargetType, PublicComment } from "@/lib/comments/types";

type CommentSectionProps = {
  targetType: CommentTargetType;
  targetId: number;
  initialComments: PublicComment[];
  total: number;
  pageSize?: number;
};

type ListResponse = {
  data?: PublicComment[];
  total?: number;
  page?: number;
  message?: string;
};

export function CommentSection({
  targetType,
  targetId,
  initialComments,
  total,
  pageSize = 50,
}: CommentSectionProps) {
  const [comments, setComments] = useState(initialComments);
  const [loadedTotal, setLoadedTotal] = useState(total);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<PublicComment | null>(null);

  async function loadMore() {
    if (loadingMore || comments.length >= loadedTotal) {
      return;
    }
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const url = new URL("/api/comments", window.location.origin);
      url.searchParams.set("targetType", targetType);
      url.searchParams.set("targetId", String(targetId));
      url.searchParams.set("page", String(nextPage));
      url.searchParams.set("pageSize", String(pageSize));
      const response = await fetch(url);
      const body = (await response.json()) as ListResponse;
      if (!response.ok) {
        throw new Error(body.message || "加载失败");
      }
      setComments((current) => [...current, ...(body.data ?? [])]);
      setLoadedTotal(body.total ?? loadedTotal);
      setPage(nextPage);
    } catch {
      // Keep already loaded comments.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="comment-section glass-card">
      <h2 className="comment-section__title">评论 {loadedTotal}</h2>
      {comments.length === 0 ? (
        <p className="widget__empty">还没有评论，来做第一个吧。</p>
      ) : (
        <div className="comment-list">
          {comments.map((comment) => (
            <CommentItem
              comment={comment}
              key={comment.id}
              onReply={setReplyTo}
            />
          ))}
        </div>
      )}
      {comments.length < loadedTotal ? (
        <button
          className="heo-button heo-button--ghost"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          type="button"
        >
          {loadingMore ? "加载中…" : "加载更多"}
        </button>
      ) : null}
      <CommentForm
        key={replyTo ? `reply-${replyTo.id}` : "top"}
        onCancelReply={replyTo ? () => setReplyTo(null) : undefined}
        onSubmitted={() => setReplyTo(null)}
        parentId={replyTo?.id ?? null}
        replyTo={replyTo?.nickname ?? null}
        targetId={targetId}
        targetType={targetType}
      />
    </section>
  );
}
