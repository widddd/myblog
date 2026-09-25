"use client";

import { useState, type FormEvent } from "react";

import { fetchCsrfToken } from "@/lib/client/csrf";

type ApiError = {
  message?: string;
};

/**
 * 登录成功后做**文档级跳转**（`location.replace`），不用 `router.replace()` 软导航：
 *
 * 1. 登录是鉴权边界，软导航会复用登录前的客户端状态（Next 的段缓存 / bfcache /
 *    未登录时预取到的 `/admin` 载荷），可能落到旧的或重定向掉的载荷上——表现就是
 *    「登录后页面卡住，刷新才进得去后台」；文档跳转一定用新会话重新渲染。
 * 2. 跳转期间浏览器自己给加载状态，比软导航「按钮转一圈就没事发生」更诚实。
 * 3. 只发一次请求，省掉 `router.replace()` + `router.refresh()` 的两次 RSC 往返。
 *
 * 除此之外**成功分支不复位 `submitting`**：按钮要一直禁用到新页面接管。否则用户会在
 * 这段空隙再点一次，第二次请求撞上「5 次/15 分/IP」限速（429）或 CSRF 轮换，
 * 明知会话已建立却停在登录页——刷新才进得去。
 */
export function LoginForm({ next = "/admin" }: { next?: string }) {
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

      window.location.replace(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <p className="admin-muted">用你设好的管理员用户名和密码登录。</p>
      <label className="admin-field">
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
      <label className="admin-field">
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
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="admin-btn" type="submit" disabled={submitting}>
        {submitting ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
