import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { HomeGrid } from "@/components/home/HomeGrid";
import { loadHomeData } from "@/lib/home/data";
import { getHomeLayout } from "@/lib/home/layout";
import { publicMetadata } from "@/lib/seo/site";
import { getPublicSettings } from "@/lib/settings";
import { cn } from "@/lib/utils/cn";
import { parsePage } from "@/lib/utils/page";

export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = await getPublicSettings();
  const metadata = await publicMetadata({
    title: siteName,
    description: "记录思考，也记录生活。",
    path: "/",
  });
  return { ...metadata, title: { absolute: siteName } };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const items = await getHomeLayout();
  const data = await loadHomeData(items, page);

  // 固定底图与更透的玻璃卡只在 Banner 模块启用时生效，否则透明 body 会露出空背景。
  const hasBanner = items.some((item) => item.module.builtinKey === "banner");

  return (
    <div
      className={cn("home-shell", hasBanner && "home-page")}
      style={
        {
          "--home-module-fill": `${data.homeModuleOpacity}%`,
          "--home-backdrop-opacity": data.homeBackdropOpacity / 100,
        } as CSSProperties
      }
    >
      <style>{`html:has(.home-page){--home-module-fill:${data.homeModuleOpacity}%;--home-backdrop-opacity:${data.homeBackdropOpacity / 100}}`}</style>
      <HomeGrid data={data} items={items} />
    </div>
  );
}
