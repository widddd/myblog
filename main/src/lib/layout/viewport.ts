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

export const H_PCT_MIN = 0;
export const H_PCT_MAX = 100;
export const H_UNIT_MIN_PX = 7;
export const H_UNIT_MAX_PX = 11;

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

export function bannerPresetToHPct(preset: BannerHeightPreset): number {
  if (preset === "full") {
    return 100;
  }
  if (preset === "large") {
    return 70;
  }
  return 47;
}

export function hPctToBannerPreset(hPct: number): BannerHeightPreset {
  if (hPct >= 85) {
    return "full";
  }
  if (hPct >= 58) {
    return "large";
  }
  return "medium";
}
