"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { isSafeMediaUrl } from "@/lib/media/url";

function subscribeNoop() {
  return () => {};
}

type MediaInsertMenuProps = {
  label: string;
  accept: string;
  multiple?: boolean;
  busy?: boolean;
  onUpload: (files: FileList) => void;
  onLink: (url: string) => void;
};

export function MediaInsertMenu({
  label,
  accept,
  multiple = true,
  busy = false,
  onUpload,
  onLink,
}: MediaInsertMenuProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDialog();
      }
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeDialog() {
    setOpen(false);
    setLinkMode(false);
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

  const dialog =
    mounted && open
      ? createPortal(
          <div className="admin-media-dialog">
            <button
              aria-label="关闭"
              className="admin-media-dialog__backdrop"
              onClick={closeDialog}
              type="button"
            />
            <div
              aria-labelledby={titleId}
              aria-modal="true"
              className="admin-media-dialog__panel"
              role="dialog"
            >
              <h3 id={titleId}>插入{label}</h3>
              <p className="admin-media-dialog__lead">
                从本地上传，或填入 https 外链，插入后可在正文里拖到其他位置。
              </p>
              <div className="admin-media-dialog__actions">
                <button
                  className="heo-button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  type="button"
                >
                  {busy ? "上传中…" : `从本地上传${label}`}
                </button>
                <button
                  className="heo-button heo-button--ghost"
                  disabled={busy}
                  onClick={() => {
                    setLinkMode(true);
                    setError("");
                  }}
                  type="button"
                >
                  使用外链
                </button>
              </div>
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
                  <button className="heo-button" onClick={submitLink} type="button">
                    插入外链
                  </button>
                  {error ? <p>{error}</p> : null}
                </div>
              ) : null}
              <button
                className="admin-media-dialog__cancel"
                onClick={closeDialog}
                type="button"
              >
                取消
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="admin-media-insert">
      <button
        aria-haspopup="dialog"
        className="admin-toolbar-button"
        disabled={busy}
        onClick={() => {
          setOpen(true);
          setLinkMode(false);
          setError("");
        }}
        title={`插入${label}`}
        type="button"
      >
        {busy ? "…" : label}
      </button>
      {dialog}
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
