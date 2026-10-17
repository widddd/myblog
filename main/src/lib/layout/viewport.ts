/**
 * 全站双视口约定。CSS 走手机套的媒体查询必须与 LAYOUT_PHONE_MEDIA 一致。
 * 此文件不引入 prisma / react。
 */

export const LAYOUT_COLUMNS = 12;

export const LAYOUT_PHONE_MAX_WIDTH = 959;
export const LAYOUT_PHONE_COARSE_MAX_HEIGHT = 540;

/** 与 globals.css 中 @media 条件字符串保持同步（文档/测试用）。 */
export const LAYOUT_PHONE_MEDIA =
  "(max-width: 959px), ((hover: none) and (max-height: 540px))";

/**
 * 模块高度（`hPct` / `mobileHPct`）：**0 = 自适应（随内容）**，其余按**像素**读。
 *
 * ⚠️ 曾经是「视口高度的百分数」（`hPct: 37` = 37% 视口），那个口径下把滑块调大只是
 * 把**格子**撑高、模块本身还是被挤在里面（用户反馈：欢迎卡文字挤成一团、泡泡变矮）。
 * 现在滑块直接就是模块高度（px），所见即所得；0 交给内容自己决定。
 */
export const H_PCT_MIN = 0;
export const H_PCT_MAX = 1200;

/** 高度滑块的最小/最大步进（px）。 */
export const H_PCT_STEP = 10;

/** 模块高度是不是自适应。 */
export function isAutoHeight(hPct: number): boolean {
  return !(hPct > 0);
}

/** 模块高度 → CSS 长度：自适应给 `auto`，否则给像素。 */
export function moduleHeightCss(hPct: number): string {
  return isAutoHeight(hPct) ? "auto" : `${Math.round(hPct)}px`;
}

/** 拖拽/输入框用的夹取。 */
export function clampModuleHeight(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(H_PCT_MAX, Math.max(H_PCT_MIN, Math.round(value)));
}

/**
 * 把「屏幕上的拖动距离」换算成模块高度变化量。
 * 后台画布是缩放过的（`zoom` 与画框缩放都体现在 framePx 里），所以要按比例还原成模块像素。
 */
export function dragDeltaToModulePx(
  deltaScreenPx: number,
  framePx: number,
  designPx: number = VIEWPORT_DESKTOP.height,
): number {
  if (!Number.isFinite(deltaScreenPx) || !(framePx > 0)) {
    return 0;
  }
  return Math.round(deltaScreenPx * (designPx / framePx));
}

export type LayoutViewportId = "desktop" | "mobile";

export type LayoutViewport = {
  id: LayoutViewportId;
  width: number;
  height: number;
  columns: number;
  contentMax: number;
};

export const VIEWPORT_DESKTOP: LayoutViewport = {
  id: "desktop",
  width: 1440,
  height: 900,
  columns: LAYOUT_COLUMNS,
  contentMax: 1200,
};

export const VIEWPORT_PHONE: LayoutViewport = {
  id: "mobile",
  width: 390,
  height: 844,
  columns: LAYOUT_COLUMNS,
  contentMax: 390,
};

export function viewportById(id: LayoutViewportId): LayoutViewport {
  return id === "mobile" ? VIEWPORT_PHONE : VIEWPORT_DESKTOP;
}

/**
 * 窄屏，或「不能悬停 + 视口很矮」= 手机横屏。
 * iPad 横屏高度约 744，不会落到 coarse+矮 这一支。
 */
export function isPhoneViewport(
  width: number,
  height: number,
  hover: boolean,
): boolean {
  if (width <= LAYOUT_PHONE_MAX_WIDTH) {
    return true;
  }
  return !hover && height <= LAYOUT_PHONE_COARSE_MAX_HEIGHT;
}

export type BannerHeightPreset = "full" | "large" | "medium";
