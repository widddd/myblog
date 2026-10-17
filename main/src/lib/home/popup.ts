/**
 * 首页「覆盖层模块」（弹出模块 / 推荐应用卡）的纯逻辑：出场方向、动效、关闭记忆。
 * 不含 react / DOM —— 组件只负责把这些结果贴到 className 与 style 上。
 */

import {
  isPopupPlacement,
  type HomeModuleConfig,
  type PopupPlacement,
} from "./types";

/** 出场动效名（对应 globals.css 里的 keyframes） */
export type PopupEnter = "left" | "right" | "center";

export type PopupView = {
  /** 怎么从画面外进来 */
  enter: PopupEnter;
  /** 贴哪条边（CSS 用，`center` 表示居中） */
  edge: PopupPlacement;
  /** 进页面多少毫秒后出现（0 = 立刻） */
  delayMs: number;
  /** 是否显示关闭叉叉 */
  dismissible: boolean;
  /** 关掉后是否记住（localStorage）；`dismissible` 为 false 时无意义 */
  remember: boolean;
};

export const POPUP_DELAY_MAX_SECONDS = 60;

/** 退场过渡时长，与 globals.css 里 `.home-popup.is-leaving` 的 transition 对齐 */
export const POPUP_LEAVE_MS = 240;

/** 关掉后写进 localStorage 的键：按模块 slug 存，改内容不会自动复活旧的关闭记录。 */
export function popupStorageKey(slug: string): string {
  return `myblog:popup:${slug}`;
}

export function resolvePopupView(
  config: HomeModuleConfig,
  options: { defaultPlacement: PopupPlacement },
): PopupView {
  const edge = isPopupPlacement(config.placement) ? config.placement : options.defaultPlacement;
  const seconds = Number(config.delaySeconds);
  const delayMs =
    Number.isFinite(seconds) && seconds > 0
      ? Math.min(POPUP_DELAY_MAX_SECONDS, Math.round(seconds)) * 1000
      : 0;

  return {
    // 左上/左下从左边滑进来，右上/右下从右边滑进来，中间那款是淡入缩放的提示框
    enter: edge === "left" ? "left" : edge === "center" ? "center" : "right",
    edge,
    delayMs,
    dismissible: config.dismissible !== false,
    remember: config.once === true,
  };
}

/** 关闭记录：只在客户端可用；SSR 与隐私模式下返回 false（照常显示）。 */
export function isPopupDismissed(slug: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(popupStorageKey(slug)) !== null;
  } catch {
    return false;
  }
}

export function rememberPopupDismissed(slug: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(popupStorageKey(slug), new Date().toISOString());
  } catch {
    // 隐私模式 / 配额满：记不住就算了，不影响本次关闭
  }
}

/**
 * 覆盖层贴哪条水平边 —— 由格点里的 `col` 决定，让「自定义位置」在覆盖层里依然可感：
 * 前 1/3 贴左、后 1/3 贴右，中间居中。左右两款滑入动画在窄屏（手机档悬浮底栏）会退化成淡入。
 */
export function popupEdgeFromColumn(col: number, columns: number): "start" | "center" | "end" {
  const third = Math.max(1, Math.ceil(columns / 3));
  const value = Number.isFinite(col) ? Math.round(col) : 1;
  if (value <= third) {
    return "start";
  }
  if (value > columns - third) {
    return "end";
  }
  return "center";
}
