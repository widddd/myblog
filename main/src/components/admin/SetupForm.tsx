"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { fetchCsrfToken } from "@/lib/client/csrf";

type ApiError = {
  message?: string;
};

export function SetupForm({ recovery = false }: { recovery?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const payload = recovery
      ? {
          username: String(form.get("username") || ""),
          password: String(form.get("password") || ""),
          passwordConfirm: String(form.get("passwordConfirm") || ""),
        }
      : {
          siteName: String(form.get("siteName") || ""),
          siteUrl: String(form.get("siteUrl") || ""),
          subtitle: String(form.get("subtitle") || ""),
          username: String(form.get("username") || ""),
          password: String(form.get("password") || ""),
          passwordConfirm: String(form.get("passwordConfirm") || ""),
        };

    try {
      const csrfToken = await fetchCsrfToken();
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as ApiError;

      if (!response.ok) {
        throw new Error(body.message || (recovery ? "重建失败" : "创建失败"));
      }

      router.replace("/admin/login");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : recovery ? "重建失败" : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <p className="admin-muted">
        {recovery
          ? "站点名称、首页布局和备份口令都还在。这里只补一个管理员账号，不会改备份口令。"
          : "先给站点起名字，再设置管理员账号。备份口令会在执行加密备份或恢复时临时输入，不会保存。"}
      </p>
      {recovery ? null : (
        <>
          <label className="admin-field">
            站点名称
            <input
              autoComplete="organization"
              autoFocus
              maxLength={80}
              name="siteName"
              placeholder="会出现在导航和首页大标题"
              required
              type="text"
            />
          </label>
          <label className="admin-field">
            站点地址（选填）
            <input
              maxLength={200}
              name="siteUrl"
              placeholder="https://example.com"
              type="url"
            />
          </label>
          <label className="admin-field">
            首页副标题（选填）
            <input maxLength={200} name="subtitle" type="text" />
          </label>
        </>
      )}
      <label className="admin-field">
        管理员用户名
        <input
          autoComplete="username"
          autoFocus={recovery}
          maxLength={64}
          name="username"
          required
          type="text"
        />
      </label>
      <label className="admin-field">
        管理员密码
        <input
          autoComplete="new-password"
          maxLength={256}
          minLength={8}
          name="password"
          required
          type="password"
        />
      </label>
      <label className="admin-field">
        再输入一次密码
        <input
          autoComplete="new-password"
          maxLength={256}
          name="passwordConfirm"
          required
          type="password"
        />
      </label>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="admin-btn" disabled={submitting} type="submit">
        {submitting ? "处理中…" : recovery ? "重建管理员" : "创建站点"}
      </button>
    </form>
  );
}
