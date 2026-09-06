"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminJson } from "@/lib/client/admin";

export function AccountForm({
  currentUsername,
  required = false,
}: {
  currentUsername: string;
  required?: boolean;
}) {
  const router = useRouter();
  const [username, setUsername] = useState(currentUsername);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const payload: {
        currentPassword: string;
        username?: string;
        newPassword?: string;
      } = { currentPassword };
      if (username.trim() && username.trim() !== currentUsername) {
        payload.username = username.trim();
      }
      if (newPassword) {
        payload.newPassword = newPassword;
      }
      await adminJson("/api/admin/account", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setCurrentPassword("");
      setNewPassword("");
      setNotice("管理员账号已更新。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "修改失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="admin-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {required ? (
        <p className="admin-danger">
          第一次进来请先改成你自己的用户名和密码。改完才能用其他功能。
        </p>
      ) : (
        <p className="admin-muted">改用户名或密码时，要先填现在的密码。</p>
      )}
      <p className="admin-danger">保存成功前不要关闭本页。</p>
      <label className="form-field">
        用户名
        <input
          autoComplete="username"
          maxLength={64}
          onChange={(event) => setUsername(event.target.value)}
          required
          value={username}
        />
      </label>
      <label className="form-field">
        当前密码
        <input
          autoComplete="current-password"
          maxLength={256}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          type="password"
          value={currentPassword}
        />
      </label>
      <label className="form-field">
        新密码{required ? "" : "（留空则不改）"}
        <input
          autoComplete="new-password"
          maxLength={256}
          minLength={required ? 8 : undefined}
          onChange={(event) => setNewPassword(event.target.value)}
          required={required}
          type="password"
          value={newPassword}
        />
      </label>
      {notice ? <p className="admin-backup-notice">{notice}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="heo-button" disabled={saving} type="submit">
        {saving ? "保存中…" : required ? "保存并进入后台" : "更新账号"}
      </button>
    </form>
  );
}
