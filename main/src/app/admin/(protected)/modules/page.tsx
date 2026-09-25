import type { Metadata } from "next";
import Link from "next/link";

import { NewModuleButton } from "@/components/admin/NewModuleButton";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { listHomeModules } from "@/lib/home/layout";

export const metadata: Metadata = {
  title: "模块管理",
};

export default async function AdminModulesPage() {
  const items = await listHomeModules();

  return (
    <section className="admin-card">
      <div className="admin-panel-head">
        <h2>模块列表</h2>
        <NewModuleButton />
      </div>
      <p className="admin-muted">
        内置模块只能改名称和选项。自建模块可以放积木，也可以写网页代码。
        摆位置去 <Link href="/admin/home">首页管理</Link>。
      </p>
      <p className="admin-danger">删除自建模块后无法恢复。内置模块不能删。</p>
      <div className="admin-list admin-list--modules">
        <div className="admin-list__head">
          <span>名称</span>
          <span>类型</span>
          <span>内容</span>
          <span>首页</span>
          <span>操作</span>
        </div>
        {items.map(({ module, placement }, index) => (
          <article
            className="admin-list__row admin-stagger"
            key={module.id}
            style={{ "--i": index } as React.CSSProperties}
          >
            <div className="admin-list__cell admin-list__cell--main" data-label="名称">
              {module.name}
            </div>
            <div className="admin-list__cell" data-label="类型">
              {module.kind === "custom" ? "自建" : "内置"}
            </div>
            <div className="admin-list__cell" data-label="内容">
              {module.kind === "custom"
                ? `${module.blocks.length} 个积木${
                    module.html || module.css || module.js ? " · 含代码" : ""
                  }`
                : (module.builtinKey ?? "-")}
            </div>
            <div className="admin-list__cell" data-label="首页">
              {/* 已放进首页 = 生效中 → ok（与文章「已发布」同档）；
                  未启用 = 中性的「没开启」→ muted，不是错误 */}
              <span
                className={
                  placement.enabled
                    ? "admin-badge admin-badge--ok"
                    : "admin-badge admin-badge--muted"
                }
              >
                {placement.enabled ? "已启用" : "未启用"}
              </span>
            </div>
            <div className="admin-list__actions">
              <Link className="admin-btn admin-btn--ghost" href={`/admin/modules/${module.id}`}>
                编辑
              </Link>
              {module.system ? null : (
                <DeleteButton
                  confirmText={`确定删除模块「${module.name}」？删除后无法恢复。`}
                  url={`/api/admin/modules/${module.id}`}
                />
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
