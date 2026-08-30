"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminJson } from "@/lib/client/admin";
import type { AdminCommentView } from "@/lib/comments/types";

export function CommentRowActions({ comment }: { comment: AdminCommentView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  async function run(task: () => Promise<void>) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await task();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-table-actions admin-comment-actions">
      {comment.status === "pending" ? (
        <>
          <button
            className="admin-link-button"
            disabled={busy}
            onClick={() =>
              void run(() =>
                adminJson(`/api/admin/comments/${comment.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ status: "approved" }),
                }),
              )
            }
            type="button"
          >
            通过
          </button>
          <button
            className="admin-link-button"
            disabled={busy}
            onClick={() =>
              void run(() =>
                adminJson(`/api/admin/comments/${comment.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ status: "rejected" }),
                }),
              )
            }
            type="button"
          >
            拒绝
          </button>
        </>
      ) : null}
      <button
        className="admin-link-button"
        disabled={busy}
        onClick={() => setReplying((value) => !value)}
        type="button"
      >
        回复
      </button>
      <button
        className="admin-link-button"
        disabled={busy}
        onClick={() => {
          if (!window.confirm("确定删除这条评论？回复会一并删除。")) {
            return;
          }
          void run(() =>
            adminJson(`/api/admin/comments/${comment.id}`, {
              method: "DELETE",
            }),
          );
        }}
        type="button"
      >
        删除
      </button>
      {replying ? (
        <form
          className="admin-comment-reply"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await adminJson("/api/admin/comments", {
                method: "POST",
                body: JSON.stringify({
                  targetType: comment.targetType,
                  targetId: comment.targetId,
                  content: reply,
                  parentId: comment.parentId ?? comment.id,
                }),
              });
              setReply("");
              setReplying(false);
            });
          }}
        >
          <textarea
            maxLength={1000}
            onChange={(event) => setReply(event.target.value)}
            required
            rows={3}
            value={reply}
          />
          <button className="heo-button" disabled={busy} type="submit">
            发送回复
          </button>
        </form>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
