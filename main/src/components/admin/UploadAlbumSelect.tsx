"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AdminSelect } from "@/components/admin/AdminSelect";
import { UploadVolumeSelect } from "@/components/admin/UploadVolumeSelect";
import type { AlbumOption } from "@/lib/albums/types";
import { adminJson } from "@/lib/client/admin";
import type { AdminUploadResult } from "@/lib/client/upload";

/**
 * 媒体库卡片上的「相册 + 卷」编辑：单张图片改归属（`PATCH /api/admin/uploads/[id]`）。
 * 两个下拉都是 `AdminSelect` 的**浮层自绘下拉**（原来相册是原生 `<select>`、卷是内联展开的列表，
 * 展开时会把卡片下面的内容顶下去）；**选完相册才显示卷**，只有图片会渲染它
 * （视频/音频不进相册，见 docs/albums-spec.md D9）。
 *
 * 不变量：**换相册 = 卷清零**——服务端 `setUploadAlbum()` 会把 `volumeId` 一起写成 null，
 * 所以这里改完相册也要把本地卷值同步清空，别让界面上留着一个已经不属于该相册的卷。
 */
export function UploadAlbumSelect({
  albums,
  file,
}: {
  /** 「相册 + 它的卷」选项（服务端一次取好，见 lib/albums/types.ts 的 `AlbumOption`） */
  albums: AlbumOption[];
  file: AdminUploadResult;
}) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(file.album?.id ?? null);
  const [volumeId, setVolumeId] = useState<number | null>(file.volumeId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 用本地（乐观）值推当前相册：刚好切换的那一瞬间也要跟着换卷列表
  const volumes = albums.find((album) => album.id === value)?.volumes ?? [];
  const albumOptions = useMemo(
    () => [
      { value: null, label: "未分类" },
      ...albums.map((album) => ({ value: album.id, label: album.title })),
    ],
    [albums],
  );

  async function changeAlbum(next: number | null) {
    const previous = value;
    setValue(next);
    setBusy(true);
    setError("");
    try {
      await adminJson(`/api/admin/uploads/${file.id}`, {
        method: "PATCH",
        body: JSON.stringify({ albumId: next }),
      });
      // 服务端换相册时会把卷清零，本地同步（不变量）
      setVolumeId(null);
      router.refresh();
    } catch (caught) {
      setValue(previous);
      setError(caught instanceof Error ? caught.message : "设置相册失败");
    } finally {
      setBusy(false);
    }
  }

  async function changeVolume(next: number | null) {
    const previous = volumeId;
    setVolumeId(next);
    setBusy(true);
    setError("");
    try {
      await adminJson(`/api/admin/uploads/${file.id}`, {
        method: "PATCH",
        body: JSON.stringify({ volumeId: next }),
      });
      router.refresh();
    } catch (caught) {
      setVolumeId(previous);
      setError(caught instanceof Error ? caught.message : "设置卷失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-album-select">
      <AdminSelect
        ariaLabel="相册"
        disabled={busy}
        label="相册"
        onChange={(next) => void changeAlbum(typeof next === "number" ? next : null)}
        options={albumOptions}
        placeholder="未分类"
        value={value}
      />
      {/* 选完相册才显示卷；这个相册还没建卷时，下拉里只有「暂不分类」一项 */}
      {value !== null ? (
        <UploadVolumeSelect
          disabled={busy}
          label="卷"
          onChange={(next) => void changeVolume(next)}
          value={volumeId}
          volumes={volumes}
        />
      ) : null}
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
