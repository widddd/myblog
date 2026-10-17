"use client";

import { useMemo, useState } from "react";

import { AdminDialog } from "@/components/admin/AdminDialog";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { UploadVolumeSelect } from "@/components/admin/UploadVolumeSelect";
import type { AlbumOption } from "@/lib/albums/types";
import type { AdminUploadKind } from "@/lib/client/upload";
import { formatBytes } from "@/lib/uploads/usage-format";

/**
 * 待上传的一项：**预览用的是本机文件**（`URL.createObjectURL`，由调用方在选定文件时就创建好），
 * 不是上传之后的地址——这一条是刻意的：没点「确定上传」之前一个字节都不该发出去。
 */
export type PendingUpload = {
  file: File;
  kind: AdminUploadKind | null;
  /** 图片/视频的本地预览地址；不预览的类型是空串 */
  url: string;
};

/**
 * 媒体库上传的确认框：先看一遍要传什么、选好相册与卷，点确定才真上传。
 * 相册与卷两个下拉都走 `AdminSelect`（**浮层自绘列表**，portal 到 body，不用浏览器自带的 `<select>`）：
 * 原来内联展开，是因为弹窗面板 `.admin-dialog__panel` 是 `overflow: auto`；
 * 浮层不受任何祖先 overflow / 层级影响，展开时也不会把弹窗内容顶下去。
 *
 * 卷只在选中相册后才出现（不变量：卷必须属于照片所在的相册）；
 * **换相册 = 卷重置为「暂不分类」**，选「不加入相册」时卷必然是 null。
 */
export function UploadPreviewDialog({
  albums,
  items,
  onCancel,
  onConfirm,
  open,
}: {
  albums: AlbumOption[];
  items: PendingUpload[];
  onCancel: () => void;
  onConfirm: (albumId: number | null, volumeId: number | null) => void;
  open: boolean;
}) {
  const [albumId, setAlbumId] = useState<number | null>(null);
  const [volumeId, setVolumeId] = useState<number | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  /**
   * ⚠️ **不要在这里 revoke `item.url`**。blob 地址由调用方（`UploadsToolbar` 的 `toPending()`）
   * 在选定文件时创建，也由调用方在「取消 / 上传完成」时回收——**谁创建谁回收**。
   * 曾经这里写过 `useEffect(() => () => items.forEach(...revokeObjectURL), [items])`，
   * 后果：调用方为了复位选择状态按「这一批文件」给弹窗 `key`，重挂载 + React 开发模式的
   * 「挂载 → 清理 → 再挂载」会**在首屏就把 blob 撤销**，预览图整片加载不出来（自然宽高 0）。
   *
   * 选择状态（相册 / 卷 / 已移除项）也**不在这里复位**：由调用方按批 `key` 重挂载，状态自然全新；
   * 在 effect 里 setState 复位会触发级联渲染（eslint 也会报 react-hooks/set-state-in-effect）。
   */

  const kept = items.filter((item) => !removed.has(keyOf(item)));
  const images = kept.filter((item) => item.kind === "image");
  const selected = albums.find((album) => album.id === albumId) ?? null;
  const albumOptions = useMemo(
    () => [
      { value: null, label: "不加入相册" },
      ...albums.map((album) => ({ value: album.id, label: album.title })),
    ],
    [albums],
  );

  /** 换相册时卷必须回到「暂不分类」：旧卷不属于新相册（不变量）。 */
  function pickAlbum(next: number | null) {
    setAlbumId(next);
    setVolumeId(null);
  }

  function toggleRemoved(item: PendingUpload) {
    setRemoved((current) => {
      const next = new Set(current);
      const key = keyOf(item);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <AdminDialog onClose={onCancel} open={open} title="上传预览" wide>
      <p className="admin-dialog__lead">
        这里显示的是<strong>本机文件</strong>（还没有上传）。确认无误后点「确定上传」；
        超过 10MB 的图片会先问你要不要压缩。
      </p>

      {kept.length === 0 ? (
        <p className="admin-muted">没有要上传的文件了。</p>
      ) : (
        <ul className="admin-upload-list">
          {kept.map((item) => (
            <li className="admin-upload-item" key={keyOf(item)}>
              <span className="admin-upload-item__preview">
                {item.kind === "image" && item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={item.url} />
                ) : item.kind === "video" && item.url ? (
                  <video muted playsInline src={item.url} />
                ) : (
                  <span aria-hidden className="admin-upload-item__glyph">
                    {item.kind === "audio" ? "♪" : "▶"}
                  </span>
                )}
              </span>
              <span className="admin-upload-item__main">
                <strong title={item.file.name}>{item.file.name}</strong>
                <span className="admin-muted">
                  {formatBytes(item.file.size)}
                  {item.kind === "image" ? "" : item.kind === "video" ? " · 视频" : " · 音频"}
                </span>
              </span>
              <button
                aria-label={`移除 ${item.file.name}`}
                className="admin-btn admin-btn--ghost admin-btn--sm"
                onClick={() => toggleRemoved(item)}
                type="button"
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="admin-upload-album">
        <AdminSelect
          ariaLabel="加入相册"
          disabled={images.length === 0}
          label="加入相册"
          onChange={(next) => pickAlbum(typeof next === "number" ? next : null)}
          options={albumOptions}
          placeholder="不加入相册"
          value={albumId}
        />
        {images.length === 0 ? (
          <p className="admin-muted">
            本次选中的都是视频 / 音频：相册只收图片，所以不能选相册。
          </p>
        ) : kept.length > images.length ? (
          <p className="admin-muted">
            相册只收图片：本次选的视频 / 音频不会归入相册。
          </p>
        ) : null}
        {/* 卷：选中相册后才出现（卷必须属于该相册）；换相册时 pickAlbum 已把卷重置为「暂不分类」 */}
        {selected && images.length > 0 ? (
          <UploadVolumeSelect
            onChange={setVolumeId}
            value={volumeId}
            volumes={selected.volumes}
          />
        ) : null}
      </div>

      <div className="admin-form-actions">
        <button
          className="admin-btn"
          disabled={kept.length === 0}
          onClick={() =>
            onConfirm(
              images.length > 0 ? albumId : null,
              // 没选相册时卷必然为 null（不变量：卷必须属于相册）
              images.length > 0 && albumId ? volumeId : null,
            )
          }
          type="button"
        >
          确定上传（{kept.length} 个）
        </button>
        <button className="admin-btn admin-btn--ghost" onClick={onCancel} type="button">
          取消
        </button>
      </div>
    </AdminDialog>
  );
}

function keyOf(item: PendingUpload) {
  return `${item.file.name}:${item.file.size}:${item.file.lastModified}`;
}
