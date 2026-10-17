import type { Metadata } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";

import { HomeFloat } from "@/components/home/HomeFloat";
import { HomeGrid } from "@/components/home/HomeGrid";
import { isSmartBlogApp } from "@/lib/client/detect";
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

  // 「这一发请求是不是 App 打开的」按 UA 判定（lib/client/detect.ts）；本页本来就按 searchParams
  // 与数据库取数，读请求头不引入新的动态化代价。唯一后果是 App 里不渲染「推荐应用」卡片。
  const appMode = isSmartBlogApp((await headers()).get("user-agent"));

  // 固定底图与更透的玻璃卡只在 Banner 模块启用时生效，否则透明 body 会露出空背景。
  const hasBanner = items.some((item) => item.module.builtinKey === "banner");

  return (
    <>
      <div
        className={cn("home-shell", hasBanner && "home-page")}
        style={
          {
            "--home-module-fill": `${data.homeModuleOpacity}%`,
            "--home-backdrop-opacity": data.homeBackdropOpacity / 100,
            "--home-badge-color": data.homeBadgeColor || "var(--heo-theme)",
            "--home-badge-opacity": `${data.homeBadgeOpacity}%`,
          } as CSSProperties
        }
      >
        <style>{`html:has(.home-page){--home-module-fill:${data.homeModuleOpacity}%;--home-backdrop-opacity:${data.homeBackdropOpacity / 100}}`}</style>
        <HomeGrid data={data} items={items} appMode={appMode} />
      </div>
      {/* 覆盖层模块（弹出模块 / 推荐应用）必须是 `.home-shell` 的**兄弟**，不能是后代：
          `.home-shell` 自己带 z-index（有 Banner 时是 1），会给后代建一个新的层叠上下文，
          弹窗在里面写到 z-index:100 也只能压在 home-shell 内部，照样被 Banner 盖住（实测
          elementsFromPoint 里弹窗排在 home-shell 之后）。见 P-135。 */}
      <HomeFloat data={data} items={items} appMode={appMode} />
    </>
  );
}
