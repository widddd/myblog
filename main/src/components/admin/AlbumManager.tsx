"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAdminConfirm } from "@/components/admin/useAdminConfirm";
import { adminJson } from "@/lib/client/admin";
import { ALBUM_DESCRIPTION_MAX, ALBUM_TITLE_MAX } from "@/lib/albums/slug";
import type { AdminAlbumView } from "@/lib/albums/types";

/**
 * 后台相册列表：新建 + 每行的启用开关 / 删除。
 * 详细的改名与照片管理在 `/admin/albums/[id]`（本页只留「编辑」入口）。
 */
export function AlbumManager({ rows }: { rows: AdminAlbumView[] }) {
  const router = useRouter();
  const { confirm, dialog } = useAdminConfirm();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function create() {
    if (!title.trim() || busy) {
      return;
    }
    setBusy("create");
    setError("");
    try {
      // ⚠️ `jsonData()` 一律包一层 `{ data }`（lib/admin/http.ts）——别把信封当对象用，
      // 否则 `album.id` 是 undefined，跳转就落到 `/admin/albums/undefined`（2026-10-07 用户报）
      const { data: album } = await adminJson<{ data: AdminAlbumView }>("/api/admin/albums", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim() || undefined,
          description: description.trim(),
        }),
      });
      setTitle("");
      setSlug("");
      setDescription("");
      setOpen(false);
      router.refresh();
      router.push(`/admin/albums/${album.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setBusy("");
    }
  }

  async function toggle(album: AdminAlbumView) {
    setBusy(`toggle-${album.id}`);
    setError("");
    try {
      await adminJson(`/api/admin/albums/${album.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !album.enabled }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy("");
    }
  }

  async function remove(album: AdminAlbumView) {
    const extra =
      album.count > 0
        ? `相册里还有 ${album.count} 张照片：删相册不会删照片，它们会回到媒体库的「未分类」。`
        : "相册里还没有照片。";
    if (!(await confirm(`确定删除相册「${album.title}」？\n\n${extra}`))) {
      return;
    }
    setBusy(`delete-${album.id}`);
    setError("");
    try {
      await adminJson(`/api/admin/albums/${album.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="admin-albums">
      <p className="admin-muted">
        相册是对外公开的：启用中的相册会出现在前台「相册」里（<code>/albums</code>）。
        把图片归到相册里只影响它出现在哪个相册，不会改动文章正文。
      </p>

      <div className="admin-form-actions">
        <button
          className="admin-btn"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? "收起" : "新建相册"}
        </button>
      </div>

      {open ? (
        <div className="admin-album-create">
          <label className="admin-field">
            相册名
            <input
              maxLength={ALBUM_TITLE_MAX}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：2026 樱花"
              value={title}
            />
          </label>
          <label className="admin-field">
            地址名（留空自动生成）
            <input
              onChange={(event) => setSlug(event.target.value)}
              placeholder="sakura"
              value={slug}
            />
          </label>
          <label className="admin-field">
            说明（可留空）
            <textarea
              maxLength={ALBUM_DESCRIPTION_MAX}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </label>
          <button
            className="admin-btn"
            disabled={!title.trim() || busy === "create"}
            onClick={() => void create()}
            type="button"
          >
            {busy === "create" ? "创建中…" : "创建并管理照片"}
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="admin-muted">还没有相册，先新建一个。</p>
      ) : (
        <ul className="admin-album-list">
          {rows.map((album) => (
            <li className="admin-album-row" key={album.id}>
              <span className="admin-album-row__cover">
                {album.coverThumbSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={album.coverThumbSrc} />
                ) : (
                  <span aria-hidden>▤</span>
                )}
              </span>
              <span className="admin-album-row__main">
                <strong>{album.title}</strong>
                <span className="admin-muted">
                  /albums/{album.slug} · {album.count} 张 · 更新于{" "}
                  {album.updatedAtText}
                </span>
              </span>
              <span
                className={
                  album.enabled
                    ? "admin-badge"
                    : "admin-badge admin-badge--muted"
                }
              >
                {album.enabled ? "对外公开" : "已关闭"}
              </span>
              <span className="admin-album-row__actions">
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={busy === `toggle-${album.id}`}
                  onClick={() => void toggle(album)}
                  type="button"
                >
                  {album.enabled ? "关闭" : "开启"}
                </button>
                <Link className="admin-btn admin-btn--sm" href={`/admin/albums/${album.id}`}>
                  编辑
                </Link>
                <button
                  className="admin-btn admin-btn--danger admin-btn--sm"
                  disabled={busy === `delete-${album.id}`}
                  onClick={() => void remove(album)}
                  type="button"
                >
                  删除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {dialog}
    </div>
  );
}
