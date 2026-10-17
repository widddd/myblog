"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { adminJson } from "@/lib/client/admin";
import { guessUploadKind, uploadAdminFile } from "@/lib/client/upload";
import type { AlbumOption } from "@/lib/albums/types";
import { MEDIA_UPLOAD_MIME_TYPES } from "@/lib/upload/limits";
import { useAdminConfirm } from "@/components/admin/useAdminConfirm";
import {
  UploadPreviewDialog,
  type PendingUpload,
} from "@/components/admin/UploadPreviewDialog";

type RegenResponse = {
  data: { total: number; updated: number; failed: number; thumbMaxPx: number };
};

type RegenThumb2Response = {
  data: { total: number; updated: number; failed: number; thumb2MaxPx: number };
};

type MigrateResponse = {
  data: {
    total: number;
    uploaded: number;
    skipped: number;
    updated: number;
    failed: number;
  };
};

/**
 * 「相册视图」的 accept：**只含图片 + 视频，不含音频**。
 *
 * 这是站点与 Android 宿主之间的契约（`MainActivity` 按 accept 判定弹不弹自有相册）：
 * 一旦混进 audio，就会被判成混合媒体、退回系统选择器 —— 见 docs/moment-video-spec.md。
 */
const ALBUM_MEDIA_ACCEPT = MEDIA_UPLOAD_MIME_TYPES.join(",");

const MEDIA_ACCEPT = `${ALBUM_MEDIA_ACCEPT},audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.aac,.ogg,.opus,.wav,.weba`;

/** 选定文件时就建好本机预览地址（图片/视频），**上传前**先让站长看一遍。 */
function toPending(files: File[]): PendingUpload[] {
  return files.map((file) => {
    const kind = guessUploadKind(file);
    const previewable = kind === "image" || kind === "video";
    return { file, kind, url: previewable ? URL.createObjectURL(file) : "" };
  });
}

export function UploadsToolbar({
  albums,
  appMode = false,
}: {
  /** 上传预览里的「加入相册 / 归入卷」选项（服务端取一次传进来；形状见 lib/albums/types.ts 的 `AlbumOption`） */
  albums: AlbumOption[];
  /**
   * 这一发请求来自 SmartBlog App（服务端按 UA 判定，见 `lib/client/detect.ts`）。
   * true 时「上传」变成两项下拉：**相册视图**（图片/视频，走 App 自带相册，视频会自动压缩）与
   * **文件视图**（图片/视频/音频，走系统选择器）；浏览器里保持现状（点了直接开文件对话框）。
   * 判定只做一次、由服务端下发，客户端不再写一遍 UA includes（见 docs/moment-video-spec.md）。
   */
  appMode?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<"thumbs" | "thumbs2" | "migrate" | "upload" | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [progress, setProgress] = useState<{
    name: string;
    index: number;
    total: number;
    percent: number;
  } | null>(null);
  const { confirm, dialog } = useAdminConfirm();

  function discardPending() {
    setPending((current) => {
      for (const item of current) {
        if (item.url) {
          URL.revokeObjectURL(item.url);
        }
      }
      return [];
    });
  }

  /**
   * blob 地址由**这里**创建（`toPending()`），所以也由这里兜底回收：只在组件卸载时清一次。
   * 注意两点：
   * 1. **不依赖 `pending`** —— 依赖它就会在每次文件变化时触发清理，把刚建的 blob 撤销掉（预览图立刻变空图）；
   * 2. 镜像最新一批用「effect 里写 ref」的写法 —— 在渲染期间直接 `pendingRef.current = pending`
   *    会触发 `react-hooks/refs`，且不符合 React 规则。
   */
  const pendingRef = useRef<PendingUpload[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(
    () => () => {
      for (const item of pendingRef.current) {
        if (item.url) {
          URL.revokeObjectURL(item.url);
        }
      }
    },
    [],
  );

  // App 里的两项下拉：点外面 / Esc 关掉。开关只影响这个浮层，不碰上传链路。
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /**
   * 打开文件选择器：accept 由这一次的入口决定。
   * 直接写 DOM 的 `accept`（input 是非受控的、只在这里被点开），不必为它走一遍 state/重渲染。
   */
  function openPicker(accept: string) {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.accept = accept;
    input.click();
  }

  async function regenerate() {
    if (
      !(await confirm(
        "按当前设置里的缩略图尺寸，重新生成全部图片的本地缩略图？原图不会改。",
      ))
    ) {
      return;
    }
    setBusy("thumbs");
    setError("");
    setMessage("");
    try {
      const payload = await adminJson<RegenResponse>(
        "/api/admin/uploads/thumbs/regenerate",
        { method: "POST" },
      );
      setMessage(
        `已处理 ${payload.data.total} 张，成功 ${payload.data.updated}，失败 ${payload.data.failed}（最长边 ${payload.data.thumbMaxPx}px）。`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重新生成失败");
    } finally {
      setBusy(null);
    }
  }

  async function regenerateThumb2() {
    if (
      !(await confirm(
        "按当前设置里的二级缩略图尺寸，删除并重新生成全部二级缩略图？只动本机，不上云，原图和一级缩略图不会改。",
      ))
    ) {
      return;
    }
    setBusy("thumbs2");
    setError("");
    setMessage("");
    try {
      const payload = await adminJson<RegenThumb2Response>(
        "/api/admin/uploads/thumbs2/regenerate",
        { method: "POST" },
      );
      setMessage(
        `二级缩略图已处理 ${payload.data.total} 张，成功 ${payload.data.updated}，失败 ${payload.data.failed}（最长边 ${payload.data.thumb2MaxPx}px）。`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重新生成二级缩略图失败");
    } finally {
      setBusy(null);
    }
  }

  async function migrate() {
    if (
      !(await confirm(
        "把尚未上云的原图、视频、音频传到腾讯云 COS。桶里已有的会跳过，不会重复上传。本地缩略图不动。",
      ))
    ) {
      return;
    }
    setBusy("migrate");
    setError("");
    setMessage("");
    try {
      const payload = await adminJson<MigrateResponse>(
        "/api/admin/uploads/migrate",
        { method: "POST" },
      );
      setMessage(
        `共 ${payload.data.total} 个：新上传 ${payload.data.uploaded}，已在 COS 跳过 ${payload.data.skipped}，补登记 ${payload.data.updated}，失败 ${payload.data.failed}。`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "迁移失败");
    } finally {
      setBusy(null);
    }
  }

  /**
   * 预览里点了「确定上传」才真发请求；相册 / 卷归属跟着每个请求一起提交（只对图片生效）。
   * 卷必须挂在相册上：没选相册时不发 `volumeId`（服务端也拒，见 lib/upload/handle.ts）。
   */
  async function uploadPending(albumId: number | null, volumeId: number | null) {
    const items = pending;
    discardPending();
    if (items.length === 0 || busy) {
      return;
    }
    setBusy("upload");
    setError("");
    setMessage("");
    let done = 0;
    try {
      for (const [index, item] of items.entries()) {
        if (!item.kind) {
          throw new Error(`不支持的文件：${item.file.name}`);
        }
        setProgress({
          name: item.file.name,
          index,
          total: items.length,
          percent: 0,
        });
        await uploadAdminFile(
          item.file,
          item.kind,
          (percent) => {
            setProgress({
              name: item.file.name,
              index,
              total: items.length,
              percent,
            });
          },
          {
            albumId: item.kind === "image" && albumId ? albumId : undefined,
            volumeId:
              item.kind === "image" && albumId && volumeId ? volumeId : undefined,
          },
        );
        done += 1;
      }
      const volumeTitle = albumId
        ? (albums
            .find((album) => album.id === albumId)
            ?.volumes.find((volume) => volume.id === volumeId)?.title ?? "")
        : "";
      setMessage(
        albumId
          ? volumeTitle
            ? `已上传 ${done} 个文件，图片已加入所选相册的「${volumeTitle}」。`
            : `已上传 ${done} 个文件，图片已加入所选相册。`
          : `已上传 ${done} 个文件。`,
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? done > 0
            ? `${caught.message}（已上传 ${done} 个）`
            : caught.message
          : "上传失败",
      );
      if (done > 0) {
        router.refresh();
      }
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  return (
    <div className="admin-form-actions">
      <input
        accept={MEDIA_ACCEPT}
        hidden
        multiple
        onChange={(event) => {
          const picked = event.target.files ? Array.from(event.target.files) : [];
          if (picked.length > 0) {
            // 先预览再上传：这里**不**发请求
            setPending(toPending(picked));
            setError("");
            setMessage("");
          }
          event.currentTarget.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <div className="admin-upload-menu" ref={menuRef}>
        <button
          aria-expanded={appMode ? menuOpen : undefined}
          aria-haspopup={appMode ? "menu" : undefined}
          className="admin-btn"
          disabled={busy !== null}
          onClick={() => {
            if (appMode) {
              setMenuOpen((current) => !current);
              return;
            }
            openPicker(MEDIA_ACCEPT);
          }}
          type="button"
        >
          {busy === "upload"
            ? "上传中…"
            : appMode
              ? "上传 ▾"
              : "上传图片 / 视频 / 音频"}
        </button>
        {appMode && menuOpen ? (
          <div className="admin-upload-menu__panel" role="menu">
            <button
              className="admin-upload-menu__item"
              onClick={() => {
                setMenuOpen(false);
                openPicker(ALBUM_MEDIA_ACCEPT);
              }}
              role="menuitem"
              type="button"
            >
              <strong>相册视图（图片 / 视频）</strong>
              <span>用 App 自带相册选，视频超阈值会自动压缩</span>
            </button>
            <button
              className="admin-upload-menu__item"
              onClick={() => {
                setMenuOpen(false);
                openPicker(MEDIA_ACCEPT);
              }}
              role="menuitem"
              type="button"
            >
              <strong>文件视图（图片 / 视频 / 音频）</strong>
              <span>用系统文件选择器，可以选音频</span>
            </button>
          </div>
        ) : null}
      </div>
      <button
        className="admin-btn admin-btn--ghost"
        disabled={busy !== null}
        onClick={() => void regenerate()}
        type="button"
      >
        {busy === "thumbs" ? "生成中…" : "重新生成缩略图"}
      </button>
      <button
        className="admin-btn admin-btn--ghost"
        disabled={busy !== null}
        onClick={() => void regenerateThumb2()}
        type="button"
      >
        {busy === "thumbs2" ? "生成中…" : "重新生成二级缩略图"}
      </button>
      <button
        className="admin-btn admin-btn--ghost"
        disabled={busy !== null}
        onClick={() => void migrate()}
        type="button"
      >
        {busy === "migrate" ? "迁移中…" : "迁移到 COS"}
      </button>
      {progress ? (
        <div className="admin-upload-progress">
          <p className="admin-muted">
            {progress.name}（{progress.index + 1}/{progress.total}）{progress.percent}%
          </p>
          <div aria-hidden className="admin-usage__bar">
            <span style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      ) : null}
      {message ? <p className="admin-muted">{message}</p> : null}
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      <UploadPreviewDialog
        albums={albums}
        items={pending}
        // 换一批文件就换 key → 弹窗重挂载，里面选的相册 / 卷 / 已移除项全部归零
        // （`pending` 在关闭与开始上传时都会清空，所以每批之间必然经过一次空值）
        key={
          pending.length === 0
            ? "closed"
            : pending
                .map(
                  (item) =>
                    `${item.file.name}:${item.file.size}:${item.file.lastModified}`,
                )
                .join("|")
        }
        onCancel={discardPending}
        onConfirm={(albumId, volumeId) => void uploadPending(albumId, volumeId)}
        open={pending.length > 0}
      />
      {dialog}
    </div>
  );
}
