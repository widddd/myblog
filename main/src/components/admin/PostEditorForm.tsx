"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, GearIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { AnimatePresence, m } from "motion/react";

import { EditorLoader } from "@/components/admin/EditorLoader";
import { EditorPreview } from "@/components/admin/EditorPreview";
import { adminJson } from "@/lib/client/admin";
import { registerLocalPreview, releaseLocalPreview } from "@/lib/client/local-preview";
import {
  editorImageUrl,
  finalizeAdminUploads,
  hasActiveTransfers,
  uploadAdminFile,
  UploadCancelledError,
} from "@/lib/client/upload";
import {
  focalPosition,
  randomBannerGradient,
  resolveBannerVisual,
  resolveCoverVisual,
} from "@/lib/posts/banner";
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

/**
 * 图片焦点控制：两个 0–100 滑杆，分别控制横向 / 纵向裁切位置。
 * 预览本身是 `object-fit: cover`，所以调完能直接看到列表卡片 / Banner 会裁到哪里。
 */
function FocalControls({
  label,
  x,
  y,
  onChangeX,
  onChangeY,
}: {
  label: string;
  x: number;
  y: number;
  onChangeX: (value: number) => void;
  onChangeY: (value: number) => void;
}) {
  return (
    <div className="admin-focal-controls">
      <label className="admin-focal-control">
        <span>
          左右位置 <em>{x}%</em>
        </span>
        <input
          aria-label={`${label}左右位置`}
          max={100}
          min={0}
          onChange={(event) => onChangeX(Number(event.target.value))}
          type="range"
          value={x}
        />
      </label>
      <label className="admin-focal-control">
        <span>
          上下位置 <em>{y}%</em>
        </span>
        <input
          aria-label={`${label}上下位置`}
          max={100}
          min={0}
          onChange={(event) => onChangeY(Number(event.target.value))}
          type="range"
          value={y}
        />
      </label>
    </div>
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
  /**
   * 封面的**本机预览地址**（blob）。`cover` 永远是服务端地址（保存/发布要它），
   * 两者分开存：显示优先用本机那份，省掉"刚选完就回源拉一遍原图"
   * （见 lib/client/local-preview.ts）。
   */
  const [coverPreview, setCoverPreview] = useState("");
  const coverSrc = coverPreview || cover;
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverTriggerRef = useRef<HTMLButtonElement>(null);
  /** 列表卡封面**自己的**形态与颜色，不再跟 bannerStyle 联动 */
  const [coverStyle, setCoverStyle] = useState(
    post?.coverStyle ?? (post?.cover ? "image" : "none"),
  );
  const [coverColor, setCoverColor] = useState(post?.coverColor ?? "#4db8e8");
  const [coverColor2, setCoverColor2] = useState(post?.coverColor2 ?? "#7b6cff");
  /** 列表卡片封面焦点：0–100 百分比（50/50 = 居中） */
  const [coverFocalX, setCoverFocalX] = useState(post?.coverFocalX ?? 50);
  const [coverFocalY, setCoverFocalY] = useState(post?.coverFocalY ?? 50);
  /** 文章详情 Banner：与封面完全独立，可另传图片 */
  const [bannerImage, setBannerImage] = useState(post?.bannerImage ?? "");
  const [bannerImagePreview, setBannerImagePreview] = useState("");
  const bannerImageSrc = bannerImagePreview || bannerImage;
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const bannerTriggerRef = useRef<HTMLButtonElement>(null);
  /** 手机底部 sheet 的滚动锚点：文件选择器打开/关闭时，外层 rail 不能被焦点滚动带走。 */
  const railRef = useRef<HTMLElement>(null);
  const railBodyRef = useRef<HTMLDivElement>(null);
  const pickerScrollRef = useRef<{ rail: number; body: number; windowY: number } | null>(null);
  const [bannerStyle, setBannerStyle] = useState(
    post?.bannerStyle === "cover" ||
      post?.bannerStyle === "image" ||
      post?.bannerStyle === "solid" ||
      post?.bannerStyle === "gradient"
      ? post.bannerStyle
      : "gradient",
  );
  const [bannerColor, setBannerColor] = useState(post?.bannerColor ?? "#4db8e8");
  const [bannerColor2, setBannerColor2] = useState(
    post?.bannerColor2 ?? "#7b6cff",
  );
  /** 文章详情 Banner 焦点：与列表卡片分开保存 */
  const [bannerFocalX, setBannerFocalX] = useState(post?.bannerFocalX ?? 50);
  const [bannerFocalY, setBannerFocalY] = useState(post?.bannerFocalY ?? 50);
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
  const coverVisual = resolveCoverVisual(
    coverStyle,
    coverSrc,
    coverColor,
    coverColor2,
  );
  const bannerVisual = resolveBannerVisual({
    bannerStyle,
    bannerImage: bannerImageSrc,
    bannerColor,
    bannerColor2,
    coverStyle,
    cover: coverSrc,
    coverColor,
    coverColor2,
  });
  const bannerNeedsImage = bannerStyle === "image" && !bannerImageSrc;

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

  // 手机设置 sheet 是模态：锁住页面滚动，否则选择封面时文件选择器把焦点还给 input，
  // 浏览器会把外层 body 滚到 sheet 下方的空白区，看起来像整页白掉。
  useEffect(() => {
    if (!sheetOpen) {
      return;
    }
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [sheetOpen]);

  /**
   * 桌面/手机都锁住 window 的滚动。
   *
   * `html, body { overflow: clip }` 能挡普通滚动，但 Chrome 在
   * `scrollIntoView()` / 文件选择器把按钮拉进视口时仍可能滚 window（实测 +49px），
   * 而且 editor 本身是固定视口，window 本来就不该动。这里在 scroll 回调里把
   * 非零位置拉回 0；卸载时恢复进入编辑器前的位置，避免影响返回列表。
   */
  useEffect(() => {
    const previousX = window.scrollX;
    const previousY = window.scrollY;
    const pinWindow = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    pinWindow();
    window.addEventListener("scroll", pinWindow, { passive: true });
    return () => {
      window.removeEventListener("scroll", pinWindow);
      window.scrollTo(previousX, previousY);
    };
  }, []);

  function closeSettingsSheet() {
    setSheetOpen(false);
  }

  /**
   * 文件选择器会把 input 滚进视口，浏览器会连**外层 sheet 容器**一起滚动；
   * `overflow:hidden` 只挡用户滚动，不挡程序化滚动，所以要在打开前记下两层位置，
   * 选完后恢复。`rail-body` 才是唯一允许滚动的容器，`rail` 本身保持 0。
   */
  function rememberSheetScroll() {
    pickerScrollRef.current = {
      rail: railRef.current?.scrollTop ?? 0,
      body: railBodyRef.current?.scrollTop ?? 0,
      // 编辑器是固定视口，window 的正确位置就是 0；这里明确存 0，避免把异常滚动位置带回来。
      windowY: 0,
    };
  }

  function restoreSheetScroll() {
    const saved = pickerScrollRef.current;
    if (!saved) {
      return;
    }
    if (railRef.current) {
      railRef.current.scrollTop = saved.rail;
    }
    if (railBodyRef.current) {
      railBodyRef.current.scrollTop = saved.body;
    }
    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo(0, saved.windowY);
    }
  }

  function openCoverPicker() {
    rememberSheetScroll();
    coverInputRef.current?.click();
  }

  function openBannerPicker() {
    rememberSheetScroll();
    bannerInputRef.current?.click();
  }

  /** 选完文件后把焦点还给触发按钮，避免浏览器把焦点留在文件 input 上继续滚页面。 */
  function restorePickerFocus(trigger: HTMLButtonElement | null) {
    requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
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
      const url = editorImageUrl(uploaded);
      // 换封面时把上一张的本机预览回收掉（谁创建谁回收）；与 Banner 共用同一张时不能误回收
      if (cover !== bannerImage) {
        releaseLocalPreview(cover);
      }
      setCoverPreview(registerLocalPreview(file, url) ?? "");
      setCover(url);
      setCoverStyle("image");
    } catch (caught) {
      if (caught instanceof UploadCancelledError) {
        return;
      }
      setError(caught instanceof Error ? caught.message : "封面上传失败");
    } finally {
      requestAnimationFrame(() => {
        restoreSheetScroll();
        pickerScrollRef.current = null;
      });
    }
  }

  async function handleBannerImage(file: File | undefined) {
    if (!file) {
      return;
    }
    try {
      const uploaded = await uploadAdminFile(file, "image", undefined, {
        defer: true,
      });
      const url = editorImageUrl(uploaded);
      if (bannerImage !== cover) {
        releaseLocalPreview(bannerImage);
      }
      setBannerImagePreview(registerLocalPreview(file, url) ?? "");
      setBannerImage(url);
      setBannerStyle("image");
    } catch (caught) {
      if (caught instanceof UploadCancelledError) {
        return;
      }
      setError(caught instanceof Error ? caught.message : "Banner 上传失败");
    } finally {
      requestAnimationFrame(() => {
        restoreSheetScroll();
        pickerScrollRef.current = null;
      });
    }
  }

  function handleRemoveCover() {
    if (cover !== bannerImage) {
      releaseLocalPreview(cover);
    }
    setCoverPreview("");
    setCover("");
    setCoverStyle("none");
    if (coverInputRef.current) {
      coverInputRef.current.value = "";
    }
  }

  function handleRemoveBanner() {
    if (bannerImage !== cover) {
      releaseLocalPreview(bannerImage);
    }
    setBannerImagePreview("");
    setBannerImage("");
    if (bannerInputRef.current) {
      bannerInputRef.current.value = "";
    }
    // 删除 Banner 不留下白顶：落一张随机混色，仍可继续改成纯色或换图。
    const next = randomBannerGradient();
    setBannerColor(next.color);
    setBannerColor2(next.color2);
    setBannerStyle("gradient");
  }

  function handleCoverStyleChange(next: "image" | "solid" | "gradient" | "none") {
    if (next === "none") {
      handleRemoveCover();
      return;
    }
    setCoverStyle(next);
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
      let nextBannerImage = bannerImage;
      if (publishing) {
        const hashes = collectMediaHashes(content, cover, bannerImage);
        const finalized = await finalizeAdminUploads(hashes);
        const coverHash = firstMediaHash(cover);
        const coverMatch = coverHash
          ? finalized.find((item) => item.hash === coverHash)
          : undefined;
        if (coverMatch) {
          nextCover = editorImageUrl(coverMatch);
          // 发布后封面已经有对外的 COS / 站内地址，本机 blob 预览可以收了
          releaseLocalPreview(cover);
          setCoverPreview("");
          setCover(nextCover);
        }
        const bannerHash = firstMediaHash(bannerImage);
        const bannerMatch = bannerHash
          ? finalized.find((item) => item.hash === bannerHash)
          : undefined;
        if (bannerMatch) {
          nextBannerImage = editorImageUrl(bannerMatch);
          releaseLocalPreview(bannerImage);
          setBannerImagePreview("");
          setBannerImage(nextBannerImage);
        }
      }

      const payload: Record<string, unknown> = {
        title,
        slug: slug || null,
        authorName: authorName.trim() || null,
        content,
        excerpt: excerpt || null,
        cover: nextCover || null,
        coverStyle,
        coverColor: coverStyle === "solid" || coverStyle === "gradient" ? coverColor : null,
        coverColor2: coverStyle === "gradient" ? coverColor2 : null,
        bannerStyle,
        bannerImage: nextBannerImage || null,
        bannerColor: bannerStyle === "solid" || bannerStyle === "gradient" ? bannerColor : null,
        bannerColor2: bannerStyle === "gradient" ? bannerColor2 : null,
        coverFocalX,
        coverFocalY,
        bannerFocalX,
        bannerFocalY,
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
        ref={railRef}
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
        <div className="post-workspace__rail-body" ref={railBodyRef}>
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
            <section className="admin-media-editor">
              <div className="admin-media-editor__head">
                <strong>封面</strong>
                <span className="admin-muted">列表卡片：图片或纯色/混色，独立于 Banner</span>
              </div>
              <div className="admin-chip-row" role="radiogroup" aria-label="封面形态">
                {(
                  [
                    ["image", "图片"],
                    ["solid", "纯色"],
                    ["gradient", "混色"],
                    ["none", "无封面"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    className={cn("admin-chip", coverStyle === value && "is-on")}
                    key={value}
                  >
                    <input
                      checked={coverStyle === value}
                      name="coverStyle"
                      onChange={() => handleCoverStyleChange(value)}
                      type="radio"
                      value={value}
                    />
                    {label}
                  </label>
                ))}
              </div>

              {coverStyle === "image" ? (
                <div className="admin-cover-editor">
                  {coverVisual.kind === "image" ? (
                    <div className="admin-cover-preview">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt="封面预览"
                        className="admin-cover-preview__img"
                        src={coverSrc}
                        style={{
                          objectPosition: focalPosition(coverFocalX, coverFocalY),
                        }}
                      />
                    </div>
                  ) : (
                    <span className="admin-cover-empty">还没有封面图</span>
                  )}
                  <div className="admin-cover-actions">
                    <input
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      aria-hidden="true"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = "";
                        restorePickerFocus(coverTriggerRef.current);
                        void handleCover(file);
                      }}
                      ref={coverInputRef}
                      tabIndex={-1}
                      type="file"
                    />
                    <button
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={openCoverPicker}
                      ref={coverTriggerRef}
                      type="button"
                    >
                      {coverVisual.kind === "image" ? "更换封面图" : "选择封面图"}
                    </button>
                    <button
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={handleRemoveCover}
                      type="button"
                    >
                      删除封面
                    </button>
                  </div>
                  {coverVisual.kind === "image" ? (
                    <FocalControls
                      label="列表封面"
                      onChangeX={setCoverFocalX}
                      onChangeY={setCoverFocalY}
                      x={coverFocalX}
                      y={coverFocalY}
                    />
                  ) : null}
                </div>
              ) : coverStyle === "solid" || coverStyle === "gradient" ? (
                <div className="admin-cover-editor">
                  <div
                    aria-hidden="true"
                    className="admin-cover-preview"
                    style={{
                      background:
                        coverVisual.kind === "fill"
                          ? coverVisual.background
                          : "var(--admin-surface-2)",
                    }}
                  />
                  <div className="admin-field-row">
                    <label className="admin-field">
                      {coverStyle === "gradient" ? "起始色" : "颜色"}
                      <input
                        onChange={(event) => setCoverColor(event.target.value)}
                        type="color"
                        value={coverColor}
                      />
                    </label>
                    {coverStyle === "gradient" ? (
                      <label className="admin-field">
                        结束色
                        <input
                          onChange={(event) => setCoverColor2(event.target.value)}
                          type="color"
                          value={coverColor2}
                        />
                      </label>
                    ) : null}
                  </div>
                  <div className="admin-cover-actions">
                    <button
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={handleRemoveCover}
                      type="button"
                    >
                      删除封面
                    </button>
                  </div>
                </div>
              ) : (
                <p className="admin-muted">
                  当前没有封面：列表里走细条卡，只显示标题和文章开头。
                </p>
              )}
            </section>

            <section className="admin-media-editor">
              <div className="admin-media-editor__head">
                <strong>Banner</strong>
                <span className="admin-muted">文章详情顶图，可以单独设置，也可以直接复用封面</span>
              </div>
              <div className="admin-chip-row" role="radiogroup" aria-label="Banner 形态">
                {(
                  [
                    ["cover", "与封面一致"],
                    ["image", "单独图片"],
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

              {bannerStyle === "cover" ? (
                <p className="admin-muted">
                  复用封面的图片或配色，不用重复上传；封面换成纯色/混色时 Banner 也跟着换。
                </p>
              ) : null}

              {bannerStyle === "image" ? (
                <div className="admin-cover-editor">
                  {bannerVisual.kind === "image" && !bannerNeedsImage ? (
                    <div className="admin-banner-preview admin-banner-preview--editor">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt="Banner 预览"
                        className="admin-banner-preview__image"
                        src={bannerVisual.src}
                        style={{
                          objectPosition: focalPosition(bannerFocalX, bannerFocalY),
                        }}
                      />
                    </div>
                  ) : (
                    <span className="admin-cover-empty">还没有 Banner 图</span>
                  )}
                  <div className="admin-cover-actions">
                    <input
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      aria-hidden="true"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = "";
                        restorePickerFocus(bannerTriggerRef.current);
                        void handleBannerImage(file);
                      }}
                      ref={bannerInputRef}
                      tabIndex={-1}
                      type="file"
                    />
                    <button
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={openBannerPicker}
                      ref={bannerTriggerRef}
                      type="button"
                    >
                      {bannerVisual.kind === "image" && !bannerNeedsImage
                        ? "更换 Banner 图"
                        : "选择 Banner 图"}
                    </button>
                  </div>
                </div>
              ) : null}

              {bannerStyle === "solid" || bannerStyle === "gradient" ? (
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
                    !bannerNeedsImage && bannerVisual.kind === "fill"
                      ? bannerVisual.background
                      : "var(--admin-surface-2)",
                }}
              >
                {!bannerNeedsImage && bannerVisual.kind === "image" ? (
                  // 与前台 CoverMedia 同口径：object-fit + object-position，不用 background。
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="admin-banner-preview__image"
                    src={bannerVisual.src}
                    style={{ objectPosition: focalPosition(bannerFocalX, bannerFocalY) }}
                  />
                ) : null}
              </div>

              {!bannerNeedsImage && bannerVisual.kind === "image" ? (
                <FocalControls
                  label="Banner"
                  onChangeX={setBannerFocalX}
                  onChangeY={setBannerFocalY}
                  x={bannerFocalX}
                  y={bannerFocalY}
                />
              ) : null}

              <div className="admin-cover-actions">
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={handleRemoveBanner}
                  type="button"
                >
                  删除 Banner（恢复随机混色）
                </button>
              </div>
            </section>
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
