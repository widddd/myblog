/**
 * App 图标（方形圆角版）的**几何与颜色事实源** —— 一站式的纯数据 + 字符串生成，
 * 不含 react，服务端与客户端都能引。
 *
 * 三处用到同一组数字，改一处就要同步另外两处：
 * - `components/common/AppLogoMark.tsx`（React 组件，内置推荐应用卡的默认图标）
 * - `lib/home/templates.ts` 的「推荐应用」出厂 HTML（用户能在编辑框里看见并改）
 * - Android 侧 `androidapp/app/src/main/res/drawable/{ic_launcher_foreground,splash_logo}.xml`
 *   与设计源 `docs/android/icon.svg`、下载落地页 `smartblog.html`
 *
 * 设计语言：**「和自己对话」而不是「聊天」** —— 半透明回声气泡（另一个我）+ 实心主气泡（我）
 * + 指回自己的尾巴。改之前先读 `docs/android/icon.svg` 顶部的设计说明。
 */

export const APP_LOGO_PATHS = {
  /** 回声气泡：另一个「我」（白 42%） */
  echo: "M37.8,28.8 H49.3 A7.9,7.9 0 0 1 57.2,36.7 V43 A7.9,7.9 0 0 1 49.3,50.9 H37.8 A7.9,7.9 0 0 1 29.9,43 V36.7 A7.9,7.9 0 0 1 37.8,28.8 Z",
  /** 主气泡：我 */
  main: "M54.6,45.6 H68.2 A10,10 0 0 1 78.2,55.6 V62.9 A10,10 0 0 1 68.2,72.9 H54.6 A10,10 0 0 1 44.6,62.9 V55.6 A10,10 0 0 1 54.6,45.6 Z",
  /** 尾巴：话从嘴里出来，又指回自己 */
  tail: "M53,70.8 L44.6,82.4 L63.5,72.9 Z",
} as const;

/** 渐变两端与圆角裁切半径（与 App 图标一致）。 */
export const APP_LOGO_COLORS = {
  from: "#4FA8F5",
  to: "#2A4FD0",
  /** 方形底的四角圆角（108 画布） */
  radius: 24,
} as const;

/**
 * 一份可内联的方形 logo 标记（HTML 字符串），给「推荐应用的出厂代码」用。
 *
 * `suffix` 用来给渐变 / 裁切的 id 加后缀：**id 是全局的**，同一页出现两份带同样 id 的 SVG
 * 时，第二份会引用到第一份的定义（渐变、裁切形状会串味）。
 */
export function appLogoSvgMarkup(suffix = "", className = "home-app-promo__logo-svg"): string {
  const bgId = `app-logo-bg${suffix}`;
  const clipId = `app-logo-squircle${suffix}`;
  return `<svg viewBox="0 0 108 108" class="${className}" aria-hidden="true">
  <defs>
    <linearGradient id="${bgId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${APP_LOGO_COLORS.from}"></stop>
      <stop offset="1" stop-color="${APP_LOGO_COLORS.to}"></stop>
    </linearGradient>
    <clipPath id="${clipId}">
      <rect x="0" y="0" width="108" height="108" rx="${APP_LOGO_COLORS.radius}" ry="${APP_LOGO_COLORS.radius}"></rect>
    </clipPath>
  </defs>
  <g clip-path="url(#${clipId})">
    <rect width="108" height="108" fill="url(#${bgId})"></rect>
    <path fill="#FFFFFF" fill-opacity="0.42" d="${APP_LOGO_PATHS.echo}"></path>
    <path fill="#FFFFFF" d="${APP_LOGO_PATHS.main}"></path>
    <path fill="#FFFFFF" d="${APP_LOGO_PATHS.tail}"></path>
  </g>
</svg>`;
}
