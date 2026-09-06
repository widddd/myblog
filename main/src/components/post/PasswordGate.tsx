"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { fetchCsrfToken } from "@/lib/client/csrf";

type ApiError = {
  message?: string;
};

export function PasswordGate({
  publicId,
  title,
}: {
  publicId: string;
  title: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");

    try {
      const csrfToken = await fetchCsrfToken();
      const response = await fetch(
        `/api/posts/${encodeURIComponent(publicId)}/unlock`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({ password }),
        },
      );
      const body = (await response.json()) as ApiError;
      if (!response.ok) {
        throw new Error(body.message || "解锁失败");
      }

      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "解锁失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="password-gate" onSubmit={onSubmit}>
      <h2>这篇文章已加密</h2>
      <p>
        《{title}》需要密码才能阅读。验证成功后，本设备可在 2 小时内继续访问。
      </p>
      <label className="form-field">
        访问密码
        <input
          autoComplete="current-password"
          maxLength={256}
          name="password"
          required
          type="password"
        />
      </label>
      <button className="heo-button" disabled={submitting} type="submit">
        {submitting ? "验证中…" : "解锁"}
      </button>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
