/**
 * 模块模板目录：在 `/admin/modules` 点「新建模块」时选的那几种起点。
 *
 * 每个模板 = 一份可直接跑的 HTML/CSS/JS + 一份初始配置 + 默认几何。
 * 选完就落库成一条普通模块记录（`kind: custom`），此后与手写的自建模块没有任何区别 ——
 * 模板不是运行时概念，只是**新建时的初值**，不参与渲染，也不会在保存后反向覆盖用户改动。
 *
 * 不含 prisma / react，client 组件可直接引用。
 */

import { appLogoSvgMarkup } from "./app-logo";
import type { HomeModuleConfig } from "./types";
import type { ModuleStyle } from "./style";

export type ModuleTemplateKind = "plain" | "floating";

export type ModuleTemplate = {
  id: string;
  name: string;
  hint: string;
  /** plain = 占格点的普通模块；floating = 覆盖层（像弹出模块那样浮在页面上） */
  kind: ModuleTemplateKind;
  /** 初始 HTML（模板的「脚手架」，保存后可随意改） */
  html: string;
  css: string;
  js: string;
  config: HomeModuleConfig & { style?: ModuleStyle };
  /** 默认几何（列跨度 / 高度）*/
  placement: { col: number; colSpan: number; row: number; hPct: number };
  mobilePlacement: { mobileCol: number; mobileColSpan: number; mobileRow: number; mobileHPct: number };
};

/**
 * 推荐应用的「出厂 HTML」。
 *
 * ⚠️ 这份 HTML 与 `components/home/modules/AppPromoModule.tsx` 是同一套类名与结构：
 * 内置的「推荐应用」模块不写代码时就走那个 React 组件，一按「写入模板」就换成这份 HTML，
 * 所以两边必须长得一样，否则用户会看到「我什么都没改，样子却变了」。
 * 改这里的时候，同一批类名的 CSS 在 `globals.css` 的 `.home-app-promo*` 段里。
 *
 * 方形 logo 与 `AppLogoMark` / App 图标（`docs/android/icon.svg`）**同一条路径数据**，
 * 由 `appLogoSvgMarkup()` 生成 —— 别在这里手抄一份别的形状。
 */
export const APP_PROMO_HTML = `<div class="home-app-promo__row">
  <span class="home-app-promo__logo">
    ${appLogoSvgMarkup("-promo")}
  </span>
  <div class="home-app-promo__copy">
    <span class="home-app-promo__badge">推荐应用</span>
    <p class="home-app-promo__title">下载应用 SmartBlog</p>
    <p class="home-app-promo__text">随时查看我的动态</p>
  </div>
</div>
<a class="home-app-promo__action" href="/pages/smartblog">立即下载</a>`;

/**
 * 历史出厂版本里那块 **logo SVG** 的逐字原文（v1 的占位图形：圆角方块 + 两个圆点）。
 *
 * 比整份 HTML 更小的粒度：`upgradeLogoBlocks()` 用它做**块级**升级 ——
 * 用户在同一份 HTML 里加过别的东西、但没碰过 logo 时，只把那一段换掉，其余不动。
 *
 * 规矩：**换 logo 的写法之前，先把当前那块原样追加到这里。**
 */
export const APP_PROMO_LEGACY_LOGO: readonly string[] = [
  `<svg viewBox="0 0 108 108" class="home-app-promo__logo-svg" aria-hidden="true">
      <rect x="14" y="18" width="80" height="64" rx="24" fill="currentColor" opacity="0.14"></rect>
      <rect x="24" y="30" width="60" height="44" rx="18" fill="currentColor" opacity="0.9"></rect>
      <circle cx="44" cy="52" r="5" fill="#fff"></circle>
      <circle cx="64" cy="52" r="5" fill="#fff"></circle>
    </svg>`,
];

/**
 * 历史上发布过的「推荐应用」出厂 HTML（逐字保存）。
 *
 * 用途只有一个：**出厂代码升版**。`ensureHomeModules()` 看到库里的 `html` 与某一版
 * 逐字相同时，才把它换成新版；用户改过一个字就不匹配、不动它。
 *
 * 规矩：**每次改 `APP_PROMO_HTML` 之前，先把当前这份原样追加到这里**。
 * 指纹式的模糊匹配（只认几个特征串）在改版时会留下中间态，别用那套。
 */
export const APP_PROMO_LEGACY_HTML: readonly string[] = [
  // v1（2026-10-02 首次出厂）：方形 logo 还是「圆角方块 + 两个圆点」的占位图形，
  // 不是 App 真图标。P-140 之后换成 appLogoSvgMarkup()。
  `<div class="home-app-promo__row">
  <span class="home-app-promo__logo">
    ${APP_PROMO_LEGACY_LOGO[0]}
  </span>
  <div class="home-app-promo__copy">
    <span class="home-app-promo__badge">推荐应用</span>
    <p class="home-app-promo__title">下载应用 SmartBlog</p>
    <p class="home-app-promo__text">随时查看我的动态</p>
  </div>
</div>
<a class="home-app-promo__action" href="/pages/smartblog">立即下载</a>`,
];

const APP_PROMO_CSS = `/* 只在没配「强调色 / 圆角」时生效的主题兜底 */
.home-app-promo__row {
  gap: var(--mod-padding, 12px);
}

.home-app-promo__action {
  width: var(--mod-btn-width, auto);
  justify-content: var(--mod-btn-justify, center);
}`;

export const APP_PROMO_CSS_DEFAULT = APP_PROMO_CSS;

const EMPTY_CONFIG: HomeModuleConfig & { style?: ModuleStyle } = {
  card: true,
  scopedCss: false,
  style: {},
};

const FLOATING_CONFIG: HomeModuleConfig & { style?: ModuleStyle } = {
  ...EMPTY_CONFIG,
  floating: true,
};

export const MODULE_TEMPLATES: readonly ModuleTemplate[] = [
  {
    id: "blank",
    kind: "plain",
    name: "空白模块",
    hint: "一个空的玻璃卡片，放进首页格点后自己写内容。适合从零搭。",
    html: `<div class="my-module">
  <h2 class="my-module__title">标题</h2>
  <p class="my-module__text">写一句想对访客说的话。</p>
  <a class="my-module__action" href="/posts">去看看</a>
</div>`,
    css: `.my-module {
  display: grid;
  gap: 10px;
}

.my-module__title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
}

.my-module__text {
  margin: 0;
  opacity: 0.78;
}

.my-module__action {
  width: fit-content;
  padding: 8px 16px;
  border-radius: calc(var(--mod-radius, 12px) - 4px);
  background: var(--mod-accent, var(--heo-theme));
  color: #fff;
  text-decoration: none;
}`,
    js: "",
    config: EMPTY_CONFIG,
    placement: { col: 1, colSpan: 4, row: 1, hPct: 0 },
    mobilePlacement: { mobileCol: 1, mobileColSpan: 12, mobileRow: 1, mobileHPct: 0 },
  },
  {
    id: "card",
    kind: "plain",
    name: "图文卡片",
    hint: "图 + 标题 + 正文 + 按钮，最常用的信息卡。图的地址在 HTML 里换，或在「样式」里配背景图。",
    html: `<div class="my-card">
  <div class="my-card__body">
    <span class="my-card__badge">新</span>
    <h3 class="my-card__title">卡片标题</h3>
    <p class="my-card__text">两三行说明文字，写清楚这张卡想让访客做什么。</p>
  </div>
  <a class="my-card__action" href="/posts">阅读全文</a>
</div>`,
    css: `.my-card {
  display: grid;
  gap: 12px;
  height: 100%;
  align-content: space-between;
}

.my-card__badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mod-accent, var(--heo-theme)) 16%, transparent);
  color: var(--mod-accent, var(--heo-theme));
  font-size: 12px;
  font-weight: 700;
}

.my-card__title {
  margin: 6px 0 4px;
  font-size: 18px;
  font-weight: 800;
}

.my-card__text {
  margin: 0;
  opacity: 0.78;
  line-height: 1.7;
}

.my-card__action {
  width: var(--mod-btn-width, fit-content);
  justify-self: start;
  padding: 8px 16px;
  border-radius: var(--mod-btn-radius, 10px);
  background: var(--mod-btn-bg, var(--mod-accent, var(--heo-theme)));
  color: var(--mod-btn-text, #fff);
  font-weight: 700;
  text-decoration: none;
}`,
    js: "",
    config: EMPTY_CONFIG,
    placement: { col: 1, colSpan: 4, row: 1, hPct: 0 },
    mobilePlacement: { mobileCol: 1, mobileColSpan: 12, mobileRow: 1, mobileHPct: 0 },
  },
  {
    id: "banner",
    kind: "plain",
    name: "通栏横幅",
    hint: "满宽的一条横幅：大标题 + 一句说明 + 按钮。默认占满 12 列。",
    html: `<div class="my-banner">
  <div class="my-banner__copy">
    <h2 class="my-banner__title">一句话说清这个站是干什么的</h2>
    <p class="my-banner__text">再补一句，让人愿意继续往下滑。</p>
  </div>
  <a class="my-banner__action" href="/posts">开始阅读</a>
</div>`,
    css: `.my-banner {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  flex-wrap: wrap;
}

.my-banner__title {
  margin: 0 0 6px;
  font-size: clamp(20px, 2.4vw, 30px);
  font-weight: 900;
}

.my-banner__text {
  margin: 0;
  opacity: 0.78;
}

.my-banner__action {
  padding: 10px 20px;
  border-radius: var(--mod-btn-radius, 999px);
  background: var(--mod-btn-bg, var(--mod-accent, var(--heo-theme)));
  color: var(--mod-btn-text, #fff);
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}`,
    js: "",
    config: EMPTY_CONFIG,
    placement: { col: 1, colSpan: 12, row: 1, hPct: 0 },
    mobilePlacement: { mobileCol: 1, mobileColSpan: 12, mobileRow: 1, mobileHPct: 0 },
  },
  {
    id: "popup",
    kind: "floating",
    name: "弹出模块",
    hint: "覆盖在页面上的弹出卡：选一条边滑入、几秒后出现、带关闭叉叉。和内置「弹出模块」同款外壳。",
    html: `<div class="my-popup">
  <p class="my-popup__title">欢迎回来</p>
  <p class="my-popup__text">这里可以写一句想让访客看到的话。</p>
  <a class="my-popup__action" href="/posts">去看看</a>
</div>`,
    css: `.my-popup {
  display: grid;
  gap: 8px;
}

.my-popup__title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
}

.my-popup__text {
  margin: 0;
  opacity: 0.78;
  line-height: 1.7;
}

.my-popup__action {
  width: var(--mod-btn-width, fit-content);
  margin-top: 6px;
  padding: 8px 16px;
  border-radius: var(--mod-btn-radius, 10px);
  background: var(--mod-btn-bg, var(--mod-accent, var(--heo-theme)));
  color: var(--mod-btn-text, #fff);
  font-weight: 700;
  text-decoration: none;
}

/* 小屏：卡片贴底满宽，按钮拉满一行 */
@media (max-width: 959px) {
  .my-popup__action {
    width: 100%;
    text-align: center;
  }
}`,
    js: "",
    config: {
      ...FLOATING_CONFIG,
      placement: "top-right",
      delaySeconds: 3,
      dismissible: true,
      once: false,
    },
    placement: { col: 9, colSpan: 4, row: 1, hPct: 0 },
    mobilePlacement: { mobileCol: 1, mobileColSpan: 12, mobileRow: 1, mobileHPct: 0 },
  },
  {
    id: "app-promo",
    kind: "floating",
    name: "推荐应用",
    hint: "内置「推荐应用」同款出厂代码：方形 logo + 小标签 + 标题 + 说明 + 下载按钮。改地址就能推别的东西。",
    html: APP_PROMO_HTML,
    css: APP_PROMO_CSS,
    js: "",
    config: {
      ...FLOATING_CONFIG,
      placement: "top-right",
      delaySeconds: 3,
      dismissible: true,
      once: false,
      badge: "推荐应用",
      title: "下载应用 SmartBlog",
      text: "随时查看我的动态",
      actionLabel: "立即下载",
      actionHref: "/pages/smartblog",
      image: "",
    },
    placement: { col: 9, colSpan: 4, row: 1, hPct: 0 },
    mobilePlacement: { mobileCol: 1, mobileColSpan: 12, mobileRow: 1, mobileHPct: 0 },
  },
] as const;

export const DEFAULT_MODULE_TEMPLATE_ID = "blank";

export function moduleTemplate(id: string | null | undefined): ModuleTemplate | undefined {
  if (!id) {
    return undefined;
  }
  return MODULE_TEMPLATES.find((item) => item.id === id);
}
