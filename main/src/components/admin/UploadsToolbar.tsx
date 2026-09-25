"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { adminJson } from "@/lib/client/admin";
import { guessUploadKind, uploadAdminFile } from "@/lib/client/upload";
import { useAdminConfirm } from "@/components/admin/useAdminConfirm";

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

const MEDIA_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.aac,.ogg,.opus,.wav,.weba";

export function UploadsToolbar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"thumbs" | "thumbs2" | "migrate" | "upload" | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{
    name: string;
    index: number;
    total: number;
    percent: number;
  } | null>(null);
  const { confirm, dialog } = useAdminConfirm();

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

  async function uploadFiles(list: FileList) {
    const files = Array.from(list);
    if (files.length === 0 || busy) {
      return;
    }
    setBusy("upload");
    setError("");
    setMessage("");
    let done = 0;
    try {
      for (const [index, file] of files.entries()) {
        const kind = guessUploadKind(file);
        if (!kind) {
          throw new Error(`不支持的文件：${file.name}`);
        }
        setProgress({
          name: file.name,
          index,
          total: files.length,
          percent: 0,
        });
        await uploadAdminFile(file, kind, (percent) => {
          setProgress({
            name: file.name,
            index,
            total: files.length,
            percent,
          });
        });
        done += 1;
      }
      setMessage(`已上传 ${done} 个文件。`);
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
          if (event.target.files?.length) {
            void uploadFiles(event.target.files);
          }
          event.currentTarget.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <button
        className="admin-btn"
        disabled={busy !== null}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {busy === "upload" ? "上传中…" : "上传图片 / 视频 / 音频"}
      </button>
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
      {dialog}
    </div>
  );
}
