"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { adminJson } from "@/lib/client/admin";
import type { AdminUploadResult } from "@/lib/client/upload";
import { formatBytes } from "@/lib/uploads/usage-format";
import { formatClockDuration, formatDateTime } from "@/lib/utils/date";

type InspectPayload = {
  data: {
    file: AdminUploadResult;
    locations: Array<{
      place: "local" | "cos";
      role: "original" | "thumb" | "thumb2" | "content";
      key: string;
      url: string;
      size: number | null;
    }>;
    references: {
      posts: Array<{ id: number; title: string }>;
      moments: Array<{ id: number }>;
    };
  };
};

function subscribeNoop() {
  return () => {};
}

function roleLabel(
  role: InspectPayload["data"]["locations"][number]["role"],
  kind: AdminUploadResult["kind"],
) {
  if (role === "thumb") {
    return "一级缩略图";
  }
  if (role === "thumb2") {
    return "二级缩略图";
  }
  if (role === "content") {
    return "正文图";
  }
  if (kind === "video") {
    return "原视频";
  }
  if (kind === "audio") {
    return "原音频";
  }
  return "原图";
}

function referenceWarning(refs: InspectPayload["data"]["references"]) {
  if (refs.posts.length === 0 && refs.moments.length === 0) {
    return "";
  }
  const titles = refs.posts.map((post) => post.title).filter(Boolean);
  const parts = [];
  if (refs.posts.length > 0) {
    parts.push(`${refs.posts.length} 篇文章${titles.length ? `（${titles.join("、")}）` : ""}`);
  }
  if (refs.moments.length > 0) {
    parts.push(`${refs.moments.length} 条瞬间`);
  }
  return `这篇媒体还被 ${parts.join("、")} 引用。删掉后正文或封面可能打不开。`;
}

function AudioFace({
  duration,
  url,
}: {
  duration: number | null;
  url: string;
}) {
  const [seconds, setSeconds] = useState(duration);

  useEffect(() => {
    if (seconds != null || !url) {
      return;
    }
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) {
        setSeconds(audio.duration);
      }
    };
    audio.src = url;
    return () => {
      audio.src = "";
    };
  }, [seconds, url]);

  return (
    <div className="admin-media-card__audio">
      <span aria-hidden className="admin-media-card__note">
        ♪
      </span>
      <span>
        {seconds != null ? formatClockDuration(seconds) : "音频"}
      </span>
    </div>
  );
}

export function UploadCard({ file }: { file: AdminUploadResult }) {
  const router = useRouter();
  const titleId = useId();
  const deleteRef = useRef<HTMLButtonElement>(null);
  const menuBoxRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const [inspect, setInspect] = useState<InspectPayload["data"] | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadInspect() {
    const payload = await adminJson<InspectPayload>(`/api/admin/uploads/${file.id}`);
    setInspect(payload.data);
    return payload.data;
  }

  async function openInspect() {
    setError("");
    setBusy(true);
    try {
      await loadInspect();
      setInspectOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取失败");
    } finally {
      setBusy(false);
    }
  }

  async function openDeleteMenu() {
    setError("");
    const button = deleteRef.current?.getBoundingClientRect();
    setMenu({
      top: (button?.bottom ?? 0) + 6,
      left: button?.left ?? 0,
    });
    try {
      await loadInspect();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取失败");
      setMenu(null);
    }
  }

  async function runDelete(keepCos: boolean) {
    const refs = inspect?.references ?? { posts: [], moments: [] };
    const warning = referenceWarning(refs);
    const action = keepCos
      ? "只删本机原图和一/二级缩略图，COS 上的文件会留下，媒体库记录也还在。"
      : "将同时删除本机原图、一级缩略图、二级缩略图，以及 COS 上的对应文件。删除后无法恢复。";
    const message = warning
      ? `${warning}\n\n${action}\n仍要继续？`
      : `${action}\n确定删除？`;
    if (!window.confirm(message) || busy) {
      return;
    }
    setBusy(true);
    setMenu(null);
    try {
      await adminJson(`/api/admin/uploads/${file.id}`, {
        method: "DELETE",
        body: JSON.stringify({ keepCos }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!menu) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
      }
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node | null;
      if (
        deleteRef.current?.contains(target) ||
        menuBoxRef.current?.contains(target)
      ) {
        return;
      }
      setMenu(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [menu]);

  const preview =
    file.kind === "image" && (file.thumb?.url || file.original.url) ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt="" src={file.thumb?.url ?? file.original.url} />
    ) : file.kind === "audio" ? (
      <AudioFace duration={file.duration} url={file.original.url} />
    ) : (
      <div className="admin-media-card__audio">
        <span aria-hidden>▶</span>
        <span>视频</span>
      </div>
    );

  return (
    <li className="admin-media-card">
      <div className="admin-media-card__preview">{preview}</div>
      <p className="admin-muted">{formatBytes(file.size)}</p>
      <p className="admin-muted">{formatDateTime(file.createdAt)}</p>
      <div className="admin-media-card__actions">
        <button
          className="admin-link-button"
          disabled={busy}
          onClick={() => void openInspect()}
          type="button"
        >
          查看
        </button>
        <button
          className="admin-link-button"
          disabled={busy}
          onClick={() => void openDeleteMenu()}
          ref={deleteRef}
          type="button"
        >
          {busy ? "处理中…" : "删除"}
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {mounted && menu
        ? createPortal(
            <div
              className="admin-media-menu"
              ref={menuBoxRef}
              role="menu"
              style={{ top: menu.top, left: menu.left }}
            >
              {inspect && referenceWarning(inspect.references) ? (
                <p className="admin-danger admin-media-menu__warn">
                  {referenceWarning(inspect.references)}
                </p>
              ) : null}
              <button
                onClick={() => void runDelete(false)}
                role="menuitem"
                type="button"
              >
                删除本地和云端
              </button>
              <button
                onClick={() => void runDelete(true)}
                role="menuitem"
                type="button"
              >
                仅删除本地（保留 COS）
              </button>
            </div>,
            document.body,
          )
        : null}
      {mounted && inspectOpen && inspect
        ? createPortal(
            <div className="admin-media-dialog">
              <button
                aria-label="关闭"
                className="admin-media-dialog__backdrop"
                onClick={() => setInspectOpen(false)}
                type="button"
              />
              <div
                aria-labelledby={titleId}
                aria-modal="true"
                className="admin-media-dialog__panel is-wide"
                role="dialog"
              >
                <h3 id={titleId}>存储路径</h3>
                <p className="admin-media-dialog__lead">
                  {formatDateTime(inspect.file.createdAt)} · {formatBytes(inspect.file.size)}
                </p>
                <ul className="admin-media-paths">
                  {inspect.locations.map((location) => (
                    <li key={`${location.place}-${location.role}-${location.key}`}>
                      <strong>
                        {location.place === "local" ? "本地" : "腾讯云 COS"} ·{" "}
                        {roleLabel(location.role, inspect.file.kind)}
                      </strong>
                      <code>{location.key}</code>
                      <span className="admin-media-paths__url">
                        <a href={location.url} rel="noreferrer" target="_blank">
                          {location.url}
                        </a>
                        <span>
                          {location.size == null ? "不存在" : formatBytes(location.size)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  className="admin-media-dialog__cancel"
                  onClick={() => setInspectOpen(false)}
                  type="button"
                >
                  关闭
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </li>
  );
}
