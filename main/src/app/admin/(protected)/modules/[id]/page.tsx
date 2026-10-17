import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ModuleEditor } from "@/components/admin/ModuleEditor";
import { HomeModuleRenderer } from "@/components/home/HomeModuleRenderer";
import { loadHomeData } from "@/lib/home/data";
import { getHomeModule } from "@/lib/home/layout";

export const metadata: Metadata = {
  title: "编辑模块",
};

export default async function AdminModuleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const moduleId = Number.parseInt(id, 10);
  if (!Number.isInteger(moduleId) || moduleId < 1) {
    notFound();
  }

  const item = await getHomeModule(moduleId);
  if (!item) {
    notFound();
  }

  // 预览走前台的渲染器（同一份实现 + 同一份真实数据），
  // 所以编辑器里看到的观感与首页一致，不存在「后台一套、前台另一套」。
  const data = await loadHomeData([item], 1);
  const preview = <HomeModuleRenderer data={data} module={item.module} preview />;

  return <ModuleEditor module={item.module} preview={preview} />;
}
