"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ExternalLinkIcon,
  GearIcon,
  UploadIcon,
} from "@radix-ui/react-icons";

import { adminJson } from "@/lib/client/admin";
import { BLOCK_LIBRARY, builtinDefinition } from "@/lib/home/builtins";
import {
  colorInputValue,
  MODULE_ALIGN_LABELS,
  MODULE_FONT_LABELS,
  MODULE_STYLE_LIMITS,
  normalizeModuleStyle,
  type ModuleStyle,
} from "@/lib/home/style";
import { moduleTemplate } from "@/lib/home/templates";
import type {
  BuiltinModuleKey,
  HomeBlock,
  HomeBlockType,
  HomeModuleConfig,
  HomeModuleView,
} from "@/lib/home/types";
import { cn } from "@/lib/utils/cn";

type CodeTab = "html" | "css" | "js";

const CODE_TABS: ReadonlyArray<{ id: CodeTab; label: string; hint: string }> = [
  {
    id: "html",
    label: "HTML",
    hint: "原样插入模块。内联 <script> 不会执行（浏览器语义），要跑脚本写进 JS 栏。",
  },
  { id: "css", label: "CSS", hint: "写在模块里的样式；勾了「只作用于本模块」就自动限定在它内部。" },
  { id: "js", label: "JS", hint: "在浏览器执行，外面套了 try/catch，出错只打印日志、不连坐整页。" },
];

const CODE_MAX = 32_768;

const NEEDS_TEXT: ReadonlySet<HomeBlockType> = new Set([
  "heading",
  "text",
  "html",
  "button",
]);
const NEEDS_LIMIT: ReadonlySet<HomeBlockType> = new Set([
  "postList",
  "postGrid",
  "recent",
]);

function blockLabel(type: HomeBlockType) {
  return BLOCK_LIBRARY.find((item) => item.type === type)?.label ?? type;
}

type StyleField =
  | { kind: "color"; name: keyof ModuleStyle; label: string; fallback: string }
  | { kind: "number"; name: keyof ModuleStyle; label: string; min: number; max: number; unit: string }
  | { kind: "text"; name: keyof ModuleStyle; label: string; placeholder?: string }
  | { kind: "font" | "align" | "toggle"; name: keyof ModuleStyle; label: string };

const STYLE_GROUPS: ReadonlyArray<{ title: string; hint?: string; fields: StyleField[] }> = [
  {
    title: "排版",
    hint: "字号与对齐作用在文字容器上，用户自己写的 CSS 仍然优先。",
    fields: [
      { kind: "font", name: "fontFamily", label: "字体" },
      {
        kind: "number",
        name: "fontSize",
        label: "基准字号",
        min: MODULE_STYLE_LIMITS.fontSize.min,
        max: MODULE_STYLE_LIMITS.fontSize.max,
        unit: "px",
      },
      { kind: "align", name: "align", label: "对齐" },
    ],
  },
  {
    title: "配色",
    hint: "选「跟随主题」就用站点自己的颜色；改了才会覆盖这一个模块。",
    fields: [
      { kind: "color", name: "textColor", label: "正文颜色", fallback: "#8a8a8a" },
      { kind: "color", name: "headingColor", label: "标题颜色", fallback: "#1f1f1f" },
      { kind: "color", name: "background", label: "背景色", fallback: "#ffffff" },
      { kind: "color", name: "accent", label: "强调色", fallback: "#4db8e8" },
      { kind: "text", name: "bgImage", label: "背景图地址", placeholder: "留空不用（本地上传或 https）" },
      {
        kind: "number",
        name: "bgDim",
        label: "背景图压暗",
        min: MODULE_STYLE_LIMITS.bgDim.min,
        max: MODULE_STYLE_LIMITS.bgDim.max,
        unit: "%",
      },
    ],
  },
  {
    title: "圆角与留白",
    fields: [
      {
        kind: "number",
        name: "radius",
        label: "圆角",
        min: MODULE_STYLE_LIMITS.radius.min,
        max: MODULE_STYLE_LIMITS.radius.max,
        unit: "px",
      },
      {
        kind: "number",
        name: "padding",
        label: "内边距",
        min: MODULE_STYLE_LIMITS.padding.min,
        max: MODULE_STYLE_LIMITS.padding.max,
        unit: "px",
      },
      { kind: "toggle", name: "shadow", label: "投影（默认开）" },
    ],
  },
  {
    title: "按钮",
    hint: "作用于前缀是 heo-button 的按钮，以及你自己写 HTML 时用的 var(--mod-btn-bg)。",
    fields: [
      { kind: "color", name: "buttonText", label: "按钮底色", fallback: "#4db8e8" },
      { kind: "color", name: "buttonTextColor", label: "按钮文字色", fallback: "#ffffff" },
      {
        kind: "number",
        name: "buttonRadius",
        label: "按钮圆角",
        min: MODULE_STYLE_LIMITS.buttonRadius.min,
        max: MODULE_STYLE_LIMITS.buttonRadius.max,
        unit: "px",
      },
      { kind: "toggle", name: "buttonFull", label: "按钮占满一行" },
    ],
  },
];

export function ModuleEditor({
  module,
  preview,
}: {
  module: HomeModuleView;
  /** 服务端预渲染的真实观感（含文章/瞬间等真数据）；改完保存后刷新即可看到新样子 */
  preview: ReactNode;
}) {
  const router = useRouter();
  const definition = builtinDefinition(module.builtinKey as BuiltinModuleKey | null);
  const template = moduleTemplate(module.builtinKey ?? undefined);
  const custom = module.kind === "custom";
  /** 「可编辑的内置模块」（推荐应用）：结构还是内置，但代码与样式对用户开放 */
  const editable = custom || Boolean(definition?.editable);
  const codeEditable = custom || Boolean(definition?.editable);

  const [name, setName] = useState(module.name);
  const [blocks, setBlocks] = useState<HomeBlock[]>(module.blocks);
  const [html, setHtml] = useState(module.html);
  const [css, setCss] = useState(module.css);
  const [js, setJs] = useState(module.js);
  const [config, setConfig] = useState<HomeModuleConfig>(module.config);
  const [style, setStyle] = useState<ModuleStyle>(
    normalizeModuleStyle(module.config.style),
  );
  const [tab, setTab] = useState<CodeTab>("html");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const codeValue = tab === "html" ? html : tab === "css" ? css : js;
  const setCodeValue = tab === "html" ? setHtml : tab === "css" ? setCss : setJs;
  const activeHint = CODE_TABS.find((item) => item.id === tab)?.hint;
  const overLimit = codeValue.length > CODE_MAX;

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

  function markDirty() {
    setSaved(false);
    setNote("");
  }

  function patchStyle(patch: ModuleStyle) {
    const next: ModuleStyle = { ...style };
    for (const [key, value] of Object.entries(patch) as Array<
      [keyof ModuleStyle, ModuleStyle[keyof ModuleStyle]]
    >) {
      // 空值等于「跟随主题」：直接删键。留个空串不但会被 API 的 zod 判成非法颜色，
      // 而且「没配过」必须与「配成默认值」区分开（见 lib/home/style.ts）
      if (value === "" || value === undefined || value === null) {
        delete next[key];
        continue;
      }
      next[key] = value as never;
    }
    setStyle(next);
    markDirty();
  }

  function addBlock(type: HomeBlockType) {
    setBlocks((current) => [
      ...current,
      {
        id: `b${Date.now().toString(36)}${current.length}`,
        type,
        ...(type === "heading" ? { level: 2 as const, text: "标题" } : {}),
        ...(type === "text" ? { text: "一段文字。" } : {}),
        ...(type === "button" ? { text: "查看更多", href: "/posts" } : {}),
        ...(NEEDS_LIMIT.has(type) ? { limit: 3, source: "latest" as const } : {}),
      },
    ]);
    markDirty();
  }

  function patchBlock(id: string, patch: Partial<HomeBlock>) {
    setBlocks((current) =>
      current.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    );
    markDirty();
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) {
      return;
    }
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    setBlocks(next);
    markDirty();
  }

  async function save() {
    setError("");
    if (overLimit) {
      setError(`当前这一栏超过 ${CODE_MAX} 字符，先删一点再保存。`);
      return;
    }
    setSaving(true);
    try {
      const nextConfig: HomeModuleConfig = {
        ...config,
        ...(Object.keys(style).length > 0 ? { style } : { style: undefined }),
      };
      await adminJson(`/api/admin/modules/${module.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          config: nextConfig,
          ...(codeEditable ? { html, css, js } : {}),
          ...(custom ? { blocks } : {}),
        }),
      });
      setSaved(true);
      setNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  /** 导入本机文件：HTML 里的 <style> / <script> 会被拆到对应栏。 */
  async function importFile(file: File) {
    setError("");
    setNote("");
    try {
      if (file.size > 512 * 1024) {
        setError("文件超过 512KB，先精简一下再导入。");
        return;
      }
      const content = await file.text();
      const result = await adminJson<{
        data: { field: CodeTab; html: string; css: string; js: string; notes: string[] };
      }>("/api/admin/modules/import", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, content }),
      });

      const payload = result.data;
      if (payload.html) {
        setHtml(payload.html);
      }
      if (payload.css) {
        setCss(payload.css);
      }
      if (payload.js) {
        setJs(payload.js);
      }
      setTab(payload.field);
      markDirty();
      const target =
        payload.field === "html" ? "HTML" : payload.field === "css" ? "CSS" : "JS";
      setNote(
        [`已导入 ${file.name}，内容进了${target}栏`, ...(payload.notes ?? [])].join(" · "),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入失败");
    }
  }

  /** 可编辑内置模块：把出厂代码写回表单（结构性动作，只改当前编辑态，保存才落库）。 */
  function restoreDefaultCode() {
    const fallback = definition?.defaultCode;
    setHtml(fallback?.html ?? "");
    setCss(fallback?.css ?? "");
    setJs(fallback?.js ?? "");
    markDirty();
    setNote("已填回出厂代码，点「保存模块」才会生效。");
  }

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

  return (
    <div className={cn("post-workspace", sheetOpen && "is-sheet")}>
      {sheetOpen ? (
        <button
          aria-label="关闭设置"
          className="admin-dialog__backdrop admin-settings-sheet"
          onClick={closeSettingsSheet}
          type="button"
        />
      ) : null}
      <aside
        aria-labelledby={sheetOpen ? "module-settings-title" : undefined}
        aria-modal={sheetOpen || undefined}
        className={cn("post-workspace__rail", !settingsOpen && "is-collapsed")}
        role={sheetOpen ? "dialog" : undefined}
      >
        <div className="post-workspace__rail-head">
          <span className="admin-dialog__grab post-workspace__sheet-grab" />
          <p className="post-workspace__sheet-title" id="module-settings-title">
            模块设置
          </p>
          <button
            aria-expanded={sheetOpen ? true : settingsOpen}
            className="admin-pane-toggle"
            onClick={toggleSettingsPane}
            title={sheetOpen ? "关闭设置" : settingsOpen ? "收起设置" : "展开设置"}
            type="button"
          >
            <span aria-hidden="true" className="admin-pane-toggle__icon" />
            <span className="visually-hidden">
              {sheetOpen ? "关闭设置" : settingsOpen ? "收起设置" : "展开设置"}
            </span>
          </button>
        </div>
        <div className="post-workspace__rail-body">
          <label className="admin-field">
            模块名称
            <input onChange={(event) => { setName(event.target.value); markDirty(); }} value={name} />
          </label>

          <p className="admin-muted">
            {custom ? (
              <>
                自建模块
                {template ? `（由「${template.name}」模板建）` : ""}：
                可以改名称、样式、积木与代码。
              </>
            ) : editable ? (
              <>
                这是可编辑的内置模块（{definition?.name ?? module.builtinKey}）：
                外壳（{definition?.floating ? "出场边、延迟、关闭方式" : "尺寸与位置"}）在{" "}
                <Link href="/admin/home">首页管理</Link> 里调；这里也能直接改它的 HTML / CSS / JS
                与基本样式。
              </>
            ) : (
              <>
                这是内置模块（{definition?.name ?? module.builtinKey}）。
                它的展示选项在 <Link href="/admin/home">首页管理</Link> 左栏调整，
                这里只能改名称。
              </>
            )}
          </p>

          {editable ? (
            <>
              <p className="admin-muted">
                写模块代码的完整说明见仓库里的{" "}
                <code>docs/module-html-guide.md</code>（写作指南：可用变量、能用的类名、
                常见坑）。
              </p>

              <StylePanel onChange={patchStyle} style={style} />

              {custom ? (
                <>
                  <label className="home-editor__toggle">
                    <input
                      checked={config.card !== false}
                      onChange={(event) => {
                        setConfig((current) => ({ ...current, card: event.target.checked }));
                        markDirty();
                      }}
                      type="checkbox"
                    />
                    外层套玻璃卡片
                  </label>
                  <label className="home-editor__toggle">
                    <input
                      checked={config.floating === true}
                      onChange={(event) => {
                        setConfig((current) => ({
                          ...current,
                          floating: event.target.checked,
                        }));
                        markDirty();
                      }}
                      type="checkbox"
                    />
                    覆盖层（浮在页面上，不占格点）
                  </label>
                  <label className="home-editor__toggle">
                    <input
                      checked={config.scopedCss !== false}
                      onChange={(event) => {
                        setConfig((current) => ({ ...current, scopedCss: event.target.checked }));
                        markDirty();
                      }}
                      type="checkbox"
                    />
                    CSS 只作用于本模块
                  </label>

                  <section className="module-blocks">
                    <h3>积木</h3>
                    <div className="module-blocks__library">
                      {BLOCK_LIBRARY.map((item) => (
                        <button
                          className="admin-toolbar-button"
                          key={item.type}
                          onClick={() => addBlock(item.type)}
                          title={item.hint}
                          type="button"
                        >
                          + {item.label}
                        </button>
                      ))}
                    </div>
                    {blocks.length === 0 ? (
                      <p className="admin-muted">
                        还没有积木。也可以只写右边的 HTML / CSS / JS。
                      </p>
                    ) : (
                      <ul className="module-blocks__list">
                        {blocks.map((block, index) => (
                          <li key={block.id}>
                            <div className="module-blocks__bar">
                              <strong>{blockLabel(block.type)}</strong>
                              <div className="module-blocks__tools">
                                <button onClick={() => moveBlock(index, -1)} type="button">
                                  上移
                                </button>
                                <button onClick={() => moveBlock(index, 1)} type="button">
                                  下移
                                </button>
                                <button
                                  onClick={() => {
                                    setBlocks((current) =>
                                      current.filter((item) => item.id !== block.id),
                                    );
                                    markDirty();
                                  }}
                                  type="button"
                                >
                                  删除
                                </button>
                              </div>
                            </div>

                            {NEEDS_TEXT.has(block.type) ? (
                              <label className="admin-field">
                                {block.type === "html" ? "HTML 片段" : "文字"}
                                <textarea
                                  onChange={(event) =>
                                    patchBlock(block.id, { text: event.target.value })
                                  }
                                  rows={block.type === "heading" ? 1 : 3}
                                  value={block.text ?? ""}
                                />
                              </label>
                            ) : null}

                            {block.type === "heading" ? (
                              <label className="admin-field">
                                级别
                                <select
                                  onChange={(event) =>
                                    patchBlock(block.id, {
                                      level: Number(event.target.value) as 1 | 2 | 3 | 4,
                                    })
                                  }
                                  value={block.level ?? 2}
                                >
                                  {[1, 2, 3, 4].map((level) => (
                                    <option key={level} value={level}>
                                      h{level}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : null}

                            {block.type === "button" ? (
                              <label className="admin-field">
                                链接
                                <input
                                  onChange={(event) =>
                                    patchBlock(block.id, { href: event.target.value })
                                  }
                                  value={block.href ?? ""}
                                />
                              </label>
                            ) : null}

                            {block.type === "image" ? (
                              <>
                                <label className="admin-field">
                                  图片地址
                                  <input
                                    onChange={(event) =>
                                      patchBlock(block.id, { src: event.target.value })
                                    }
                                    value={block.src ?? ""}
                                  />
                                </label>
                                <label className="admin-field">
                                  替代文字
                                  <input
                                    onChange={(event) =>
                                      patchBlock(block.id, { alt: event.target.value })
                                    }
                                    value={block.alt ?? ""}
                                  />
                                </label>
                              </>
                            ) : null}

                            {NEEDS_LIMIT.has(block.type) ? (
                              <div className="admin-field-row">
                                <label className="admin-field">
                                  条数
                                  <input
                                    max={12}
                                    min={1}
                                    onChange={(event) =>
                                      patchBlock(block.id, {
                                        limit: Number(event.target.value),
                                      })
                                    }
                                    type="number"
                                    value={block.limit ?? 3}
                                  />
                                </label>
                                <label className="admin-field">
                                  来源
                                  <select
                                    onChange={(event) =>
                                      patchBlock(block.id, {
                                        source: event.target.value as "latest" | "recommend",
                                      })
                                    }
                                    value={block.source ?? "latest"}
                                  >
                                    <option value="latest">最新发布</option>
                                    <option value="recommend">首页推荐</option>
                                  </select>
                                </label>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              ) : null}
            </>
          ) : null}

          {error ? (
            <p className="admin-error" role="alert">
              {error}
            </p>
          ) : null}
          {note ? <p className="admin-muted">{note}</p> : null}
          <button
            className="admin-btn"
            disabled={saving || overLimit}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "保存中…" : saved ? "已保存" : "保存模块"}
          </button>
        </div>
      </aside>

      <div className="post-workspace__stage">
        <div className="post-workspace__titlebar">
          <div className="post-workspace__title">
            <strong>{name || "未命名模块"}</strong>
            <span className="admin-muted">
              {module.system ? "内置" : "自建"} · {module.slug}
            </span>
          </div>
          <button
            aria-expanded={sheetOpen}
            className="admin-btn admin-btn--ghost admin-editor-settings"
            onClick={openSettingsSheet}
            type="button"
          >
            <GearIcon />
            设置
          </button>
          {editable ? (
            <div className="module-code__tabs">
              {CODE_TABS.map((item) => (
                <button
                  className={cn("admin-toolbar-button", tab === item.id && "is-active")}
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {editable ? (
          <>
            <p className="post-workspace__hint">
              这三栏会直接注入前台：HTML 原样插入、
              {config.scopedCss === false ? "CSS 全站生效" : "CSS 限定在本模块内"}
              、JS 在浏览器执行。只有管理员能写，出错只影响本模块。
            </p>
            <div className="module-import">
              <button
                className="admin-btn admin-btn--ghost"
                onClick={() => fileRef.current?.click()}
                type="button"
              >
                <UploadIcon /> 导入文件
              </button>
              <span className="admin-muted">.html / .htm / .css / .js / .txt，各栏各 32KB</span>
              {definition?.defaultCode ? (
                <button
                  className="admin-btn admin-btn--ghost"
                  onClick={restoreDefaultCode}
                  type="button"
                >
                  填回出厂代码
                </button>
              ) : null}
              <input
                accept=".html,.htm,.css,.js,.mjs,.cjs,.txt,text/html,text/css,text/javascript"
                className="visually-hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void importFile(file);
                  }
                }}
                ref={fileRef}
                type="file"
              />
            </div>
            <div className="module-code">
              <p className="admin-muted">{activeHint}</p>
              <textarea
                onChange={(event) => {
                  setCodeValue(event.target.value);
                  markDirty();
                }}
                placeholder={
                  tab === "html"
                    ? '<div class="my-hero">Hello</div>'
                    : tab === "css"
                      ? ".my-hero { color: var(--heo-theme); }"
                      : "console.log('hello from module');"
                }
                spellCheck={false}
                value={codeValue}
              />
              <p className={overLimit ? "admin-error" : "admin-muted"}>
                {codeValue.length} / {CODE_MAX} 字符
              </p>
            </div>

            <PreviewPane preview={preview} />
          </>
        ) : (
          <div className="post-workspace__preview">
            <p className="admin-muted">内置模块没有可编辑代码。</p>
          </div>
        )}

        <div className="post-workspace__footer">
          <span className="admin-muted">
            预览的是电脑宽度下的观感；手机档的版式由你自己的 @media 控制。
          </span>
          <a
            className="admin-btn admin-btn--ghost"
            href="/"
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLinkIcon /> 打开首页
          </a>
        </div>
      </div>
    </div>
  );
}

/** 预览：直接复用前台渲染出来的观感（服务端预渲染，含真实数据）。 */
function PreviewPane({ preview }: { preview: ReactNode }) {
  return (
    <section className="module-editor">
      <div className="module-editor__preview" data-vp="desktop">
        {preview}
      </div>
      <p className="admin-muted">
        预览是前台真实观感（含文章与瞬间的真实数据）。改完点「保存模块」，刷新后才是新样子。
      </p>
    </section>
  );
}

/** 基本样式面板：每个字段旁都有「清空」，清掉即跟随站点主题。 */
function StylePanel({
  style,
  onChange,
}: {
  style: ModuleStyle;
  onChange: (next: ModuleStyle) => void;
}) {
  function update(patch: ModuleStyle) {
    onChange({ ...style, ...patch });
  }

  return (
    <section className="module-style">
      <h3>基本样式</h3>
      {STYLE_GROUPS.map((group) => (
        <div className="module-style__grid" key={group.title}>
          <p className="admin-muted">{group.title}</p>
          {group.hint ? <p className="admin-muted">{group.hint}</p> : null}
          {group.fields.map((field) => (
            <StyleFieldRow
              field={field}
              key={String(field.name)}
              onChange={update}
              style={style}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function StyleFieldRow({
  field,
  style,
  onChange,
}: {
  field: StyleField;
  style: ModuleStyle;
  onChange: (patch: ModuleStyle) => void;
}) {
  const value = style[field.name];
  const clear = (
    <button
      className="admin-toolbar-button"
      onClick={() => onChange({ [field.name]: undefined } as ModuleStyle)}
      title="清空，改回跟随站点主题"
      type="button"
    >
      清空
    </button>
  );

  if (field.kind === "color") {
    const current = typeof value === "string" ? value : "";
    return (
      <div className="admin-field">
        <span>{field.label}</span>
        <div className="module-style__color">
          <input
            aria-label={`${field.label}色块`}
            onChange={(event) => onChange({ [field.name]: event.target.value } as ModuleStyle)}
            type="color"
            value={colorInputValue(current || undefined, field.fallback)}
          />
          <input
            onChange={(event) =>
              onChange({ [field.name]: event.target.value.trim() } as ModuleStyle)
            }
            placeholder="跟随主题"
            value={current}
          />
        </div>
        <div className="admin-btn-row">{clear}</div>
      </div>
    );
  }

  if (field.kind === "number") {
    const current = typeof value === "number" ? value : "";
    return (
      <div className="admin-field">
        <span>{field.label}</span>
        <div className="module-style__range">
          <input
            aria-label={field.label}
            max={field.max}
            min={field.min}
            onChange={(event) =>
              onChange({ [field.name]: Number(event.target.value) } as ModuleStyle)
            }
            type="range"
            value={current === "" ? field.min : current}
          />
          <input
            max={field.max}
            min={field.min}
            onChange={(event) =>
              onChange({
                [field.name]: event.target.value === "" ? undefined : Number(event.target.value),
              } as ModuleStyle)
            }
            type="number"
            value={current}
          />
        </div>
        <div className="admin-btn-row">{clear}</div>
      </div>
    );
  }

  if (field.kind === "text") {
    return (
      <label className="admin-field">
        {field.label}
        <input
          onChange={(event) => onChange({ [field.name]: event.target.value.trim() } as ModuleStyle)}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
        />
        <span className="admin-btn-row">{clear}</span>
      </label>
    );
  }

  if (field.kind === "font") {
    return (
      <label className="admin-field">
        {field.label}
        <select
          onChange={(event) => onChange({ fontFamily: event.target.value as ModuleStyle["fontFamily"] })}
          value={style.fontFamily ?? "inherit"}
        >
          {MODULE_FONT_LABELS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === "align") {
    return (
      <label className="admin-field">
        {field.label}
        <select
          onChange={(event) => onChange({ align: event.target.value as ModuleStyle["align"] })}
          value={style.align ?? "left"}
        >
          {MODULE_ALIGN_LABELS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // toggle：`shadow` 的「没写过」等于开，`buttonFull` 的「没写过」等于关
  const isShadow = field.name === "shadow";
  const checked = isShadow ? value !== false : value === true;
  return (
    <label className="home-editor__toggle">
      <input
        checked={checked}
        onChange={(event) =>
          onChange({
            [field.name]: isShadow ? (event.target.checked ? undefined : false) : event.target.checked,
          } as ModuleStyle)
        }
        type="checkbox"
      />
      {field.label}
    </label>
  );
}
