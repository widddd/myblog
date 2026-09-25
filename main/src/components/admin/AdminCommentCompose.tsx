"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { adminJson } from "@/lib/client/admin";

export function AdminCommentCompose() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const targetType = String(data.get("targetType") || "board");
    const targetIdRaw = String(data.get("targetId") || "0");
    const targetId = Number.parseInt(targetIdRaw, 10);
    const content = String(data.get("content") || "").trim();

    try {
      await adminJson("/api/admin/comments", {
        method: "POST",
        body: JSON.stringify({
          targetType,
          targetId: Number.isInteger(targetId) ? targetId : 0,
          content,
        }),
      });
      form.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发表失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <div className="admin-field-row">
        <label className="admin-field">
          对象
          <select defaultValue="board" name="targetType">
            <option value="board">留言板</option>
            <option value="post">文章</option>
            <option value="moment">瞬间</option>
          </select>
        </label>
        <label className="admin-field">
          对象 ID（留言板填 0）
          <input defaultValue="0" min={0} name="targetId" type="number" />
        </label>
      </div>
      <label className="admin-field">
        管理员发言
        <textarea maxLength={1000} name="content" required rows={3} />
      </label>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="admin-btn" disabled={busy} type="submit">
        {busy ? "发表中…" : "直接发布"}
      </button>
    </form>
  );
}
