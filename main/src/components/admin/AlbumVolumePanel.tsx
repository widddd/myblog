"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAdminConfirm } from "@/components/admin/useAdminConfirm";
import { ALBUM_TITLE_MAX } from "@/lib/albums/slug";
import type { AdminAlbumVolumeView } from "@/lib/albums/types";
import { adminJson } from "@/lib/client/admin";

/**
 * 相册编辑页的「卷」区块：新建 / 改名 / 删除 / 上移下移。
 *
 * 卷是**相册内部**的分组（对外相册页按卷分段展示）。归卷动作不在这儿：
 * 那个要先在照片网格里选中照片，所以留在 `AlbumEditor` 的照片区。
 *
 * 删除只是解绑（外键 SetNull）：卷里的照片回到相册的「未分类」，照片本身不会被删。
 *
 * **卷名可以清空**（2026-10-03 用户口径）：清空 = 这一卷不作为独立分组，
 * 它的照片并入前台最前那一组「不属于任何卷」（读层见 `lib/albums/query.ts` 的 `getPublicAlbum()`）；
 * 想恢复成独立分组，再给它填个名字即可（卷与照片归属都没动）。
 * 所以列表里空名要显式显示成「未命名（= 未分类）」，不能留白让人以为坏了。
 */
export function AlbumVolumePanel({
  albumId,
  volumes,
}: {
  albumId: number;
  volumes: AdminAlbumVolumeView[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useAdminConfirm();
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function create() {
    setBusy("create");
    setError("");
    setMessage("");
    try {
      const { data } = await adminJson<{ data: AdminAlbumVolumeView }>(
        `/api/admin/albums/${albumId}/volumes`,
        { method: "POST", body: JSON.stringify({ title: title.trim() || undefined }) },
      );
      setTitle("");
      setMessage(`已新建「${data.title}」`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "新建卷失败");
    } finally {
      setBusy("");
    }
  }

  async function rename(volume: AdminAlbumVolumeView) {
    // 备注：`trim()` 后是空串也照发（空卷名 = 这一卷不作为独立分组）；
    // 只有「一个字都没改」才当作取消（含本来就是空名、又被保存一次）。
    const next = draft.trim();
    if (next === volume.title.trim()) {
      setEditingId(null);
      return;
    }
    setBusy(`rename-${volume.id}`);
    setError("");
    setMessage("");
    try {
      await adminJson(`/api/admin/albums/${albumId}/volumes/${volume.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: next }),
      });
      setEditingId(null);
      setMessage(
        next
          ? `已改名为「${next}」`
          : "已清空卷名：这一卷不再单独成组，它的照片并入「不属于任何卷」那组",
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "改名失败");
    } finally {
      setBusy("");
    }
  }

  async function remove(volume: AdminAlbumVolumeView) {
    const label = volume.title || "未命名（= 未分类）";
    const extra =
      volume.count > 0
        ? `这一卷里的 ${volume.count} 张照片会回到相册的「未分类」，照片本身不会被删。`
        : "这一卷里还没有照片。";
    if (!(await confirm(`确定删除「${label}」？\n\n${extra}`))) {
      return;
    }
    setBusy(`delete-${volume.id}`);
    setError("");
    setMessage("");
    try {
      const { data } = await adminJson<{ data: { affectedImages: number } }>(
        `/api/admin/albums/${albumId}/volumes/${volume.id}`,
        { method: "DELETE" },
      );
      setMessage(
        data.affectedImages > 0
          ? `已删除「${label}」，${data.affectedImages} 张照片回到未分类`
          : `已删除「${label}」`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除卷失败");
    } finally {
      setBusy("");
    }
  }

  /** 上移 / 下移一位：把整个顺序表发过去（服务端按顺序写 sort）。 */
  async function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= volumes.length) {
      return;
    }
    const ids = volumes.map((volume) => volume.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    setBusy(`move-${volumes[index].id}`);
    setError("");
    setMessage("");
    try {
      await adminJson<{ data: AdminAlbumVolumeView[] }>(
        `/api/admin/albums/${albumId}/volumes`,
        { method: "PATCH", body: JSON.stringify({ ids }) },
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "调整顺序失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="admin-album-editor__volumes">
      <div className="admin-album-editor__bar">
        <strong>卷（{volumes.length}）</strong>
        <span className="admin-muted">
          卷是相册内部的分组，对外相册页会按卷分段显示；<strong>卷名清空 = 这一卷不作为独立分组</strong>
          ，它的照片会并入「不属于任何卷」那组（前台那组排在最前、组头只显示张数）。
        </span>
        <span className="admin-album-row__spacer" />
        <input
          className="admin-volume-new"
          maxLength={ALBUM_TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="新卷标题（自由填写，日期也可以写进去；留空自动「第 N 卷」）"
          value={title}
        />
        <button
          className="admin-btn admin-btn--sm"
          disabled={busy === "create"}
          onClick={() => void create()}
          type="button"
        >
          {busy === "create" ? "新建中…" : "新建卷"}
        </button>
      </div>

      {volumes.length === 0 ? (
        <p className="admin-muted">
          还没有卷。建卷后，在下面的照片上勾选，用「放入卷」把照片分进去；
          不建卷也能正常用，照片都算「未分类」。
        </p>
      ) : (
        <ul className="admin-volume-list">
          {volumes.map((volume, index) => (
            <li className="admin-volume-row" key={volume.id}>
              {editingId === volume.id ? (
                <input
                  autoFocus
                  className="admin-volume-row__input"
                  maxLength={ALBUM_TITLE_MAX}
                  onChange={(event) => setDraft(event.target.value)}
                  value={draft}
                />
              ) : volume.title ? (
                <strong className="admin-volume-row__title">{volume.title}</strong>
              ) : (
                /* 空卷名不能留白（会让人以为坏了）：显式说明它= 不单独成组 */
                <span className="admin-volume-row__title admin-volume-row__title--empty">
                  未命名（= 未分类）
                </span>
              )}
              <span className="admin-muted">{volume.count} 张</span>
              <span className="admin-album-row__spacer" />
              <span className="admin-volume-row__actions">
                {editingId === volume.id ? (
                  <>
                    <button
                      className="admin-btn admin-btn--sm"
                      disabled={busy === `rename-${volume.id}`}
                      onClick={() => void rename(volume)}
                      type="button"
                    >
                      保存
                    </button>
                    <button
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => setEditingId(null)}
                      type="button"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                    onClick={() => {
                      setEditingId(volume.id);
                      setDraft(volume.title);
                    }}
                    type="button"
                  >
                    改名
                  </button>
                )}
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={index === 0 || busy === `move-${volume.id}`}
                  onClick={() => void move(index, -1)}
                  type="button"
                >
                  上移
                </button>
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={index === volumes.length - 1 || busy === `move-${volume.id}`}
                  onClick={() => void move(index, 1)}
                  type="button"
                >
                  下移
                </button>
                <button
                  className="admin-btn admin-btn--danger admin-btn--sm"
                  disabled={busy === `delete-${volume.id}`}
                  onClick={() => void remove(volume)}
                  type="button"
                >
                  删除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

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
