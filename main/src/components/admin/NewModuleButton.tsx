"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminDialog } from "@/components/admin/AdminDialog";
import { adminJson } from "@/lib/client/admin";
import { MODULE_TEMPLATES, type ModuleTemplate } from "@/lib/home/templates";

/**
 * 新建模块：先选模板，再给个名字。
 *
 * 模板就是**一份出厂代码 + 一份初始配置 + 默认几何**（见 `lib/home/templates.ts`），
 * 选定后落库成一条普通的自定义模块记录 —— 模板本身不进数据库，也不参与渲染，
 * 所以日后想改模板写法不会影响已经建好的模块。
 */
export function NewModuleButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function create(template: ModuleTemplate) {
    if (busyId) {
      return;
    }
    const finalName = name.trim() || template.name;
    setError("");
    setBusyId(template.id);
    try {
      const { data } = await adminJson<{ data: { id: number } }>(
        "/api/admin/modules",
        {
          method: "POST",
          body: JSON.stringify({
            name: finalName,
            html: template.html,
            css: template.css,
            js: template.js,
            config: template.config,
            placement: {
              ...template.placement,
              ...template.mobilePlacement,
            },
          }),
        },
      );
      router.push(`/admin/modules/${data.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "新建失败");
      setBusyId(null);
    }
  }

  return (
    <>
      <button className="admin-btn" onClick={() => setOpen(true)} type="button">
        新建模块
      </button>
      <AdminDialog
        onClose={() => {
          setOpen(false);
          setError("");
        }}
        open={open}
        title="新建模块"
        wide
      >
        <label className="admin-field">
          模块名称（留空用模板名）
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：首页活动卡"
            value={name}
          />
        </label>
        <p className="admin-muted">
          选一个起点。模板只是初值 —— 建好之后可以随便改 HTML / CSS / JS，
          也可以只调「基本样式」里的字体与配色。
        </p>
        <div className="module-template-list">
          {MODULE_TEMPLATES.map((template) => (
            <button
              className="module-template"
              disabled={busyId !== null}
              key={template.id}
              onClick={() => void create(template)}
              type="button"
            >
              <span className="module-template__title">
                {template.name}
                {template.kind === "floating" ? (
                  <span className="admin-badge admin-badge--info">覆盖层</span>
                ) : null}
              </span>
              <span className="module-template__hint">{template.hint}</span>
              <span className="module-template__meta">
                列跨度 {template.placement.colSpan}/12 ·{" "}
                {template.placement.hPct > 0
                  ? `高度 ${template.placement.hPct}px`
                  : "高度自适应"}
              </span>
              {busyId === template.id ? (
                <span className="module-template__meta">创建中…</span>
              ) : null}
            </button>
          ))}
        </div>
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}
      </AdminDialog>
    </>
  );
}
