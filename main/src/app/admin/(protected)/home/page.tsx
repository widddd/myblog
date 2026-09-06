import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  HomeLayoutEditor,
  type LayoutEntry,
} from "@/components/admin/HomeLayoutEditor";
import { HomeModuleRenderer } from "@/components/home/HomeModuleRenderer";
import { loadHomeData } from "@/lib/home/data";
import { listHomeModules } from "@/lib/home/layout";
import { DEFAULT_SETTINGS, getSetting } from "@/lib/settings";

export const metadata: Metadata = {
  title: "首页管理",
};

export default async function AdminHomePage() {
  const items = await listHomeModules();
  // 画布要真实数据，所以按「全部模块」取一次；关掉的模块也能预览。
  const data = await loadHomeData(items, 1);

  const entries: LayoutEntry[] = items.map(({ module, placement }) => ({
    moduleId: module.id,
    name: module.name,
    slug: module.slug,
    kind: module.kind,
    builtinKey: module.builtinKey,
    system: module.system,
    enabled: placement.enabled,
    col: placement.col,
    colSpan: placement.colSpan,
    row: placement.row,
    hPct: placement.hPct,
    mobileCol: placement.mobileCol,
    mobileColSpan: placement.mobileColSpan,
    mobileRow: placement.mobileRow,
    mobileHPct: placement.mobileHPct,
    sort: placement.sort,
    config: module.config,
  }));

  // RSC 节点作为 props 传给 client 画布：既是真数据，又能在客户端自由重排。
  const previews: Record<number, ReactNode> = {};
  for (const { module } of items) {
    previews[module.id] = (
      <HomeModuleRenderer data={data} module={module} preview />
    );
  }

  const [homeModuleOpacity, homeBackdropOpacity] = await Promise.all([
    getSetting<number>("homeModuleOpacity"),
    getSetting<number>("homeBackdropOpacity"),
  ]);

  return (
    <HomeLayoutEditor
      appearance={{
        homeModuleOpacity:
          homeModuleOpacity ?? DEFAULT_SETTINGS.homeModuleOpacity,
        homeBackdropOpacity:
          homeBackdropOpacity ?? DEFAULT_SETTINGS.homeBackdropOpacity,
      }}
      initial={entries}
      previews={previews}
    />
  );
}
