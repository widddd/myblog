"use client";

import { ImageIcon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState } from "react";

import { AdminDialog } from "@/components/admin/AdminDialog";
import { MediaLibraryPicker } from "@/components/admin/MediaLibraryPicker";
import type { AdminUploadResult } from "@/lib/client/upload";
import { MEDIA_UPLOAD_MIME_TYPES } from "@/lib/upload/limits";

/**
 * 发布区的「插入媒体」按钮：图标按钮（不带文字），点开一个小卡片给两条路径
 * —— 从本地上传 / 从媒体库选（媒体库用**弹窗**，支持一次勾选多个）。
 *
 * 2026-10 起支持视频：`accept` 是**图片 + 视频**（不含音频）——这个 accept 也是
 * Android 宿主「弹自有相册还是系统选择器」的判据（见 docs/moment-video-spec.md）。
 * 一条瞬间最多 1 个视频的规则在 `MomentCompose` 里守（这里只负责选文件）。
 */
export function MomentImageButton({
  disabled,
  count,
  max,
  onUpload,
  onPickFromLibrary,
}: {
  disabled?: boolean;
  /** 已选张数，用于徽标与禁用 */
  count: number;
  max: number;
  onUpload: (files: FileList) => void;
  onPickFromLibrary: (files: AdminUploadResult[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const full = count >= max;
  const remaining = Math.max(0, max - count);

  return (
    <div className="moment-compose__media" ref={rootRef}>
      <button
        aria-label={`插入图片或视频（已选 ${count}/${max}）`}
        aria-haspopup="dialog"
        className="moment-compose__icon-btn"
        disabled={disabled || full}
        onClick={() => setOpen((current) => !current)}
        title={full ? `最多 ${max} 个` : "插入图片 / 视频"}
        type="button"
      >
        <ImageIcon width={18} height={18} />
        {count > 0 ? <span className="moment-compose__count">{count}</span> : null}
      </button>
      {open ? (
        <div className="moment-compose__pop" role="dialog" aria-label="插入图片 / 视频">
          <button
            className="moment-compose__pop-item"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <ImageIcon width={16} height={16} /> 从本地上传
          </button>
          <button
            className="moment-compose__pop-item"
            onClick={() => {
              setOpen(false);
              setLibraryOpen(true);
            }}
            type="button"
          >
            从媒体库选择（可多选）
          </button>
          <p className="moment-compose__pop-hint">
            还可以放 {remaining} 个，拖动可调整顺序；一条瞬间最多 1 个视频
          </p>
        </div>
      ) : null}
      <input
        accept={MEDIA_UPLOAD_MIME_TYPES.join(",")}
        hidden
        multiple
        onChange={(event) => {
          if (event.target.files?.length) {
            onUpload(event.target.files);
          }
          event.currentTarget.value = "";
          setOpen(false);
        }}
        ref={inputRef}
        type="file"
      />
      <AdminDialog
        onClose={() => setLibraryOpen(false)}
        open={libraryOpen}
        title="从媒体库选择"
        wide
      >
        <p className="admin-dialog__lead">
          一次可勾选多个（可翻页继续选），选好后点「加入」一次性放进这条瞬间。
        </p>
        <MediaLibraryPicker
          disabled={disabled}
          kinds={["image", "video"]}
          maxCount={remaining}
          onPickMany={(files) => {
            onPickFromLibrary(files);
            setLibraryOpen(false);
          }}
        />
      </AdminDialog>
    </div>
  );
}
