"use client";

import { useState } from "react";

import { fetchCsrfToken } from "@/lib/client/csrf";

type LikeButtonProps = {
  momentId: number;
  liked: boolean;
  likeCount: number;
};

type LikeResponse = {
  data?: { liked: boolean; likeCount: number };
  message?: string;
};

export function LikeButton({ momentId, liked, likeCount }: LikeButtonProps) {
  const [state, setState] = useState({ liked, likeCount });
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) {
      return;
    }
    const previous = state;
    setState({
      liked: !previous.liked,
      likeCount: previous.likeCount + (previous.liked ? -1 : 1),
    });
    setPending(true);
    try {
      const token = await fetchCsrfToken();
      const response = await fetch(`/api/moments/${momentId}/like`, {
        method: "POST",
        headers: { "x-csrf-token": token },
      });
      const body = (await response.json()) as LikeResponse;
      if (!response.ok || !body.data) {
        throw new Error(body.message || "点赞失败");
      }
      setState(body.data);
    } catch {
      setState(previous);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      aria-pressed={state.liked}
      className={state.liked ? "moment-like is-liked" : "moment-like"}
      disabled={pending}
      onClick={() => void toggle()}
      type="button"
    >
      {state.liked ? "已赞" : "点赞"} · {state.likeCount}
    </button>
  );
}
