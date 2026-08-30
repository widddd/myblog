"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { fetchCsrfToken } from "@/lib/client/csrf";

type ApiError = {
  message?: string;
};

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") || "");
    const password = String(form.get("password") || "");

    try {
      const csrfToken = await fetchCsrfToken();
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ username, password }),
      });
      const body = (await response.json()) as ApiError;

      if (!response.ok) {
        throw new Error(body.message || "登录失败");
      }

      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="form-field">
        用户名
        <input
          name="username"
          type="text"
          autoComplete="username"
          maxLength={64}
          required
          autoFocus
        />
      </label>
      <label className="form-field">
        密码
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={256}
          required
        />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="heo-button" type="submit" disabled={submitting}>
        {submitting ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
