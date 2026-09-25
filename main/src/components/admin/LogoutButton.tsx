"use client";

import { useState } from "react";

import { fetchCsrfToken } from "@/lib/client/csrf";

/**
 * 退出同样走**文档级跳转**：退出也是鉴权边界，软导航会把已登录时渲染出来的
 * 后台载荷留在客户端缓存里（与 LoginForm 同一类问题，见那边的注释）。
 */
export function LogoutButton() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setError("");
    setSubmitting(true);

    try {
      const token = await fetchCsrfToken();
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "x-csrf-token": token,
        },
      });

      if (!response.ok) {
        throw new Error("退出登录失败");
      }

      window.location.replace("/admin/login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "退出登录失败");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        className="admin-btn admin-btn--ghost"
        type="button"
        onClick={logout}
        disabled={submitting}
      >
        {submitting ? "退出中…" : "退出登录"}
      </button>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
