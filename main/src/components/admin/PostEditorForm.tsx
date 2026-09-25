"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, GearIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { AnimatePresence, m } from "motion/react";

import { EditorLoader } from "@/components/admin/EditorLoader";
import { EditorPreview } from "@/components/admin/EditorPreview";
import { adminJson } from "@/lib/client/admin";
import {
  editorImageUrl,
  finalizeAdminUploads,
  hasActiveTransfers,
  uploadAdminFile,
  UploadCancelledError,
} from "@/lib/client/upload";
import { bannerFill } from "@/lib/posts/banner";
import type { AdminPostView } from "@/lib/posts/admin-types";
import { AUTHOR_NAME_MAX } from "@/lib/posts/author";
import {
  MAX_MARKDOWN_IMPORT_BYTES,
  parseMarkdownImport,
} from "@/lib/posts/import-markdown";
import { normalizePostContent } from "@/lib/posts/normalize-content";
import { collectMediaHashes, firstMediaHash } from "@/lib/uploads/hashes";
import { cn } from "@/lib/utils/cn";
import { slugify } from "@/lib/utils/slugify";

type TaxonomyOption = {
  id: number;
  name: string;
  slug: string;
};

/** 笔名只存名字（没有 slug，作者没有独立页面） */
type PenNameOption = {
  id: number;
  name: string;
};

type PostEditorFormProps = {
  mode: "create" | "edit";
  post?: AdminPostView;
  categories: TaxonomyOption[];
  tags: TaxonomyOption[];
  /** 已登记的笔名（像分类/标签一样可加多个），用于作者下拉与快捷选择 */
  penNames: PenNameOption[];
  /** 管理员账号上的默认笔名：新文章的作者默认取它 */
  defaultAuthorName: string;
};

type FoldKey = "publish" | "taxonomy" | "cover" | "extra";

function toDatetimeLocal(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function SettingsFold({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={cn("admin-fold", open && "is-open")}>
      <button
        aria-expanded={open}
        className="admin-fold__head"
        onClick={onToggle}
        type="button"
      >
        <span>{title}</span>
        <span aria-hidden="true" className="admin-fold__mark" />
      </button>
      <m.div
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        initial={false}
        style={{ overflow: "hidden" }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="admin-fold__inner">{children}</div>
      </m.div>
    </section>
  );
}

export function PostEditorForm({
  mode,
  post,
  categories,
  tags,
  penNames,
  defaultAuthorName,
}: PostEditorFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  // 作者：文章自己填过就用它，否则预填默认笔名（服务端在没有这笔名时也会兜底）
  const [authorName, setAuthorName] = useState(
    post?.authorName?.trim() || defaultAuthorName,
  );
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [cover, setCover] = useState(post?.cover ?? "");
  const [bannerStyle, setBannerStyle] = useState(
    post?.bannerStyle === "solid" || post?.bannerStyle === "gradient"
      ? post.bannerStyle
      : "cover",
  );
  const [bannerColor, setBannerColor] = useState(post?.bannerColor ?? "#4db8e8");
  const [bannerColor2, setBannerColor2] = useState(
    post?.bannerColor2 ?? "#7b6cff",
  );
  const [editorKey, setEditorKey] = useState(0);
  const [status, setStatus] = useState(post?.status ?? "draft");
  const [publishedAt, setPublishedAt] = useState(
    toDatetimeLocal(post?.publishedAt),
  );
  const [pinned, setPinned] = useState(post?.pinned ?? false);
  const [recommend, setRecommend] = useState(post?.recommend ?? false);
  // 文章页是否显示「已修改 + 修改时间」，默认显示（老文章没有该字段时也按显示处理）
  const [showRevisedAt, setShowRevisedAt] = useState(post?.showRevisedAt ?? true);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [categoryId, setCategoryId] = useState(
    post?.category?.id ? String(post.category.id) : "",
  );
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [tagOptions, setTagOptions] = useState(tags);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [penNameOptions, setPenNameOptions] = useState(penNames);
  const [newPenName, setNewPenName] = useState("");
  const [creatingTaxonomy, setCreatingTaxonomy] = useState<
    "category" | "tag" | "penName" | null
  >(null);
  const [tagIds, setTagIds] = useState<number[]>(
    post?.tags.map((tag) => tag.id) ?? [],
  );
  const [content, setContent] = useState(() =>
    normalizePostContent(post?.content ?? "# 新文章\n\n"),
  );
  const [error, setError] = useState("");
  const [savingAs, setSavingAs] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [folds, setFolds] = useState<Record<FoldKey, boolean>>({
    publish: true,
    taxonomy: true,
    cover: false,
    extra: false,
  });
  const initialMarkdown = useMemo(
    () => normalizePostContent(post?.content ?? "# 新文章\n\n"),
    [post?.content],
  );

  useEffect(() => {
    if (!sheetOpen) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSheetOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  function closeSettingsSheet() {
    setSheetOpen(false);
  }

  function openSettingsSheet() {
    setSettingsOpen(true);
    setSheetOpen(true);
  }

  function toggleSettingsPane() {
    if (sheetOpen) {
      setSheetOpen(false);
      return;
    }
    setSettingsOpen((current) => !current);
  }

  function toggleFold(key: FoldKey) {
    setFolds((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleTag(id: number) {
    setTagIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function resolveTaxonomy(
    kind: "categories" | "tags",
    name: string,
  ): Promise<TaxonomyOption> {
    const trimmed = name.trim();
    try {
      const payload = await adminJson<{ data: TaxonomyOption }>(
        `/api/admin/${kind}`,
        {
          method: "POST",
          body: JSON.stringify({ name: trimmed }),
        },
      );
      return payload.data;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (!message.includes("已被占用")) {
        throw caught;
      }
      const listed = await adminJson<{ data: TaxonomyOption[] }>(
        `/api/admin/${kind}`,
      );
      const slug = slugify(trimmed).toLowerCase();
      const existing = listed.data.find(
        (item) => item.slug === slug || item.name === trimmed,
      );
      if (!existing) {
        throw caught;
      }
      return existing;
    }
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name || creatingTaxonomy) {
      return;
    }
    setError("");
    setCreatingTaxonomy("category");
    try {
      const created = await resolveTaxonomy("categories", name);
      setCategoryOptions((current) =>
        current.some((item) => item.id === created.id)
          ? current
          : [...current, created].sort((a, b) => a.name.localeCompare(b.name, "zh")),
      );
      setCategoryId(String(created.id));
      setNewCategoryName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建分类失败");
    } finally {
      setCreatingTaxonomy(null);
    }
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name || creatingTaxonomy) {
      return;
    }
    setError("");
    setCreatingTaxonomy("tag");
    try {
      const created = await resolveTaxonomy("tags", name);
      setTagOptions((current) =>
        current.some((item) => item.id === created.id)
          ? current
          : [...current, created].sort((a, b) => a.name.localeCompare(b.name, "zh")),
      );
      setTagIds((current) =>
        current.includes(created.id) ? current : [...current, created.id],
      );
      setNewTagName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建标签失败");
    } finally {
      setCreatingTaxonomy(null);
    }
  }

  /** 笔名没有 slug，冲突时按名字回查已有记录，避免重复创建报错卡住流程 */
  async function resolvePenName(name: string): Promise<PenNameOption> {
    const trimmed = name.trim();
    try {
      const payload = await adminJson<{ data: PenNameOption }>(
        "/api/admin/pen-names",
        { method: "POST", body: JSON.stringify({ name: trimmed }) },
      );
      return payload.data;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (!message.includes("已经有了")) {
        throw caught;
      }
      const listed = await adminJson<{ data: PenNameOption[] }>(
        "/api/admin/pen-names",
      );
      const existing = listed.data.find((item) => item.name === trimmed);
      if (!existing) {
        throw caught;
      }
      return existing;
    }
  }

  async function handleCreatePenName() {
    const name = newPenName.trim();
    if (!name || creatingTaxonomy) {
      return;
    }
    setError("");
    setCreatingTaxonomy("penName");
    try {
      const created = await resolvePenName(name);
      setPenNameOptions((current) =>
        current.some((item) => item.id === created.id)
          ? current
          : [...current, created].sort((a, b) => a.name.localeCompare(b.name, "zh")),
      );
      setAuthorName(created.name);
      setNewPenName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "新建笔名失败");
    } finally {
      setCreatingTaxonomy(null);
    }
  }

  async function handleCover(file: File | undefined) {
    if (!file) {
      return;
    }
    try {
      const uploaded = await uploadAdminFile(file, "image", undefined, {
        defer: true,
      });
      setCover(editorImageUrl(uploaded));
    } catch (caught) {
      if (caught instanceof UploadCancelledError) {
        return;
      }
      setError(caught instanceof Error ? caught.message : "封面上传失败");
    }
  }

  async function handleMarkdownFile(file: File | undefined) {
    if (!file) {
      return;
    }
    if (file.size > MAX_MARKDOWN_IMPORT_BYTES) {
      setError("Markdown 文件不能超过 1 MB");
      return;
    }
    const text = await file.text();
    const imported = parseMarkdownImport(text, file.name);
    setContent(normalizePostContent(imported.content));
    setEditorKey((current) => current + 1);
    if (imported.title) {
      setTitle(imported.title);
    }
    if (imported.slug) {
      setSlug(imported.slug);
    }
    if (imported.excerpt) {
      setExcerpt(imported.excerpt);
    }
  }

  async function handleSubmit(nextStatus = status) {
    setError("");
    if (hasActiveTransfers()) {
      setError("请等待文件上传完成后再保存");
      return;
    }
    const publishing = nextStatus === "published" || nextStatus === "scheduled";
    setSavingAs(nextStatus);
    try {
      let nextCover = cover;
      if (publishing) {
        const hashes = collectMediaHashes(content, cover);
        const finalized = await finalizeAdminUploads(hashes);
        const coverHash = firstMediaHash(cover);
        const match = coverHash
          ? finalized.find((item) => item.hash === coverHash)
          : undefined;
        if (match) {
          nextCover = editorImageUrl(match);
          setCover(nextCover);
        }
      }

      const payload: Record<string, unknown> = {
        title,
        slug: slug || null,
        authorName: authorName.trim() || null,
        content,
        excerpt: excerpt || null,
        cover: nextCover || null,
        bannerStyle,
        bannerColor: bannerStyle === "cover" ? null : bannerColor,
        bannerColor2: bannerStyle === "gradient" ? bannerColor2 : null,
        status: nextStatus,
        publishedAt: publishedAt || null,
        pinned,
        recommend,
        showRevisedAt,
        categoryId: categoryId ? Number(categoryId) : null,
        tagIds,
      };
      if (mode === "create") {
        payload.password = password || null;
      } else if (clearPassword) {
        payload.password = "";
      } else if (password) {
        payload.password = password;
      }

      const path =
        mode === "create" ? "/api/admin/posts" : `/api/admin/posts/${post?.id}`;
      await adminJson(path, {
        method: mode === "create" ? "POST" : "PATCH",
        body: JSON.stringify(payload),
      });
      router.push("/admin/posts");
      router.refresh();
    } catch (caught) {
      if (caught instanceof UploadCancelledError) {
        return;
      }
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSavingAs(null);
    }
  }

  return (
    <form
      className={cn(
        "post-workspace",
        !settingsOpen && "is-settings-collapsed",
        sheetOpen && "is-sheet",
      )}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {sheetOpen ? (
        <button
          aria-label="关闭设置"
          className="admin-dialog__backdrop admin-settings-sheet"
          onClick={closeSettingsSheet}
          type="button"
        />
      ) : null}
      <aside
        aria-labelledby={sheetOpen ? "post-settings-title" : undefined}
        aria-modal={sheetOpen || undefined}
        className={cn("post-workspace__rail", !settingsOpen && "is-collapsed")}
        role={sheetOpen ? "dialog" : undefined}
      >
        <div className="post-workspace__rail-head">
          <span className="admin-dialog__grab post-workspace__sheet-grab" />
          <p className="post-workspace__sheet-title" id="post-settings-title">
            文章设置
          </p>
          <button
            aria-expanded={sheetOpen ? true : settingsOpen}
            className="admin-pane-toggle"
            onClick={toggleSettingsPane}
            title={
              sheetOpen ? "关闭设置" : settingsOpen ? "收起设置" : "展开设置"
            }
            type="button"
          >
            <span aria-hidden="true" className="admin-pane-toggle__icon" />
            <span className="visually-hidden">
              {sheetOpen ? "关闭设置" : settingsOpen ? "收起设置" : "展开设置"}
            </span>
          </button>
        </div>
        <div className="post-workspace__rail-body">
          <SettingsFold
            onToggle={() => toggleFold("publish")}
            open={folds.publish}
            title="发布"
          >
            <div className="admin-chip-row" role="radiogroup" aria-label="状态">
              {(
                [
                  ["draft", "草稿"],
                  ["scheduled", "定时"],
                  ["published", "已发布"],
                ] as const
              ).map(([value, label]) => (
                <label
                  className={cn("admin-chip", status === value && "is-on")}
                  key={value}
                >
                  <input
                    checked={status === value}
                    name="status"
                    onChange={() => setStatus(value)}
                    type="radio"
                    value={value}
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="admin-field">
              发布时间
              <input
                onChange={(event) => setPublishedAt(event.target.value)}
                type="datetime-local"
                value={publishedAt}
              />
            </label>
            <label className="admin-field">
              作者
              <input
                list="post-author-options"
                maxLength={AUTHOR_NAME_MAX}
                onChange={(event) => setAuthorName(event.target.value)}
                placeholder="留空 = 用默认笔名"
                value={authorName}
              />
            </label>
            {/* 输入框 + datalist = 下拉快捷选已有笔名，也能直接打字自定义 */}
            <datalist id="post-author-options">
              {penNameOptions.map((item) => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>
            {penNameOptions.length > 0 ? (
              <div className="admin-chip-row" role="radiogroup" aria-label="已有笔名">
                {penNameOptions.map((item) => (
                  <label
                    className={cn(
                      "admin-chip",
                      authorName.trim() === item.name && "is-on",
                    )}
                    key={item.id}
                  >
                    <input
                      checked={authorName.trim() === item.name}
                      name="authorName"
                      onChange={() => setAuthorName(item.name)}
                      type="radio"
                      value={item.name}
                    />
                    {item.name}
                  </label>
                ))}
              </div>
            ) : null}
            <div className="admin-inline-create">
              <input
                maxLength={AUTHOR_NAME_MAX}
                onChange={(event) => setNewPenName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreatePenName();
                  }
                }}
                placeholder="新笔名"
                value={newPenName}
              />
              <button
                className="admin-field__reset"
                disabled={!newPenName.trim() || creatingTaxonomy !== null}
                onClick={() => void handleCreatePenName()}
                type="button"
              >
                {creatingTaxonomy === "penName" ? "创建中…" : "新建"}
              </button>
            </div>
            <p className="admin-muted">
              下拉或点标签选已有笔名，也可以直接输入自定义作者；新建的笔名会进这份清单。
              留空 = 用「设置」里账号的默认笔名。
            </p>
            <label className={cn("admin-chip", pinned && "is-on")}>
              <input
                checked={pinned}
                onChange={(event) => setPinned(event.target.checked)}
                type="checkbox"
              />
              置顶
            </label>
            <label className={cn("admin-chip", recommend && "is-on")}>
              <input
                checked={recommend}
                onChange={(event) => setRecommend(event.target.checked)}
                type="checkbox"
              />
              首页推荐
            </label>
            <p className="admin-muted">
              勾选后进入首页推荐位，最多展示 6 篇，按发布时间倒序。
            </p>
            <label className={cn("admin-chip", showRevisedAt && "is-on")}>
              <input
                checked={showRevisedAt}
                onChange={(event) => setShowRevisedAt(event.target.checked)}
                type="checkbox"
              />
              显示「已修改」
            </label>
            <p className="admin-muted">
              已发布的文章再次改动后，文章页会在发布时间旁边标出「已修改 + 修改时间」。
              取消勾选就不再显示。
            </p>
          </SettingsFold>

          <SettingsFold
            onToggle={() => toggleFold("taxonomy")}
            open={folds.taxonomy}
            title="分类与标签"
          >
            <label className="admin-field">
              分类
              <select
                onChange={(event) => setCategoryId(event.target.value)}
                value={categoryId}
              >
                <option value="">无</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-inline-create">
              <input
                onChange={(event) => setNewCategoryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateCategory();
                  }
                }}
                placeholder="新分类名称"
                value={newCategoryName}
              />
              <button
                className="admin-field__reset"
                disabled={!newCategoryName.trim() || creatingTaxonomy !== null}
                onClick={() => void handleCreateCategory()}
                type="button"
              >
                {creatingTaxonomy === "category" ? "创建中…" : "新建"}
              </button>
            </div>
            <div className="admin-chip-row">
              {tagOptions.length === 0 ? (
                <span className="admin-muted">暂无标签，可在下方新建</span>
              ) : (
                tagOptions.map((tag) => (
                  <label
                    className={cn("admin-chip", tagIds.includes(tag.id) && "is-on")}
                    key={tag.id}
                  >
                    <input
                      checked={tagIds.includes(tag.id)}
                      onChange={() => toggleTag(tag.id)}
                      type="checkbox"
                    />
                    {tag.name}
                  </label>
                ))
              )}
            </div>
            <div className="admin-inline-create">
              <input
                onChange={(event) => setNewTagName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateTag();
                  }
                }}
                placeholder="新标签名称"
                value={newTagName}
              />
              <button
                className="admin-field__reset"
                disabled={!newTagName.trim() || creatingTaxonomy !== null}
                onClick={() => void handleCreateTag()}
                type="button"
              >
                {creatingTaxonomy === "tag" ? "创建中…" : "新建"}
              </button>
            </div>
          </SettingsFold>

          <SettingsFold
            onToggle={() => toggleFold("cover")}
            open={folds.cover}
            title="封面与 Banner"
          >
            <div className="admin-field">
              封面
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="封面预览" className="admin-cover-preview" src={cover} />
              ) : null}
              <input
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                onChange={(event) => void handleCover(event.target.files?.[0])}
                type="file"
              />
            </div>
            {bannerStyle === "cover" && !cover ? (
              <p className="admin-muted">
                还没选封面图 → 卡片按「无封面」处理：细条样式，只显示标题和文章开头一小段。
                想用色块就切「纯色 / 混色」——那是封面，不算无封面。
              </p>
            ) : null}
            <div className="admin-chip-row" role="radiogroup" aria-label="顶 Banner">
              {(
                [
                  ["cover", "封面图"],
                  ["solid", "纯色"],
                  ["gradient", "混色"],
                ] as const
              ).map(([value, label]) => (
                <label
                  className={cn("admin-chip", bannerStyle === value && "is-on")}
                  key={value}
                >
                  <input
                    checked={bannerStyle === value}
                    name="bannerStyle"
                    onChange={() => setBannerStyle(value)}
                    type="radio"
                    value={value}
                  />
                  {label}
                </label>
              ))}
            </div>
            {bannerStyle !== "cover" ? (
              <div className="admin-field-row">
                <label className="admin-field">
                  {bannerStyle === "gradient" ? "起始色" : "颜色"}
                  <input
                    onChange={(event) => setBannerColor(event.target.value)}
                    type="color"
                    value={bannerColor}
                  />
                </label>
                {bannerStyle === "gradient" ? (
                  <label className="admin-field">
                    结束色
                    <input
                      onChange={(event) => setBannerColor2(event.target.value)}
                      type="color"
                      value={bannerColor2}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
            <div
              aria-hidden="true"
              className="admin-banner-preview"
              style={{
                background:
                  bannerStyle === "cover"
                    ? cover
                      ? `center / cover url("${cover}")`
                      : "var(--heo-secondbg)"
                    : bannerFill(bannerStyle, bannerColor, bannerColor2),
              }}
            />
          </SettingsFold>

          <SettingsFold
            onToggle={() => toggleFold("extra")}
            open={folds.extra}
            title="摘要、密码与导入"
          >
            <label className="admin-field">
              slug（可空，自动生成）
              <input
                onChange={(event) => setSlug(event.target.value)}
                value={slug}
              />
            </label>
            <label className="admin-field">
              摘要
              <textarea
                onChange={(event) => setExcerpt(event.target.value)}
                rows={3}
                value={excerpt}
              />
            </label>
            <label className="admin-field">
              {post?.hasPassword ? "新密码（留空则不改）" : "访问密码（可空）"}
              <input
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            {post?.hasPassword ? (
              <label className={cn("admin-chip", clearPassword && "is-on")}>
                <input
                  checked={clearPassword}
                  onChange={(event) => setClearPassword(event.target.checked)}
                  type="checkbox"
                />
                清除密码
              </label>
            ) : null}
            <div className="admin-field">
              从 Markdown 导入
              <input
                accept=".md,.mdx,text/markdown"
                onChange={(event) => {
                  void handleMarkdownFile(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </div>
          </SettingsFold>

          {error ? (
            <p className="admin-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </aside>

      <div className="post-workspace__stage">
        <div className="post-workspace__titlebar">
          <Link
            className="admin-btn admin-btn--icon admin-btn--ghost post-workspace__back"
            href="/admin/posts"
            title="返回文章列表"
          >
            <ArrowLeftIcon />
            <span className="visually-hidden">返回文章列表</span>
          </Link>
          <label className="post-workspace__title">
            <span className="visually-hidden">标题</span>
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="文章标题"
              required
              value={title}
            />
          </label>
          <div className="admin-seg" role="group" aria-label="编辑模式">
            <button
              aria-pressed={view === "edit"}
              className={cn("admin-seg__btn", view === "edit" && "is-on")}
              onClick={() => setView("edit")}
              type="button"
            >
              {view === "edit" ? (
                <m.span
                  className="admin-seg__slider"
                  layoutId="post-seg"
                  style={{ left: 3, right: "50%" }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                />
              ) : null}
              可视化
            </button>
            <button
              aria-pressed={view === "preview"}
              className={cn("admin-seg__btn", view === "preview" && "is-on")}
              onClick={() => setView("preview")}
              type="button"
            >
              {view === "preview" ? (
                <m.span
                  className="admin-seg__slider"
                  layoutId="post-seg"
                  style={{ left: "50%", right: 3 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                />
              ) : null}
              预览
            </button>
          </div>
          <div className="admin-btn-row post-workspace__desktop-actions">
            <button
              className="admin-btn admin-btn--ghost"
              disabled={Boolean(savingAs)}
              type="submit"
            >
              {savingAs && savingAs !== "published" && savingAs !== "scheduled"
                ? "保存中…"
                : savingAs
                  ? "正在发布中"
                  : "保存"}
            </button>
            <button
              className="admin-btn"
              disabled={Boolean(savingAs)}
              onClick={() => void handleSubmit("published")}
              type="button"
            >
              {savingAs === "published" || savingAs === "scheduled"
                ? "正在发布中"
                : "保存并发布"}
            </button>
          </div>
          <button
            className="admin-btn admin-btn--icon admin-btn--ghost post-workspace__hint-btn"
            onClick={() => setHintOpen((current) => !current)}
            title="编辑说明"
            type="button"
          >
            <InfoCircledIcon />
            <span className="visually-hidden">编辑说明</span>
          </button>
          <button
            aria-expanded={sheetOpen}
            className="admin-btn admin-btn--ghost admin-editor-settings"
            onClick={openSettingsSheet}
            type="button"
          >
            <GearIcon />
            设置
          </button>
          <AnimatePresence>
            {hintOpen ? (
              <m.p
                className="post-workspace__popover"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                可视化编辑：标题按字号显示。点工具栏「图片 / 视频」会弹出插入框（上传或外链）。块顶部「拖动」可换位。外链视频下方会标域名。
              </m.p>
            ) : null}
          </AnimatePresence>
        </div>
        <div className="post-workspace__editor" hidden={view !== "edit"}>
          <EditorLoader
            key={editorKey}
            markdown={editorKey === 0 ? initialMarkdown : content}
            onChange={setContent}
          />
        </div>
        {view === "preview" ? (
          <div className="post-workspace__preview">
            <EditorPreview markdown={content} />
          </div>
        ) : null}
        <div className="admin-editor-dock">
          <div className="admin-seg" role="group" aria-label="编辑模式">
            <button
              className={cn("admin-seg__btn", view === "edit" && "is-on")}
              onClick={() => setView("edit")}
              type="button"
            >
              可视化
            </button>
            <button
              className={cn("admin-seg__btn", view === "preview" && "is-on")}
              onClick={() => setView("preview")}
              type="button"
            >
              预览
            </button>
          </div>
          <button
            className="admin-btn admin-btn--ghost"
            disabled={Boolean(savingAs)}
            type="submit"
          >
            {savingAs && savingAs !== "published" && savingAs !== "scheduled"
              ? "保存中…"
              : "保存"}
          </button>
          <button
            className="admin-btn"
            disabled={Boolean(savingAs)}
            onClick={() => void handleSubmit("published")}
            type="button"
          >
            {savingAs === "published" || savingAs === "scheduled"
              ? "正在发布中"
              : "发布"}
          </button>
        </div>
      </div>
    </form>
  );
}
