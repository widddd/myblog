"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

import { adminJson } from "@/lib/client/admin";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { AdminSection } from "@/components/admin/AdminSection";
import {
  describeDirectoryConflict,
  normalizeDirectory,
  normalizeSlug,
  STATIC_PAGE_TITLE_MAX,
} from "@/lib/pages/directories";

export type StaticPageRow = {
  id: number;
  slug: string;
  title: string;
  enabled: boolean;
  hasCode: boolean;
  updatedAtText: string;
};

export type ReservedRow = {
  segment: string;
  decision: "block" | "warn";
  reason: string;
};

/** 标题 → 建议的地址名（ASCII 之外一律丢弃，中文标题需要手填）。 */
export function suggestSlug(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalizeSlug(ascii).ok ? ascii : "";
}

export function StaticPagesManager({
  dir,
  rows,
  reserved,
}: {
  dir: string;
  rows: StaticPageRow[];
  reserved: ReservedRow[];
}) {
  const router = useRouter();
  const [dirDraft, setDirDraft] = useState(dir);
  const [dirSaving, setDirSaving] = useState(false);
  const [dirError, setDirError] = useState("");
  const [dirNotice, setDirNotice] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const dirCheck = normalizeDirectory(dirDraft);
  const dirConflict = dirCheck.ok ? describeDirectoryConflict(dirCheck.value) : null;
  const dirChanged = dirCheck.ok && dirCheck.value !== dir;
  const enabledCount = rows.filter((row) => row.enabled).length;

  const slugCheck = normalizeSlug(slug);

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) {
      setSlug(suggestSlug(value));
    }
  }

  async function saveDir() {
    setDirError("");
    setDirNotice("");
    if (!dirCheck.ok) {
      setDirError(dirCheck.message);
      return;
    }
    if (
      dirChanged &&
      enabledCount > 0 &&
      !window.confirm(
        `目录从「${dir}」改为「${dirCheck.value}」后，${enabledCount} 个已启用页面的地址会一起变成 /${dirCheck.value}/…，旧地址立即 404。\n继续吗？`,
      )
    ) {
      return;
    }
    setDirSaving(true);
    try {
      const { data } = await adminJson<{ data: { dir: string } }>(
        "/api/admin/pages/dir",
        { method: "PUT", body: JSON.stringify({ staticPagesDir: dirCheck.value }) },
      );
      setDirDraft(data.dir);
      setDirNotice(`目录已保存为「${data.dir}」`);
      router.refresh();
    } catch (caught) {
      setDirError(caught instanceof Error ? caught.message : "保存目录失败");
    } finally {
      setDirSaving(false);
    }
  }

  async function create() {
    setCreateError("");
    if (!normalizeDirectory(dir).ok) {
      setCreateError("当前目录不合法，先在上面把目录保存好");
      return;
    }
    if (!title.trim()) {
      setCreateError("请填写页面标题");
      return;
    }
    if (!slugCheck.ok) {
      setCreateError(slugCheck.message);
      return;
    }
    setCreating(true);
    try {
      const { data } = await adminJson<{ data: { id: number } }>(
        "/api/admin/pages",
        {
          method: "POST",
          body: JSON.stringify({ slug: slugCheck.value, title: title.trim() }),
        },
      );
      router.push(`/admin/pages/${data.id}`);
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : "新建失败");
      setCreating(false);
    }
  }

  return (
    <>
      <section className="admin-card">
        <div className="admin-panel-head">
          <h2>静态页面目录</h2>
          <span className="admin-badge admin-badge--info">{dir}</span>
        </div>
        <p className="admin-muted">
          页面地址 = <code>/{dir}/地址名</code>。目录可以随时改；改完后所有页面的旧地址立即失效。
        </p>

        <div className="admin-field-row">
          <label className="admin-field">
            目录名
            <input
              maxLength={60}
              onChange={(event) => {
                setDirDraft(event.target.value.trim());
                setDirNotice("");
                setDirError("");
              }}
              value={dirDraft}
            />
          </label>
          <div className="admin-field">
            操作
            <button
              className="admin-btn"
              disabled={dirSaving || !dirCheck.ok || !dirChanged}
              onClick={() => void saveDir()}
              type="button"
            >
              {dirSaving ? "保存中…" : "保存目录"}
            </button>
          </div>
        </div>

        {!dirCheck.ok ? (
          <p className="admin-error" role="alert">
            {dirCheck.message}
          </p>
        ) : null}
        {dirConflict ? (
          <p className="admin-danger">
            {dirConflict} —— 这个目录与站内已有地址冲突，
            框架路由会优先匹配，静态页面将无法访问。请换一个目录名。
          </p>
        ) : null}
        {dirNotice ? <p className="admin-muted">{dirNotice}</p> : null}
        {dirError ? (
          <p className="admin-error" role="alert">
            {dirError}
          </p>
        ) : null}
      </section>

      <AdminSection
        defaultOpen={false}
        hint={`${reserved.filter((item) => item.decision === "block").length} 个禁用 · ${reserved.filter((item) => item.decision === "warn").length} 个提示`}
        title="保留地址（不能用）"
      >
        <p className="admin-muted">
          这些名字已经被站内路由或约定占用。Next 的路由永远优先，静态页面用这些名字会访问不到，
          所以创建时直接被拦下。将来新增顶层路由（例如再加一个 /xxx 栏目）也会同步进这份清单。
        </p>
        <ul className="admin-list admin-list--plain">
          {reserved.map((item) => (
            <li key={item.segment}>
              <code>{item.segment}</code>
              <span
                className={
                  item.decision === "block"
                    ? "admin-badge admin-badge--danger"
                    : "admin-badge admin-badge--warn"
                }
              >
                {item.decision === "block" ? "禁用" : "提示"}
              </span>
              <span className="admin-muted">{item.reason}</span>
            </li>
          ))}
        </ul>
      </AdminSection>

      <section className="admin-card">
        <div className="admin-panel-head">
          <h2>新建页面</h2>
        </div>
        <div className="admin-field-row">
          <label className="admin-field">
            页面标题
            <input
              maxLength={STATIC_PAGE_TITLE_MAX}
              onChange={(event) => onTitleChange(event.target.value)}
              value={title}
            />
          </label>
          <label className="admin-field">
            地址名
            <input
              maxLength={64}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value.trim());
                setCreateError("");
              }}
              value={slug}
            />
          </label>
        </div>
        <p className="admin-muted">
          {slug && slugCheck.ok ? (
            <>
              访问地址：<code>/{dir}/{slugCheck.value}</code>
              {!slugTouched ? "（由标题自动生成，可改）" : null}
            </>
          ) : slug && !slugCheck.ok ? (
            <span className="admin-error">{slugCheck.message}</span>
          ) : (
            "地址名只允许小写字母、数字、- 与 _；中文标题请自己填一个（例如 about）。"
          )}
        </p>
        {createError ? (
          <p className="admin-error" role="alert">
            {createError}
          </p>
        ) : null}
        <div className="admin-btn-row">
          <button
            className="admin-btn"
            disabled={creating || !title.trim() || !slugCheck.ok}
            onClick={() => void create()}
            type="button"
          >
            {creating ? "创建中…" : "新建并编辑"}
          </button>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-panel-head">
          <h2>页面列表</h2>
          <span className="admin-muted">共 {rows.length} 个</span>
        </div>
        {rows.length === 0 ? (
          <p className="admin-muted">还没有静态页面。上面填个标题就能建第一个。</p>
        ) : (
          <div className="admin-list admin-list--pages">
            <div className="admin-list__head">
              <span>标题</span>
              <span>地址</span>
              <span>状态</span>
              <span>内容</span>
              <span>最后改动</span>
              <span>操作</span>
            </div>
            {rows.map((row, index) => (
              <article
                className="admin-list__row admin-stagger"
                key={row.id}
                style={{ "--i": index } as React.CSSProperties}
              >
                <div className="admin-list__cell admin-list__cell--main" data-label="标题">
                  {row.title}
                </div>
                <div className="admin-list__cell" data-label="地址">
                  <code>/{dir}/{row.slug}</code>
                </div>
                <div className="admin-list__cell" data-label="状态">
                  <span
                    className={
                      row.enabled
                        ? "admin-badge admin-badge--ok"
                        : "admin-badge admin-badge--muted"
                    }
                  >
                    {row.enabled ? "已启用" : "已停用"}
                  </span>
                </div>
                <div className="admin-list__cell" data-label="内容">
                  {row.hasCode ? "含代码" : "空"}
                </div>
                <div className="admin-list__cell" data-label="最后改动">
                  {row.updatedAtText}
                </div>
                <div className="admin-list__actions">
                  <a
                    className="admin-btn admin-btn--ghost"
                    href={`/${dir}/${row.slug}`}
                    rel="noreferrer"
                    target="_blank"
                    title="在新标签打开前台页面"
                  >
                    <ExternalLinkIcon />
                  </a>
                  <Link
                    className="admin-btn admin-btn--ghost"
                    href={`/admin/pages/${row.id}`}
                  >
                    编辑
                  </Link>
                  <DeleteButton
                    confirmText={`确定删除页面「${row.title}」？`}
                    url={`/api/admin/pages/${row.id}`}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
