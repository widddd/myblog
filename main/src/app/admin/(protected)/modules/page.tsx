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
    <section className="heo-card admin-panel">
      <div className="admin-panel-head">
        <h2>模块列表</h2>
        <NewModuleButton />
      </div>
      <p className="admin-muted">
        内置模块只能改名称和选项。自建模块可以放积木，也可以写网页代码。
        摆位置去 <Link href="/admin/home">首页管理</Link>。
      </p>
      <p className="admin-danger">删除自建模块后无法恢复。内置模块不能删。</p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>类型</th>
            <th>内容</th>
            <th>首页</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ module, placement }) => (
            <tr key={module.id}>
              <td>{module.name}</td>
              <td>{module.kind === "custom" ? "自建" : "内置"}</td>
              <td>
                {module.kind === "custom"
                  ? `${module.blocks.length} 个积木${
                      module.html || module.css || module.js ? " · 含代码" : ""
                    }`
                  : (module.builtinKey ?? "-")}
              </td>
              <td>{placement.enabled ? "已启用" : "未启用"}</td>
              <td className="admin-table-actions">
                <Link className="admin-toolbar-button" href={`/admin/modules/${module.id}`}>
                  编辑
                </Link>
                {module.system ? null : (
                  <DeleteButton
                    confirmText={`确定删除模块「${module.name}」？删除后无法恢复。`}
                    url={`/api/admin/modules/${module.id}`}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
