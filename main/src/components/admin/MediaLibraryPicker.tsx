"use client";

import { useEffect, useState } from "react";

import { adminJson } from "@/lib/client/admin";
import type { AdminUploadKind, AdminUploadResult } from "@/lib/client/upload";
import { formatBytes } from "@/lib/uploads/usage-format";
import { formatClockDuration, formatDateTime } from "@/lib/utils/date";

type ListPayload = {
  data: AdminUploadResult[];
  total: number;
  page: number;
  pageSize: number;
};

export function MediaLibraryPicker({
  kind,
  disabled,
  onPick,
}: {
  kind: AdminUploadKind;
  disabled?: boolean;
  onPick: (file: AdminUploadResult) => void;
}) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminUploadResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void adminJson<ListPayload>(`/api/admin/uploads?page=${page}&pageSize=12&kind=${kind}`)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setItems(payload.data);
        setTotal(payload.total);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "读取媒体库失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, page]);

  const pages = Math.max(1, Math.ceil(total / 12));

  return (
    <div className="admin-media-picker">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="admin-muted">读取中…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="admin-muted">媒体库里还没有这类文件。</p>
      ) : (
        <ul className="admin-media-picker__grid">
          {items.map((file) => (
            <li key={file.id}>
              <button
                className="admin-media-picker__item"
                disabled={disabled}
                onClick={() => onPick(file)}
                type="button"
              >
                {file.kind === "image" && (file.thumb?.url || file.original.url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={file.thumb?.url ?? file.original.url} />
                ) : file.kind === "audio" ? (
                  <span className="admin-media-card__audio">
                    <span aria-hidden>♪</span>
                    {file.duration != null ? formatClockDuration(file.duration) : "音频"}
                  </span>
                ) : (
                  <span className="admin-media-card__audio">视频</span>
                )}
                <span className="admin-muted">
                  {formatBytes(file.size)} · {formatDateTime(file.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <div className="admin-media-picker__pager">
          <button
            className="heo-button heo-button--ghost"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            上一页
          </button>
          <span className="admin-muted">
            {page} / {pages}
          </span>
          <button
            className="heo-button heo-button--ghost"
            disabled={page >= pages || loading}
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}
