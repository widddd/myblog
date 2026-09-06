"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminJson } from "@/lib/client/admin";
import { BLOCK_LIBRARY, builtinDefinition } from "@/lib/home/builtins";
import type {
  BuiltinModuleKey,
  HomeBlock,
  HomeBlockType,
  HomeModuleConfig,
  HomeModuleView,
} from "@/lib/home/types";
import { cn } from "@/lib/utils/cn";

type CodeTab = "html" | "css" | "js";

const CODE_TABS: ReadonlyArray<{ id: CodeTab; label: string }> = [
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "js", label: "JS" },
];

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

export function ModuleEditor({ module }: { module: HomeModuleView }) {
  const router = useRouter();
  const custom = module.kind === "custom";
  const definition = builtinDefinition(module.builtinKey as BuiltinModuleKey | null);

  const [name, setName] = useState(module.name);
  const [blocks, setBlocks] = useState<HomeBlock[]>(module.blocks);
  const [html, setHtml] = useState(module.html);
  const [css, setCss] = useState(module.css);
  const [js, setJs] = useState(module.js);
  const [config, setConfig] = useState<HomeModuleConfig>(module.config);
  const [tab, setTab] = useState<CodeTab>("html");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
  }

  function patchBlock(id: string, patch: Partial<HomeBlock>) {
    setBlocks((current) =>
      current.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    );
    setSaved(false);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) {
      return;
    }
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    setBlocks(next);
    setSaved(false);
  }

  async function save() {
    setError("");
    setSaving(true);
    try {
      await adminJson(`/api/admin/modules/${module.id}`, {
        method: "PATCH",
        body: JSON.stringify(
          custom
            ? { name, blocks, html, css, js, config }
            : { name, config },
        ),
      });
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const codeValue = tab === "html" ? html : tab === "css" ? css : js;
  const setCodeValue =
    tab === "html" ? setHtml : tab === "css" ? setCss : setJs;

  return (
    <div className="post-workspace">
      <aside
        className={cn("post-workspace__rail", !settingsOpen && "is-collapsed")}
      >
        <div className="post-workspace__rail-head">
          <button
            aria-expanded={settingsOpen}
            className="admin-pane-toggle"
            onClick={() => setSettingsOpen((current) => !current)}
            title={settingsOpen ? "收起设置" : "展开设置"}
            type="button"
          >
            <span aria-hidden="true" className="admin-pane-toggle__icon" />
            <span className="visually-hidden">
              {settingsOpen ? "收起设置" : "展开设置"}
            </span>
          </button>
        </div>
        <div className="post-workspace__rail-body">
          <label className="form-field">
            模块名称
            <input onChange={(event) => setName(event.target.value)} value={name} />
          </label>

          {custom ? (
            <>
              <label className="home-editor__toggle">
                <input
                  checked={config.card !== false}
                  onChange={(event) => {
                    setConfig((current) => ({
                      ...current,
                      card: event.target.checked,
                    }));
                    setSaved(false);
                  }}
                  type="checkbox"
                />
                外层套玻璃卡片
              </label>
              <label className="home-editor__toggle">
                <input
                  checked={config.scopedCss !== false}
                  onChange={(event) => {
                    setConfig((current) => ({
                      ...current,
                      scopedCss: event.target.checked,
                    }));
                    setSaved(false);
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
                            <button
                              onClick={() => moveBlock(index, -1)}
                              type="button"
                            >
                              上移
                            </button>
                            <button
                              onClick={() => moveBlock(index, 1)}
                              type="button"
                            >
                              下移
                            </button>
                            <button
                              onClick={() => {
                                setBlocks((current) =>
                                  current.filter((item) => item.id !== block.id),
                                );
                                setSaved(false);
                              }}
                              type="button"
                            >
                              删除
                            </button>
                          </div>
                        </div>

                        {NEEDS_TEXT.has(block.type) ? (
                          <label className="form-field">
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
                          <label className="form-field">
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
                          <label className="form-field">
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
                            <label className="form-field">
                              图片地址
                              <input
                                onChange={(event) =>
                                  patchBlock(block.id, { src: event.target.value })
                                }
                                value={block.src ?? ""}
                              />
                            </label>
                            <label className="form-field">
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
                          <div className="admin-form-row">
                            <label className="form-field">
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
                            <label className="form-field">
                              来源
                              <select
                                onChange={(event) =>
                                  patchBlock(block.id, {
                                    source: event.target.value as
                                      | "latest"
                                      | "recommend",
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
          ) : (
            <p className="admin-muted">
              这是内置模块（{definition?.name ?? module.builtinKey}）。
              它的展示选项在 <Link href="/admin/home">首页管理</Link> 左栏调整，
              这里只能改名称。
            </p>
          )}

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="heo-button"
            disabled={saving}
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
          </div>
          {custom ? (
            <div className="module-code__tabs">
              {CODE_TABS.map((item) => (
                <button
                  className={cn(
                    "admin-toolbar-button",
                    tab === item.id && "is-active",
                  )}
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
        {custom ? (
          <>
            <p className="post-workspace__hint">
              这三栏会直接注入前台首页：HTML 原样插入、
              {config.scopedCss === false
                ? "CSS 全站生效"
                : "CSS 限定在本模块内"}
              、JS 在浏览器执行。只有管理员能写，出错只影响本模块。
            </p>
            <div className="module-code">
              <textarea
                onChange={(event) => {
                  setCodeValue(event.target.value);
                  setSaved(false);
                }}
                placeholder={
                  tab === "html"
                    ? "<div class=\"my-hero\">Hello</div>"
                    : tab === "css"
                      ? ".my-hero { color: var(--heo-theme); }"
                      : "console.log('hello from module');"
                }
                spellCheck={false}
                value={codeValue}
              />
              <p className="admin-muted">
                {codeValue.length} / 32768 字符
              </p>
            </div>
          </>
        ) : (
          <div className="post-workspace__preview">
            <p className="admin-muted">内置模块没有可编辑代码。</p>
          </div>
        )}
      </div>
    </div>
  );
}
