"use client";

import type { PublicComment } from "@/lib/comments/types";
import { formatPostDate } from "@/lib/utils/date";

type CommentItemProps = {
  comment: PublicComment;
  nested?: boolean;
  onReply?: (comment: PublicComment) => void;
};

export function CommentItem({ comment, nested = false, onReply }: CommentItemProps) {
  return (
    <article className={nested ? "comment-item comment-item--reply" : "comment-item"}>
      <header className="comment-item__head">
        <strong>{comment.nickname}</strong>
        {comment.isAdmin ? <span className="chip">管理员</span> : null}
        <time>{formatPostDate(comment.createdAt)}</time>
      </header>
      <p className="comment-item__body">{comment.content}</p>
      {!nested && onReply ? (
        <button
          className="admin-link-button"
          onClick={() => onReply(comment)}
          type="button"
        >
          回复
        </button>
      ) : null}
      {comment.replies.length > 0 ? (
        <div className="comment-item__replies">
          {comment.replies.map((reply) => (
            <CommentItem comment={reply} key={reply.id} nested />
          ))}
        </div>
      ) : null}
    </article>
  );
}
