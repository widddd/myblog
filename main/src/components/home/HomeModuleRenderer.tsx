import { BlockRenderer } from "@/components/home/BlockRenderer";
import { CustomModuleRuntime } from "@/components/home/CustomModuleRuntime";
import { HomeBanner } from "@/components/home/HomeBanner";
import { PostsModule } from "@/components/home/modules/PostsModule";
import { MomentsModule } from "@/components/home/modules/MomentsModule";
import { RecommendModule } from "@/components/home/modules/RecommendModule";
import { UptimeModule } from "@/components/home/modules/UptimeModule";
import { WelcomeModule } from "@/components/home/modules/WelcomeModule";
import { AnnouncementWidget } from "@/components/widgets/AnnouncementWidget";
import { CategoriesWidget } from "@/components/widgets/CategoriesWidget";
import { RecentPostsWidget } from "@/components/widgets/RecentPostsWidget";
import { SiteStatsWidget } from "@/components/widgets/SiteStatsWidget";
import { TagsWidget } from "@/components/widgets/TagsWidget";
import type { HomeData } from "@/lib/home/data";
import type { HomeModuleView } from "@/lib/home/types";
import { parseSiteStartedAt } from "@/lib/home/uptime";
import { cn } from "@/lib/utils/cn";

/** 内置模块 key → 组件。首页禁止再在 page.tsx 里写死结构（P-035）。 */
export function HomeModuleRenderer({
  module,
  data,
  preview = false,
}: {
  module: HomeModuleView;
  data: HomeData;
  preview?: boolean;
}) {
  if (module.kind === "custom") {
    return (
      <div className={cn("home-custom-module", module.config.card && "glass-card")}>
        {module.blocks.length > 0 ? (
          <div className="home-block-stack">
            {module.blocks.map((block) => (
              <BlockRenderer block={block} data={data} key={block.id} />
            ))}
          </div>
        ) : null}
        <CustomModuleRuntime
          css={module.css}
          html={module.html}
          js={module.js}
          scopedCss={module.config.scopedCss !== false}
          slug={module.slug}
        />
      </div>
    );
  }

  switch (module.builtinKey) {
    case "banner":
      return data.banner ? (
        <HomeBanner
          banner={data.banner}
          height={module.config.height ?? "full"}
          siteName={data.siteName}
          subtitle={module.config.subtitle}
          trackLoad={!preview}
        />
      ) : null;
    case "welcome":
      return <WelcomeModule config={module.config} />;
    case "recommend":
      return (
        <RecommendModule limit={module.config.limit ?? 6} posts={data.recommend} />
      );
    case "moments":
      return (
        <MomentsModule
          config={module.config}
          moments={data.moments}
          preview={preview}
        />
      );
    case "posts":
      return data.listing ? (
        <PostsModule
          categories={data.categories}
          listing={data.listing}
          showCategoryBar={module.config.showCategoryBar !== false}
        />
      ) : null;
    case "announcement":
      return (
        <AnnouncementWidget
          body={module.config.body || data.announcement}
          heading={module.config.heading}
        />
      );
    case "site":
      return data.stats ? (
        <SiteStatsWidget heading={module.config.heading} stats={data.stats} />
      ) : null;
    case "categories":
      return (
        <CategoriesWidget
          categories={data.categories}
          heading={module.config.heading}
        />
      );
    case "tags":
      return <TagsWidget heading={module.config.heading} tags={data.tags} />;
    case "recent":
      return (
        <RecentPostsWidget
          heading={module.config.heading}
          posts={data.recent.slice(0, module.config.limit ?? 5)}
        />
      );
    case "uptime": {
      const started = parseSiteStartedAt(data.siteStartedAt);
      if (!started) {
        return preview ? (
          <section className="home-uptime glass-card">
            <p className="home-uptime__placeholder">未设置开始时间，前台不显示</p>
          </section>
        ) : null;
      }
      return (
        <UptimeModule
          heading={module.config.heading}
          startedAt={data.siteStartedAt}
        />
      );
    }
    default:
      return null;
  }
}
