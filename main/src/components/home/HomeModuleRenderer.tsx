import { BlockRenderer } from "@/components/home/BlockRenderer";
import { CustomModuleRuntime } from "@/components/home/CustomModuleRuntime";
import { HomeBanner } from "@/components/home/HomeBanner";
import { AppPromoModule } from "@/components/home/modules/AppPromoModule";
import { AlbumCardsModule } from "@/components/home/modules/AlbumCardsModule";
import { AlbumsModule } from "@/components/home/modules/AlbumsModule";
import { PopupModule } from "@/components/home/modules/PopupModule";
import { PopupShell } from "@/components/home/modules/PopupShell";
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
import { isModuleHidden } from "@/lib/client/detect";
import type { HomeData } from "@/lib/home/data";
import { builtinDefinition } from "@/lib/home/builtins";
import { normalizeModuleStyle, moduleStyleProps } from "@/lib/home/style";
import { isFloatingModule, type HomeModuleView } from "@/lib/home/types";
import { parseSiteStartedAt } from "@/lib/home/uptime";
import { cn } from "@/lib/utils/cn";

/** 该模块有没有可渲染的代码（决定「推荐应用」走 React 卡片还是走 HTML）。 */
function hasCustomCode(module: HomeModuleView): boolean {
  return Boolean(module.html.trim() || module.css.trim() || module.js.trim());
}

type StyleAttr = ReturnType<typeof moduleStyleProps>;

/**
 * 模块正文：**前台渲染与后台预览共用的唯一实现**。
 *
 * `HomeModuleRenderer` 是它的薄壳（负责套模块根元素 + 基本样式变量），
 * 编辑器用它做即时预览，覆盖层也跟着复用，不存在「预览一套、前台另一套」。
 *
 * `styleAttr` 只在**没有外层模块根元素**的场合由自己下发（覆盖层由 `HomeFloat` 直接画，
 * 没有根元素可挂）——所以这里必须是「有一层就传一层」，不能每层都写，否则
 * 同一批 CSS 变量会被重复写在两个元素上（多一层继承，值一样，但排查时代码是错的）。
 */
export function ModuleBody({
  module,
  data,
  preview = false,
  appMode = false,
  styleAttr,
}: {
  module: HomeModuleView;
  data: HomeData;
  preview?: boolean;
  /**
   * 这一发请求来自 SmartBlog App（宿主 UA 带标记，判定见 `lib/client/detect.ts`）。
   * 后果只有一个：**「推荐应用」卡片不渲染** —— 人已经在 App 里了，不该再劝他下载 App。
   * 后台预览不受影响（`preview` 优先）。
   */
  appMode?: boolean;
  styleAttr?: StyleAttr;
}) {
  const definition = builtinDefinition(module.builtinKey);
  const runtime = (
    <CustomModuleRuntime
      css={module.css}
      html={module.html}
      js={module.js}
      scopedCss={module.config.scopedCss !== false}
      slug={module.slug}
    />
  );

  // 唯一的藏卡判定（内置 key 与「用模板建的自建推荐卡」都在里面）
  if (isModuleHidden(module, { appMode, preview })) {
    return null;
  }

  // 自建模块：包裹（可选玻璃卡）+ 积木 + 代码。
  // 浮层的自建模块（模板里选了「弹出模块 / 推荐应用」）**必须套 PopupShell**：
  // 外壳提供 `position: fixed` 与出场动画，只返回正文的话卡片会掉进格点流里（P-137）。
  if (module.kind === "custom") {
    const body = (
      <>
        {module.blocks.length > 0 ? (
          <div className="home-block-stack">
            {module.blocks.map((block) => (
              <BlockRenderer block={block} data={data} key={block.id} />
            ))}
          </div>
        ) : null}
        {runtime}
      </>
    );
    return isFloatingModule(module) ? (
      <PopupShell
        config={module.config}
        defaultPlacement="top-right"
        preview={preview}
        slug={module.slug}
        styleAttr={styleAttr}
      >
        {body}
      </PopupShell>
    ) : (
      body
    );
  }

  // 可编辑的内置模块（推荐应用）：写了代码就用代码，
  // 没写就落回原来的 React 卡片 —— 空代码 ≠ 空白模块。
  // 同样必须套 PopupShell：它是浮层模块，外壳不能因为「改了代码」就丢掉。
  // 类名保持 `home-app-promo`：站点 CSS 与用户自己写的样式都按它挂。
  if (definition?.editable && hasCustomCode(module)) {
    return (
      <PopupShell
        className="home-app-promo"
        config={module.config}
        defaultPlacement="top-right"
        preview={preview}
        slug={module.slug}
        styleAttr={styleAttr}
      >
        {runtime}
      </PopupShell>
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
    case "albums":
      return (
        <AlbumsModule
          config={module.config}
          images={data.albumImages}
          preview={preview}
        />
      );
    case "album-cards":
      return (
        <AlbumCardsModule
          albums={data.albums}
          config={module.config}
          preview={preview}
        />
      );
    case "posts":
      return data.listing ? (
        <PostsModule
          categories={data.categories}
          listing={data.listing}
          momentLimit={module.config.momentLimit}
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
    case "popup":
      return (
        <PopupModule
          config={module.config}
          preview={preview}
          slug={module.slug}
          styleAttr={styleAttr}
        />
      );
    case "app-promo":
      return (
        <AppPromoModule
          config={module.config}
          preview={preview}
          slug={module.slug}
          styleAttr={styleAttr}
        />
      );
    default:
      return null;
  }
}

/**
 * 模块根元素：套上「基本样式」的 CSS 变量，再渲染正文。
 *
 * `preview` 时把动画/固定定位收掉（见 globals.css 的 `.is-preview`），
 * 否则后台画布里既看不到落位、又会自己飘走。
 */
export function HomeModuleRenderer({
  module,
  data,
  preview = false,
  appMode = false,
}: {
  module: HomeModuleView;
  data: HomeData;
  preview?: boolean;
  appMode?: boolean;
}) {
  const style = normalizeModuleStyle(module.config.style);

  return (
    <div
      className={cn(
        "home-module",
        module.kind === "custom" && "home-custom-module",
        module.kind === "custom" && module.config.card && "glass-card",
        style.shadow === false && "home-module--flat",
        preview && "is-preview",
      )}
      data-module-id={module.id}
      data-module-slug={module.slug}
      {...moduleStyleProps(style)}
    >
      <ModuleBody data={data} module={module} preview={preview} appMode={appMode} />
    </div>
  );
}
