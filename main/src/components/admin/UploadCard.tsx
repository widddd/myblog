"use client";

import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminDialog } from "@/components/admin/AdminDialog";
import { UploadAlbumSelect } from "@/components/admin/UploadAlbumSelect";
import { useAdminConfirm } from "@/components/admin/useAdminConfirm";
import { adminJson } from "@/lib/client/admin";
import type { AlbumOption } from "@/lib/albums/types";
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
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

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

  /**
   * 音频在媒体库里**要能听**（图片有预览、视频有 ▶，音频只有个 ♪ 说不过去）。
   * 这里只挂一个极简播放键：卡片是网格里的一格，塞 `<audio controls>` 那套原生控件会撑爆版式。
   */
  return (
    <div className="admin-media-card__audio">
      <button
        aria-label={playing ? "暂停音频" : "播放音频"}
        className="admin-media-card__play"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) {
            return;
          }
          if (audio.paused) {
            void audio.play().catch(() => undefined);
          } else {
            audio.pause();
          }
        }}
        type="button"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span>
        {seconds != null ? formatClockDuration(seconds) : "音频"}
      </span>
      <audio
        hidden
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        preload="metadata"
        ref={audioRef}
        src={url}
      />
    </div>
  );
}

export function UploadCard({
  file,
  index = 0,
  albums = [],
}: {
  file: AdminUploadResult;
  index?: number;
  /** 「相册 + 卷」下拉的选项（只有图片会渲染它；服务端取一次，别每张卡各查一遍） */
  albums?: AlbumOption[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useAdminConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
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
    setMenuOpen(true);
    try {
      await loadInspect();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取失败");
      setMenuOpen(false);
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
    setMenuOpen(false);
    if (!(await confirm(message)) || busy) {
      return;
    }
    setBusy(true);
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
    <li
      className="admin-media-card admin-stagger"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="admin-media-card__preview">{preview}</div>
      {file.kind === "image" ? (
        <UploadAlbumSelect albums={albums} file={file} />
      ) : null}
      <p className="admin-muted">{formatBytes(file.size)}</p>
      <p className="admin-muted">{formatDateTime(file.createdAt)}</p>
      <div className="admin-media-card__actions">
        <button
          className="admin-btn admin-btn--link"
          disabled={busy}
          onClick={() => void openInspect()}
          type="button"
        >
          查看
        </button>
        <button
          className="admin-btn admin-btn--link"
          disabled={busy}
          onClick={() => void openDeleteMenu()}
          type="button"
        >
          {busy ? "处理中…" : "删除"}
        </button>
      </div>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      <AdminDialog
        onClose={() => setMenuOpen(false)}
        open={menuOpen}
        title="删除文件"
      >
        {inspect && referenceWarning(inspect.references) ? (
          <p className="admin-danger">{referenceWarning(inspect.references)}</p>
        ) : null}
        <div className="admin-btn-row">
          <button
            className="admin-btn admin-btn--danger"
            onClick={() => void runDelete(false)}
            type="button"
          >
            删除本地和云端
          </button>
          <button
            className="admin-btn admin-btn--ghost"
            onClick={() => void runDelete(true)}
            type="button"
          >
            仅删除本地（保留 COS）
          </button>
        </div>
      </AdminDialog>
      <AdminDialog
        onClose={() => setInspectOpen(false)}
        open={inspectOpen && Boolean(inspect)}
        title="存储路径"
        wide
      >
        {inspect ? (
          <>
            <p className="admin-dialog__lead">
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
          </>
        ) : null}
      </AdminDialog>
      {dialog}
    </li>
  );
}
