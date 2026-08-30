"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { adminJson } from "@/lib/client/admin";

type BackupFile = {
  name: string;
  size: number;
  createdAt: string;
};

type BackupListResponse = {
  data: {
    files: BackupFile[];
    running: boolean;
    lastBackupAt: string | null;
  };
};

function formatSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupPanel({
  initialFiles,
  initialLastBackupAt,
}: {
  initialFiles: BackupFile[];
  initialLastBackupAt: string | null;
}) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [lastBackupAt, setLastBackupAt] = useState(initialLastBackupAt);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lastLabel = useMemo(() => {
    if (!lastBackupAt) {
      return "尚未备份";
    }
    const parsed = new Date(lastBackupAt);
    return Number.isNaN(parsed.getTime())
      ? lastBackupAt
      : parsed.toLocaleString("zh-CN");
  }, [lastBackupAt]);

  async function refresh() {
    const payload = await adminJson<BackupListResponse>("/api/admin/backup/list");
    setFiles(payload.data.files);
    setLastBackupAt(payload.data.lastBackupAt);
    router.refresh();
  }

  async function run() {
    setError("");
    setBusy(true);
    try {
      await adminJson("/api/admin/backup/run", { method: "POST" });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "备份失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (!window.confirm(`确定删除备份「${name}」？`)) {
      return;
    }
    setError("");
    setBusy(true);
    try {
      await adminJson(`/api/admin/backup/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-backup">
      <p className="admin-muted">上次备份：{lastLabel}</p>
      <div className="admin-form-actions">
        <button className="heo-button" disabled={busy} onClick={() => void run()} type="button">
          {busy ? "处理中…" : "立即备份"}
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {files.length === 0 ? (
        <p>还没有备份文件。点「立即备份」会生成一份数据库 + 上传文件的 tar.gz。</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>文件</th>
              <th>大小</th>
              <th>时间</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.name}>
                <td>{file.name}</td>
                <td>{formatSize(file.size)}</td>
                <td>{new Date(file.createdAt).toLocaleString("zh-CN")}</td>
                <td className="admin-table-actions">
                  <a href={`/api/admin/backup/download/${encodeURIComponent(file.name)}`}>
                    下载
                  </a>
                  <button
                    className="admin-link-button"
                    disabled={busy}
                    onClick={() => void remove(file.name)}
                    type="button"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
