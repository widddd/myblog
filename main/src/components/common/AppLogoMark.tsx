/**
 * 推荐应用卡的**内置方形应用图标**（React 组件）。
 *
 * 几何与颜色的事实源在 `lib/home/app-logo.ts`（同一组数字也被「推荐应用」的出厂 HTML
 * 与 Android 侧图标使用）—— 这里只是把它画成 React 元素，不再单独维护一份路径。
 *
 * 想要别的图标：在「推荐应用」模块里把 `image` 填成上传好的方形图即可覆盖本组件。
 */

import { APP_LOGO_COLORS, APP_LOGO_PATHS } from "@/lib/home/app-logo";

export function AppLogoMark({
  className,
  /** 同页出现多份时给渐变/裁切 id 加后缀，避免互相引用 */
  idSuffix = "",
}: {
  className?: string;
  idSuffix?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      role="img"
      viewBox="0 0 108 108"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`app-logo-bg${idSuffix}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={APP_LOGO_COLORS.from} />
          <stop offset="1" stopColor={APP_LOGO_COLORS.to} />
        </linearGradient>
        <clipPath id={`app-logo-squircle${idSuffix}`}>
          <rect
            height="108"
            rx={APP_LOGO_COLORS.radius}
            ry={APP_LOGO_COLORS.radius}
            width="108"
            x="0"
            y="0"
          />
        </clipPath>
      </defs>
      <g clipPath={`url(#app-logo-squircle${idSuffix})`}>
        <rect fill={`url(#app-logo-bg${idSuffix})`} height="108" width="108" />
        {/* 回声气泡：另一个「我」 */}
        <path d={APP_LOGO_PATHS.echo} fill="#FFFFFF" fillOpacity="0.42" />
        {/* 主气泡：我 */}
        <path d={APP_LOGO_PATHS.main} fill="#FFFFFF" />
        {/* 尾巴：话从嘴里出来，又指回自己 */}
        <path d={APP_LOGO_PATHS.tail} fill="#FFFFFF" />
      </g>
    </svg>
  );
}
