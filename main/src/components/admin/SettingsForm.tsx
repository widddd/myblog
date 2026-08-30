"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminJson } from "@/lib/client/admin";

type SettingsValues = {
  siteName: string;
  announcement: string;
  banner: string;
  pageSize: number;
  backupPeriodDays: number;
  backupKeep: number;
  uploadMaxSizeMB: number;
  lastBackupAt: string | null;
};

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setError("");
    setSaving(true);
    try {
      await adminJson("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          siteName: values.siteName,
          announcement: values.announcement,
          banner: values.banner,
          pageSize: Number(values.pageSize),
          backupPeriodDays: Number(values.backupPeriodDays),
          backupKeep: Number(values.backupKeep),
          uploadMaxSizeMB: Number(values.uploadMaxSizeMB),
        }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
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
      <label className="form-field">
        站点名称
        <input
          onChange={(event) =>
            setValues((current) => ({ ...current, siteName: event.target.value }))
          }
          required
          value={values.siteName}
        />
      </label>
      <label className="form-field">
        公告
        <textarea
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              announcement: event.target.value,
            }))
          }
          rows={3}
          value={values.announcement}
        />
      </label>
      <label className="form-field">
        Banner URL（空则走 Bing 日图）
        <input
          onChange={(event) =>
            setValues((current) => ({ ...current, banner: event.target.value }))
          }
          value={values.banner}
        />
      </label>
      <label className="form-field">
        每页文章数
        <input
          min={1}
          max={50}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              pageSize: Number(event.target.value),
            }))
          }
          type="number"
          value={values.pageSize}
        />
      </label>
      <label className="form-field">
        备份周期（天）
        <input
          min={1}
          max={365}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              backupPeriodDays: Number(event.target.value),
            }))
          }
          type="number"
          value={values.backupPeriodDays}
        />
      </label>
      <label className="form-field">
        备份保留份数
        <input
          min={1}
          max={30}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              backupKeep: Number(event.target.value),
            }))
          }
          type="number"
          value={values.backupKeep}
        />
      </label>
      <label className="form-field">
        上传大小上限（MB）
        <input
          min={1}
          max={50}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              uploadMaxSizeMB: Number(event.target.value),
            }))
          }
          type="number"
          value={values.uploadMaxSizeMB}
        />
      </label>
      <p className="admin-muted">
        上次备份：{values.lastBackupAt ?? "尚未备份"}。文件在{" "}
        <Link href="/admin/backups">备份</Link> 页管理。
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="heo-button" disabled={saving} type="submit">
        {saving ? "保存中…" : "保存设置"}
      </button>
    </form>
  );
}
