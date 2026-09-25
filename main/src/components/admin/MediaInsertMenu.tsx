"use client";

import { useRef, useState } from "react";

import { AdminDialog } from "@/components/admin/AdminDialog";
import { MediaLibraryPicker } from "@/components/admin/MediaLibraryPicker";
import type { AdminUploadKind, AdminUploadResult } from "@/lib/client/upload";
import { isSafeMediaUrl } from "@/lib/media/url";

type MediaInsertMenuProps = {
  label: string;
  accept: string;
  kind: AdminUploadKind;
  multiple?: boolean;
  busy?: boolean;
  onUpload: (files: FileList) => void;
  onLink: (url: string) => void;
  onPick: (file: AdminUploadResult) => void;
};

export function MediaInsertMenu({
  label,
  accept,
  kind,
  multiple = true,
  busy = false,
  onUpload,
  onLink,
  onPick,
}: MediaInsertMenuProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [libraryMode, setLibraryMode] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function closeDialog() {
    setOpen(false);
    setLinkMode(false);
    setLibraryMode(false);
    setError("");
    setUrl("");
  }

  function submitLink() {
    const next = url.trim();
    if (!isSafeMediaUrl(next) || !next.startsWith("https://")) {
      setError("请填写 https:// 开头的外链");
      return;
    }
    onLink(next);
    closeDialog();
  }

  return (
    <div className="admin-media-insert">
      <button
        aria-haspopup="dialog"
        className="admin-toolbar-button"
        disabled={busy}
        onClick={() => {
          setOpen(true);
          setLinkMode(false);
          setLibraryMode(false);
          setError("");
        }}
        title={`插入${label}`}
        type="button"
      >
        {busy ? "…" : label}
      </button>
      <AdminDialog
        onClose={closeDialog}
        open={open}
        title={`插入${label}`}
        wide={libraryMode}
      >
        <p className="admin-dialog__lead">
          从本地上传、从媒体库导入，或填入 https 外链。插入后可在正文里拖到其他位置。
        </p>
        <div className="admin-media-dialog__actions is-triple">
          <button
            className="admin-btn"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {busy ? "上传中…" : `从本地上传${label}`}
          </button>
          <button
            className="admin-btn admin-btn--ghost"
            disabled={busy}
            onClick={() => {
              setLibraryMode(true);
              setLinkMode(false);
              setError("");
            }}
            type="button"
          >
            从媒体库导入
          </button>
          <button
            className="admin-btn admin-btn--ghost"
            disabled={busy}
            onClick={() => {
              setLinkMode(true);
              setLibraryMode(false);
              setError("");
            }}
            type="button"
          >
            使用外链
          </button>
        </div>
        {libraryMode ? (
          <MediaLibraryPicker
            disabled={busy}
            kind={kind}
            onPick={(file) => {
              onPick(file);
              closeDialog();
            }}
          />
        ) : null}
        {linkMode ? (
          <div className="admin-media-insert__link">
            <input
              autoFocus
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitLink();
                }
              }}
              placeholder="https://"
              value={url}
            />
            <button className="admin-btn" onClick={submitLink} type="button">
              插入外链
            </button>
            {error ? <p className="admin-error">{error}</p> : null}
          </div>
        ) : null}
      </AdminDialog>
      <input
        accept={accept}
        hidden
        multiple={multiple}
        onChange={(event) => {
          if (event.target.files?.length) {
            onUpload(event.target.files);
          }
          event.currentTarget.value = "";
          closeDialog();
        }}
        ref={inputRef}
        type="file"
      />
    </div>
  );
}
