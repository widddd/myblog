"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { fetchCsrfToken } from "@/lib/client/csrf";

type ApiError = {
  message?: string;
};

export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      siteName: String(form.get("siteName") || ""),
      siteUrl: String(form.get("siteUrl") || ""),
      subtitle: String(form.get("subtitle") || ""),
      username: String(form.get("username") || ""),
      password: String(form.get("password") || ""),
      passwordConfirm: String(form.get("passwordConfirm") || ""),
      passphrase: String(form.get("passphrase") || ""),
      passphraseConfirm: String(form.get("passphraseConfirm") || ""),
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
        throw new Error(body.message || "创建失败");
      }

      router.replace("/admin/login");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <p className="admin-muted">
        先给站点起名字，再设管理员和备份口令。备份口令只能设一次，请另外记好，不要和登录密码相同。
      </p>
      <label className="form-field">
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
      <label className="form-field">
        站点地址（选填）
        <input
          maxLength={200}
          name="siteUrl"
          placeholder="https://example.com"
          type="url"
        />
      </label>
      <label className="form-field">
        首页副标题（选填）
        <input maxLength={200} name="subtitle" type="text" />
      </label>
      <label className="form-field">
        管理员用户名
        <input
          autoComplete="username"
          maxLength={64}
          name="username"
          required
          type="text"
        />
      </label>
      <label className="form-field">
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
      <label className="form-field">
        再输入一次密码
        <input
          autoComplete="new-password"
          maxLength={256}
          name="passwordConfirm"
          required
          type="password"
        />
      </label>
      <label className="form-field">
        备份口令
        <input
          autoComplete="new-password"
          maxLength={128}
          minLength={8}
          name="passphrase"
          required
          type="password"
        />
      </label>
      <label className="form-field">
        再输入一次备份口令
        <input
          autoComplete="new-password"
          maxLength={128}
          name="passphraseConfirm"
          required
          type="password"
        />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="heo-button" disabled={submitting} type="submit">
        {submitting ? "创建中…" : "创建站点"}
      </button>
    </form>
  );
}
