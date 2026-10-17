/**
 * 「这一发请求来自哪个客户端」的判定（纯函数，服务端与渲染层共用）。
 *
 * 现状只有一个信号：Android 客户端 SmartBlog（`androidapp/`，GeckoView 宿主）
 * 在默认 UA 后面追加 ` SmartBlog/<版本>`（宿主里 `AppUrl.SMARTBLOG_TAG`，
 * 与本文的 `SMARTBLOG_APP_TAG` 必须一致）。
 *
 * 为什么用 UA 而不是 JS 注入 / cookie：
 *  1. 覆盖面**必须是每次请求都有**——首页、文章页、后续导航都要带上，
 *     JS 注入只能覆盖已跑起来的页面，首屏渲染已经发生过（会先闪一下弹窗）；
 *  2. cookie 会污染登录链路相关的请求语义，且要额外处理过期；
 *  3. 追加式 UA（`<默认 UA> <AppName>/<版本>`）是 WebView 类客户端的通行做法，
 *     不改动前面的浏览器指纹，站点侧的原生特性判定一律不吃亏。
 *
 * 注意：**这不是鉴权**。UA 客户端可伪造，所以它只能用来决定「要不要展示推荐卡」
 * 这类体验问题，绝不能用来放行任何权限（管理员判定走 session，见
 * `lib/auth/guard.ts` → `app/api/client/status/route.ts`）。
 */

/** App 在 UA 里追加的标记；Android 侧同一常量见 `AppUrl.kt`。 */
export const SMARTBLOG_APP_TAG = "SmartBlog";

export type ClientPlatform = "browser" | "smartblog";

/** UA 里是否带着 App 标记（大小写不敏感；`SmartBlog/0.1.1` 与裸 `SmartBlog` 都算）。 */
export function isSmartBlogApp(userAgent: string | null | undefined): boolean {
  if (!userAgent) {
    return false;
  }
  return userAgent.toLowerCase().includes(SMARTBLOG_APP_TAG.toLowerCase());
}

/** 把 UA 收成一个平台标识，供组件/接口统一判断（别各处各写一遍 includes）。 */
export function detectClientPlatform(
  userAgent: string | null | undefined,
): ClientPlatform {
  return isSmartBlogApp(userAgent) ? "smartblog" : "browser";
}

/** 「推荐应用」卡片自己的类名特征（内置 React 卡片、出厂 HTML、自定义模板共用这一族）。 */
const APP_PROMO_CLASS_MARKER = "home-app-promo__";

/** 渲染层能看到的模块形状（只取判定需要的字段，避免 import 组件类型的环）。 */
export type RenderableModule = {
  builtinKey?: string | null;
  html?: string;
};

export type ModuleRenderContext = {
  /** 这一发请求来自 SmartBlog App（服务端按 UA 判定） */
  appMode?: boolean;
  /** 后台画布 / 手机画框 / 编辑器预览 */
  preview?: boolean;
};

/**
 * 这个模块这次**要不要整个不渲染**（唯一裁决点）。
 *
 * 目前只有一条规则：「推荐应用」卡片在 **App 里且不是预览** 时不渲染 ——
 * 人已经在 App 里了，还劝他「立即下载 App」是自打脸。
 *
 * 两种承载形态都要认：内置模块（`builtinKey === "app-promo"`）与**用模板建的推荐卡**
 * （模板 `app-promo` 落成 `kind: custom` + `config.floating`，没有 builtinKey，只能看 HTML）。
 * 形态判定必须同时覆盖，否则「用模板建一个推荐卡」会在 App 里照弹，而且是**静默漏判**。
 *
 * 调用点必须是「决定渲不渲染」的**同一批地方**（`HomeModuleRenderer` / `HomeGrid` / `HomeFloat`）：
 * 只在最里面 `return null` 会留下一个空格子（浮层还会留一个贴边的空 `<aside>`）——
 * 空壳子照样压住点击，等同于 P-137 那类"内容在、定位与交互全丢"的变种。
 */
export function isModuleHidden(
  module: RenderableModule,
  context: ModuleRenderContext = {},
): boolean {
  if (!context.appMode || context.preview) {
    return false;
  }
  if (module.builtinKey === "app-promo") {
    return true;
  }
  return Boolean(module.html?.includes(APP_PROMO_CLASS_MARKER));
}
