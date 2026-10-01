"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

import { adminJson } from "@/lib/client/admin";
import {
  normalizeSlug,
  STATIC_PAGE_CODE_MAX,
  STATIC_PAGE_DESCRIPTION_MAX,
  STATIC_PAGE_TITLE_MAX,
} from "@/lib/pages/directories";

export type StaticPageEditorPage = {
  id: number;
  slug: string;
  title: string;
  description: string;
  html: string;
  css: string;
  js: string;
  enabled: boolean;
};

type CodeTab = "html" | "css" | "js";

const CODE_TABS: ReadonlyArray<{ id: CodeTab; label: string; hint: string }> = [
  {
    id: "html",
    label: "HTML",
    hint: "原样插入页面。内联 <script> 不会执行（浏览器语义），要跑脚本写进 JS 栏。",
  },
  { id: "css", label: "CSS", hint: "整页生效，不受作用域限制，可以写 body、* 这类选择器。" },
  { id: "js", label: "JS", hint: "在浏览器执行，出错只打印日志，不影响站点其它部分。" },
];

export function StaticPageEditor({
  page,
  dir,
}: {
  page: StaticPageEditorPage;
  dir: string;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(page.slug);
  const [title, setTitle] = useState(page.title);
  const [description, setDescription] = useState(page.description);
  const [enabled, setEnabled] = useState(page.enabled);
  const [html, setHtml] = useState(page.html);
  const [css, setCss] = useState(page.css);
  const [js, setJs] = useState(page.js);
  const [tab, setTab] = useState<CodeTab>("html");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const slugCheck = normalizeSlug(slug);
  const href = `/${dir}/${slug}`;
  const codeValue = tab === "html" ? html : tab === "css" ? css : js;
  const setCodeValue = tab === "html" ? setHtml : tab === "css" ? setCss : setJs;
  const activeTab = CODE_TABS.find((item) => item.id === tab);
  const overLimit = codeValue.length > STATIC_PAGE_CODE_MAX;

  async function save() {
    setError("");
    if (!slugCheck.ok) {
      setError(slugCheck.message);
      return;
    }
    setSaving(true);
    try {
      await adminJson(`/api/admin/pages/${page.id}`, {
        method: "PATCH",
        body: JSON.stringify({ slug, title, description, enabled, html, css, js }),
      });
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function markDirty() {
    setSaved(false);
  }

  return (
    <section className="admin-card">
      <div className="admin-panel-head">
        <h2>编辑静态页面</h2>
        <div className="admin-btn-row">
          <Link className="admin-btn admin-btn--ghost" href="/admin/pages">
            返回列表
          </Link>
          <a
            className="admin-btn admin-btn--ghost"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLinkIcon /> 预览
          </a>
        </div>
      </div>

      <div className="admin-field-row">
        <label className="admin-field">
          页面标题
          <input
            maxLength={STATIC_PAGE_TITLE_MAX}
            onChange={(event) => {
              setTitle(event.target.value);
              markDirty();
            }}
            value={title}
          />
        </label>
        <label className="admin-field">
          地址名（地址最后一段）
          <input
            maxLength={64}
            onChange={(event) => {
              setSlug(event.target.value.trim());
              markDirty();
            }}
            value={slug}
          />
        </label>
      </div>

      <p className={slugCheck.ok ? "admin-muted" : "admin-error"}>
        {slugCheck.ok ? (
          <>
            访问地址：<code>{href}</code>
            {!enabled ? "（页面已停用，前台访问会 404）" : null}
          </>
        ) : (
          slugCheck.message
        )}
      </p>

      <label className="admin-field">
        页面描述（meta description，可留空）
        <input
          maxLength={STATIC_PAGE_DESCRIPTION_MAX}
          onChange={(event) => {
            setDescription(event.target.value);
            markDirty();
          }}
          value={description}
        />
      </label>

      <label className="home-editor__toggle">
        <input
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            markDirty();
          }}
          type="checkbox"
        />
        启用（停用后前台 404，页面内容保留）
      </label>

      <p className="admin-danger">
        这三栏内容按管理员内容面直接注入前台，不走正文的 sanitize 管线。
        只有管理员能写，等价于可以 XSS 自己的站——不要粘贴来源不明的代码。
      </p>

      <div className="module-code__tabs">
        {CODE_TABS.map((item) => (
          <button
            className={`admin-toolbar-button${tab === item.id ? " is-active" : ""}`}
            key={item.id}
            onClick={() => setTab(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="module-code">
        <p className="admin-muted">{activeTab?.hint}</p>
        <textarea
          onChange={(event) => {
            setCodeValue(event.target.value);
            markDirty();
          }}
          placeholder={
            tab === "html"
              ? "<div class=\"hero\"><h1>Hello</h1></div>"
              : tab === "css"
                ? "body { margin: 0; font-family: system-ui; }"
                : "console.log('hello from static page');"
          }
          spellCheck={false}
          value={codeValue}
        />
        <p className={overLimit ? "admin-error" : "admin-muted"}>
          {codeValue.length} / {STATIC_PAGE_CODE_MAX} 字符
        </p>
      </div>

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-btn-row">
        <button
          className="admin-btn"
          disabled={saving || !slugCheck.ok || overLimit}
          onClick={() => void save()}
          type="button"
        >
          {saving ? "保存中…" : saved ? "已保存" : "保存页面"}
        </button>
      </div>
    </section>
  );
}
