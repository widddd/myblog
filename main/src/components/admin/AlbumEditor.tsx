"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { AdminDialog } from "@/components/admin/AdminDialog";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AlbumVolumePanel } from "@/components/admin/AlbumVolumePanel";
import { MediaLibraryPicker } from "@/components/admin/MediaLibraryPicker";
import { useAdminConfirm } from "@/components/admin/useAdminConfirm";
import {
  ALBUM_DESCRIPTION_MAX,
  ALBUM_SLUG_MAX,
  ALBUM_SORT_MAX,
  ALBUM_TITLE_MAX,
} from "@/lib/albums/slug";
import type { AdminAlbumView, AdminAlbumVolumeView } from "@/lib/albums/types";
import { adminJson } from "@/lib/client/admin";
import type { AdminUploadResult } from "@/lib/client/upload";
import { formatBytes } from "@/lib/uploads/usage-format";
import { formatDateTime } from "@/lib/utils/date";

/**
 * 后台相册详情：基本信息（标题 / 地址名 / 说明 / 排序 / 开关）+ 封面 + 照片管理 + 卷。
 * 照片的两条路都在这儿：**从媒体库批量加入**（一次几十张的主力路径）、单张移出 / 设为封面；
 * 卷的增删改排在「卷」区块（`AlbumVolumePanel`），归卷用的是这里勾选出来的那批照片。
 */
export function AlbumEditor({
  album,
  images,
  imagesTruncated,
  volumes,
}: {
  album: AdminAlbumView;
  images: AdminUploadResult[];
  imagesTruncated: boolean;
  volumes: AdminAlbumVolumeView[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useAdminConfirm();
  const [title, setTitle] = useState(album.title);
  const [slug, setSlug] = useState(album.slug);
  const [description, setDescription] = useState(album.description);
  const [sort, setSort] = useState(String(album.sort));
  const [enabled, setEnabled] = useState(album.enabled);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [volumeTarget, setVolumeTarget] = useState("");

  const dirty =
    title !== album.title ||
    slug !== album.slug ||
    description !== album.description ||
    sort !== String(album.sort) ||
    enabled !== album.enabled;

  // 勾选按当前列出的照片过滤：换页 / 刷新后消失的照片不会留在选择里
  const selectedIds = images
    .filter((file) => selected.has(file.id))
    .map((file) => file.id);
  // ── 按卷分组：没有名字的卷（= 不属于任何卷）排在最前，与前台相册页顺序一致 ──────
  const groups = [
    {
      key: "none",
      volumeId: null as number | null,
      title: "",
      files: images.filter(
        (file) => !file.volumeId || !volumes.some((volume) => volume.id === file.volumeId),
      ),
    },
    ...volumes.map((volume) => ({
      key: `v${volume.id}`,
      volumeId: volume.id as number | null,
      title: volume.title,
      files: images.filter((file) => file.volumeId === volume.id),
    })),
  ];

  // ── 拖动换卷：鼠标可以整卡拖；触屏只能抓右上角把手（否则和页面滚动打架）────────
  const dragRef = useRef<{ ids: number[]; x: number; y: number; started: boolean } | null>(null);
  const [drag, setDrag] = useState<{ ids: number[]; x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null | undefined>(undefined);

  /** 命中测试按坐标算（事件被 pointer capture 收在卡片上，不看事件目标）。 */
  function volumeIdFromPoint(x: number, y: number) {
    const hit = document.elementFromPoint(x, y)?.closest("[data-volume-drop]");
    const raw = hit?.getAttribute("data-volume-drop") ?? "";
    if (raw === "none") {
      return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  function startDrag(event: React.PointerEvent, ids: number[]) {
    if (busy || ids.length === 0) {
      return;
    }
    const onGrip = Boolean((event.target as HTMLElement).closest(".admin-album-photo__grip"));
    if (event.pointerType !== "mouse" && !onGrip) {
      return;
    }
    dragRef.current = { ids, x: event.clientX, y: event.clientY, started: false };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent) {
    const current = dragRef.current;
    if (!current) {
      return;
    }
    if (!current.started) {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) {
        return;
      }
      current.started = true;
    }
    setDropTarget(volumeIdFromPoint(event.clientX, event.clientY));
    setDrag({ ids: current.ids, x: event.clientX, y: event.clientY });
  }

  function endDrag(event: React.PointerEvent) {
    const current = dragRef.current;
    dragRef.current = null;
    const target = volumeIdFromPoint(event.clientX, event.clientY);
    setDrag(null);
    setDropTarget(undefined);
    if (!current?.started || target === undefined) {
      return; // 没真的拖动 = 普通点击，交给卡片自己的按钮
    }
    const moving = images.filter((file) => current.ids.includes(file.id));
    if (moving.length > 0 && moving.every((file) => (file.volumeId ?? null) === target)) {
      return; // 拖回原来那一组，无需请求
    }
    void moveToVolume(current.ids, target);
  }

  const volumeTitleById = new Map(volumes.map((volume) => [volume.id, volume.title]));

  function toggleSelected(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function saveInfo() {
    setBusy("info");
    setError("");
    setMessage("");
    try {
      await adminJson(`/api/admin/albums/${album.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          description: description.trim(),
          sort: Number.parseInt(sort, 10) || 0,
          enabled,
        }),
      });
      setMessage("已保存");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy("");
    }
  }

  async function setCover(uploadId: number | null) {
    setBusy("cover");
    setError("");
    try {
      await adminJson(`/api/admin/albums/${album.id}`, {
        method: "PATCH",
        body: JSON.stringify({ coverId: uploadId }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设置封面失败");
    } finally {
      setBusy("");
    }
  }

  async function assign(files: AdminUploadResult[]) {
    if (files.length === 0) {
      return;
    }
    const ids = files.map((file) => file.id);
    if (
      !(await confirm(
        `把选中的 ${ids.length} 张照片加入相册「${album.title}」？\n\n图片如果原来在别的相册里，会从那个相册移过来（一张图只能属于一个相册）。`,
      ))
    ) {
      return;
    }
    setBusy("assign");
    setError("");
    setMessage("");
    try {
      const { data } = await adminJson<{
        data: { assigned: number; skipped: number; total: number };
      }>(`/api/admin/albums/${album.id}/uploads`, {
        method: "POST",
        body: JSON.stringify({ uploadIds: ids }),
      });
      setMessage(
        `已加入 ${data.assigned} 张${data.skipped > 0 ? `，跳过 ${data.skipped} 张（非图片或已不存在）` : ""}。`,
      );
      setPicking(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加入相册失败");
    } finally {
      setBusy("");
    }
  }

  /**
   * 把一批照片归到某一卷；`volumeId = null` = 移出卷（回到「不属于任何卷」）。
   * **批量条与拖拽共用这一个函数**，两条路的接口与文案保持一致。
   */
  async function moveToVolume(ids: number[], volumeId: number | null) {
    if (ids.length === 0) {
      return;
    }
    setBusy("volume");
    setError("");
    setMessage("");
    try {
      const { data } = await adminJson<{
        data: { updated: number; skipped: number; total: number };
      }>(`/api/admin/albums/${album.id}/volume-uploads`, {
        method: volumeId === null ? "DELETE" : "POST",
        body:
          volumeId === null
            ? JSON.stringify({ uploadIds: ids })
            : JSON.stringify({ uploadIds: ids, volumeId }),
      });
      const where =
        volumeId === null ? "不属于任何卷" : `「${volumeTitleById.get(volumeId) ?? "该卷"}」`;
      setMessage(
        `已把 ${data.updated} 张归到${where}${data.skipped > 0 ? `，跳过 ${data.skipped} 张（已不在这个相册里）` : ""}。`,
      );
      setSelected(new Set());
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "调整卷失败");
    } finally {
      setBusy("");
    }
  }

  /** 批量条：把勾选的照片放入下拉选中的那一卷。 */
  async function assignVolume() {
    const volumeId = Number.parseInt(volumeTarget, 10);
    if (selectedIds.length === 0 || !Number.isInteger(volumeId)) {
      return;
    }
    await moveToVolume(selectedIds, volumeId);
  }

  /** 批量条：把勾选的照片移出卷（回到「不属于任何卷」，照片不会离开相册）。 */
  async function removeFromVolume() {
    if (selectedIds.length === 0) {
      return;
    }
    await moveToVolume(selectedIds, null);
  }

  async function removeImage(file: AdminUploadResult) {
    if (!(await confirm("把这张照片移出相册？照片本身还在媒体库里（回到「未分类」）。"))) {
      return;
    }
    setBusy(`remove-${file.id}`);
    setError("");
    setMessage("");
    try {
      await adminJson(`/api/admin/albums/${album.id}/uploads`, {
        method: "DELETE",
        body: JSON.stringify({ uploadIds: [file.id] }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "移出失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="admin-album-editor">
      <p className="admin-muted">
        相册对外公开：<code>/albums/{album.slug}</code>。放进相册的图片会在公开相册页可见
        ——即使它只在密码文章里用过。
      </p>

      <div className="admin-album-editor__info">
        <label className="admin-field">
          相册名
          <input
            maxLength={ALBUM_TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </label>
        <label className="admin-field">
          地址名
          <input
            maxLength={ALBUM_SLUG_MAX}
            onChange={(event) => setSlug(event.target.value)}
            value={slug}
          />
        </label>
        <label className="admin-field">
          排序（小的在前）
          <input
            max={ALBUM_SORT_MAX}
            min={0}
            onChange={(event) => setSort(event.target.value)}
            type="number"
            value={sort}
          />
        </label>
        <label className="admin-field admin-field--inline">
          <input
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
          />
          对外公开
        </label>
        <label className="admin-field admin-field--wide">
          说明
          <textarea
            maxLength={ALBUM_DESCRIPTION_MAX}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            value={description}
          />
        </label>
        <div className="admin-form-actions">
          <button
            className="admin-btn"
            disabled={!dirty || busy === "info"}
            onClick={() => void saveInfo()}
            type="button"
          >
            {busy === "info" ? "保存中…" : "保存"}
          </button>
          <Link className="admin-btn admin-btn--ghost" href="/albums">
            看前台
          </Link>
        </div>
      </div>

      <AlbumVolumePanel albumId={album.id} volumes={volumes} />

      <div className="admin-album-editor__photos">
        <div className="admin-album-editor__bar">
          <strong>{album.count} 张照片</strong>
          {album.coverId == null ? null : (
            <button
              className="admin-btn admin-btn--link admin-btn--sm"
              disabled={busy === "cover"}
              onClick={() => void setCover(null)}
              type="button"
            >
              封面改回「第一张」
            </button>
          )}
          <span className="admin-album-row__spacer" />
          <button
            className="admin-btn admin-btn--sm"
            onClick={() => setPicking(true)}
            type="button"
          >
            从媒体库添加
          </button>
        </div>

        {imagesTruncated ? (
          <p className="admin-muted">
            相册照片很多，这里只列出最新的一批；更早的仍在前台相册里。
          </p>
        ) : null}

        {images.length === 0 ? null : (
          <div className="admin-album-editor__bulk">
            <strong>已选 {selectedIds.length} 张</strong>
            <button
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={() => setSelected(new Set(images.map((file) => file.id)))}
              type="button"
            >
              全选列出（{images.length} 张）
            </button>
            <button
              className="admin-btn admin-btn--ghost admin-btn--sm"
              disabled={selectedIds.length === 0}
              onClick={() => setSelected(new Set())}
              type="button"
            >
              清除选择
            </button>
            <span className="admin-album-row__spacer" />
            {/* 放入卷：浮层自绘下拉（原来是原生 <select>），选项带每卷张数 */}
            <AdminSelect
              ariaLabel="要放入的卷"
              className="admin-album-editor__volume-pick"
              disabled={volumes.length === 0 || busy === "volume"}
              onChange={(next) =>
                setVolumeTarget(typeof next === "number" ? String(next) : "")
              }
              options={volumes.map((volume) => ({
                value: volume.id,
                label: volume.title,
                hint: `${volume.count} 张`,
              }))}
              placeholder={volumes.length === 0 ? "还没有卷" : "选择要放入的卷…"}
              value={volumeTarget === "" ? null : Number.parseInt(volumeTarget, 10)}
            />
            <button
              className="admin-btn admin-btn--sm"
              disabled={selectedIds.length === 0 || !volumeTarget || busy === "volume"}
              onClick={() => void assignVolume()}
              type="button"
            >
              {busy === "volume" ? "处理中…" : "放入卷"}
            </button>
            <button
              className="admin-btn admin-btn--ghost admin-btn--sm"
              disabled={selectedIds.length === 0 || busy === "volume"}
              onClick={() => void removeFromVolume()}
              type="button"
            >
              移出卷
            </button>
          </div>
        )}

        {drag ? (
          <span className="admin-album-drag-ghost" style={{ left: drag.x, top: drag.y }}>
            移动 {drag.ids.length} 张
          </span>
        ) : null}

        {images.length === 0 ? (
          <p className="admin-muted">
            相册里还没有照片。点「从媒体库添加」一次选多张；
            也可以在「媒体库」里用每张图下面的「相册」下拉单张归册。
          </p>
        ) : (
          <ul className="admin-album-photos">
            {groups.flatMap((group) => [
              <li
                className={
                  dropTarget === group.volumeId
                    ? "admin-album-group__head is-drop-target"
                    : "admin-album-group__head"
                }
                data-volume-drop={group.volumeId === null ? "none" : String(group.volumeId)}
                key={`head-${group.key}`}
              >
                <strong>{group.title || "不属于任何卷"}</strong>
                <span className="admin-muted">
                  {group.files.length} 张
                  {group.volumeId === null ? "（前台排在最前，只显示张数）" : ""}
                </span>
              </li>,
              group.files.length === 0 ? (
                <li
                  className={
                    dropTarget === group.volumeId
                      ? "admin-album-group__empty is-drop-target"
                      : "admin-album-group__empty"
                  }
                  data-volume-drop={group.volumeId === null ? "none" : String(group.volumeId)}
                  key={`empty-${group.key}`}
                >
                  把照片拖到这里
                </li>
              ) : null,
              ...group.files.map((file, index) => (
                <li
                  className={[
                    "admin-album-photo",
                    "admin-stagger",
                    album.coverId === file.id ? "is-cover" : "",
                    drag?.ids.includes(file.id) ? "is-dragging" : "",
                    dropTarget === group.volumeId ? "is-drop-group" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-volume-drop={group.volumeId === null ? "none" : String(group.volumeId)}
                  key={file.id}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerCancel={endDrag}
                  onPointerDown={(event) => startDrag(event, [file.id])}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  style={{ "--i": index } as React.CSSProperties}
                >
                  <span
                    aria-hidden
                    className="admin-album-photo__grip"
                    title="拖动这张照片换卷"
                  >
                    ⠿
                  </span>
                <label className="admin-album-photo__pick">
                  <input
                    checked={selected.has(file.id)}
                    onChange={() => toggleSelected(file.id)}
                    type="checkbox"
                  />
                  选择
                </label>
                <span className="admin-album-photo__preview">
                  {file.thumb?.url || file.original.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" draggable={false} src={file.thumb?.url ?? file.original.url} />
                  ) : null}
                </span>
                <span className="admin-muted">
                  {formatBytes(file.size)} · {formatDateTime(file.createdAt)}
                </span>
                <span className="admin-album-photo__actions">
                  {album.coverId === file.id ? (
                    <span className="admin-badge">封面</span>
                  ) : (
                    <button
                      className="admin-btn admin-btn--link admin-btn--sm"
                      disabled={busy === "cover"}
                      onClick={() => void setCover(file.id)}
                      type="button"
                    >
                      设为封面
                    </button>
                  )}
                  <button
                    className="admin-btn admin-btn--link admin-btn--sm"
                    disabled={busy === `remove-${file.id}`}
                    onClick={() => void removeImage(file)}
                    type="button"
                  >
                    移出
                  </button>
                </span>
              </li>
              )),
            ])}
          </ul>
        )}
      </div>

      {message ? <p className="admin-muted">{message}</p> : null}
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      <AdminDialog
        onClose={() => setPicking(false)}
        open={picking}
        title="从媒体库加入照片"
        wide
      >
        <MediaLibraryPicker
          disabled={busy === "assign"}
          kinds={["image"]}
          onPickMany={(files) => void assign(files)}
        />
      </AdminDialog>
      {dialog}
    </div>
  );
}
