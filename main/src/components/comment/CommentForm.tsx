"use client";

import { useSyncExternalStore, useState, type FormEvent } from "react";

import { fetchCsrfToken } from "@/lib/client/csrf";
import type { CommentTargetType } from "@/lib/comments/types";

const NICK_KEY = "myblog-comment-nickname";
const EMAIL_KEY = "myblog-comment-email";

type CommentFormProps = {
  targetType: CommentTargetType;
  targetId: number;
  parentId?: number | null;
  replyTo?: string | null;
  onCancelReply?: () => void;
  onSubmitted?: () => void;
};

type ApiError = {
  message?: string;
};

export function CommentForm({
  targetType,
  targetId,
  parentId,
  replyTo,
  onCancelReply,
  onSubmitted,
}: CommentFormProps) {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const savedNickname = useStoredValue(NICK_KEY);
  const savedEmail = useStoredValue(EMAIL_KEY);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const form = event.currentTarget;
    const data = new FormData(form);
    const nickname = String(data.get("nickname") || "").trim();
    const email = String(data.get("email") || "").trim();
    const content = String(data.get("content") || "").trim();
    const honeypot = String(data.get("honeypot") || "");

    try {
      const csrfToken = await fetchCsrfToken();
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          targetType,
          targetId,
          nickname,
          email: email || null,
          content,
          parentId: parentId ?? null,
          honeypot,
        }),
      });
      const body = (await response.json()) as ApiError;
      if (!response.ok) {
        throw new Error(body.message || "提交失败");
      }

      try {
        window.localStorage.setItem(NICK_KEY, nickname);
        window.localStorage.setItem(EMAIL_KEY, email);
      } catch {
        // Ignore quota / private mode.
      }

      const contentField = form.elements.namedItem("content");
      if (contentField instanceof HTMLTextAreaElement) {
        contentField.value = "";
      }
      const honeypotField = form.elements.namedItem("honeypot");
      if (honeypotField instanceof HTMLInputElement) {
        honeypotField.value = "";
      }
      setDone(true);
      onSubmitted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      {replyTo ? (
        <p className="comment-form__reply">
          回复 {replyTo}
          {onCancelReply ? (
            <button onClick={onCancelReply} type="button">
              取消
            </button>
          ) : null}
        </p>
      ) : null}
      <div className="comment-form__row">
        <label className="form-field">
          昵称
          <input
            autoComplete="nickname"
            defaultValue={savedNickname}
            key={`nickname-${savedNickname}`}
            maxLength={32}
            name="nickname"
            required
          />
        </label>
        <label className="form-field">
          邮箱（选填，不公开）
          <input
            autoComplete="email"
            defaultValue={savedEmail}
            key={`email-${savedEmail}`}
            maxLength={120}
            name="email"
            type="email"
          />
        </label>
      </div>
      <label className="comment-honeypot" aria-hidden="true">
        网站
        <input autoComplete="off" name="honeypot" tabIndex={-1} />
      </label>
      <label className="form-field">
        评论
        <textarea maxLength={1000} name="content" required rows={4} />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="comment-form__ok">已提交，等待审核后显示。</p>
      ) : null}
      <button className="heo-button" disabled={submitting} type="submit">
        {submitting ? "提交中…" : parentId ? "发表回复" : "发表评论"}
      </button>
    </form>
  );
}

function readStorage(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function useStoredValue(key: string): string {
  return useSyncExternalStore(
    () => () => undefined,
    () => readStorage(key),
    () => "",
  );
}
