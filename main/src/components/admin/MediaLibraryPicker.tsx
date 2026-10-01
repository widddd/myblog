"use client";

import { CheckIcon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";

import { adminJson } from "@/lib/client/admin";
import type { AdminUploadKind, AdminUploadResult } from "@/lib/client/upload";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/uploads/usage-format";
import { formatClockDuration, formatDateTime } from "@/lib/utils/date";

type ListPayload = {
  data: AdminUploadResult[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * 媒体库选择器：点选多张（可跨分页），底部「加入 N 张」一次性回调 `onPickMany`。
 * 发布多图瞬间一次要选好几张，原来"点一张就关弹窗"太费手；
 * 编辑器那条链路（`MediaInsertMenu`）仍是单张插入，两个入口各自保留自己的行为。
 * （`maxCount` 由调用方按剩余可放张数给出，超出的条目直接点不动。）
 */
export function MediaLibraryPicker({
  kind,
  disabled,
  maxCount,
  onPickMany,
}: {
  kind: AdminUploadKind;
  disabled?: boolean;
  maxCount?: number;
  onPickMany: (files: AdminUploadResult[]) => void;
}) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminUploadResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Map<number, AdminUploadResult>>(new Map());

  useEffect(() => {
    let cancelled = false;
    // setLoading/setError 放在微任务里执行，避免在 effect 体内同步 setState（React 不推荐，见 P-098 同源经验）
    const start = window.setTimeout(() => {
      if (!cancelled) {
        setLoading(true);
        setError("");
      }
    }, 0);
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
      window.clearTimeout(start);
    };
  }, [kind, page]);

  const pages = Math.max(1, Math.ceil(total / 12));
  const pickedList = [...picked.values()];
  const reachedMax = maxCount !== undefined && pickedList.length >= maxCount;

  function toggle(file: AdminUploadResult) {
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(file.id)) {
        next.delete(file.id);
        return next;
      }
      if (maxCount !== undefined && next.size >= maxCount) {
        return next;
      }
      next.set(file.id, file);
      return next;
    });
  }

  return (
    <div className="admin-media-picker">
      <p className="admin-muted">
        点选多张（可跨页），选好后点底部按钮一次性加入
        {maxCount !== undefined ? `；最多 ${maxCount} 张` : ""}
      </p>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="admin-muted">读取中…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="admin-muted">媒体库里还没有这类文件。</p>
      ) : (
        <ul className="admin-media-picker__grid">
          {items.map((file) => {
            const selected = picked.has(file.id);
            return (
              <li key={file.id}>
                <button
                  aria-pressed={selected}
                  className={cn("admin-media-picker__item", selected && "is-selected")}
                  disabled={disabled || (!selected && reachedMax)}
                  onClick={() => toggle(file)}
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
                  {selected ? (
                    <span className="admin-media-picker__tick" aria-hidden>
                      <CheckIcon width={14} height={14} />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 ? (
        <div className="admin-media-picker__pager">
          <button
            className="admin-btn admin-btn--ghost"
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
            className="admin-btn admin-btn--ghost"
            disabled={page >= pages || loading}
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            下一页
          </button>
        </div>
      ) : null}
      <div className="admin-media-picker__actions">
        <span className="admin-muted">已选 {pickedList.length} 张</span>
        <button
          className="admin-btn admin-btn--sm"
          disabled={disabled || pickedList.length === 0}
          onClick={() => onPickMany(pickedList)}
          type="button"
        >
          加入 {pickedList.length > 0 ? pickedList.length : ""} 张
        </button>
      </div>
    </div>
  );
}
