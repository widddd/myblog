"use client";

import { useEffect, useRef } from "react";

import {
  isPopupDismissed,
  rememberPopupDismissed,
  resolvePopupView,
  POPUP_LEAVE_MS,
} from "@/lib/home/popup";
import type { HomeModuleConfig, PopupPlacement } from "@/lib/home/types";
import { cn } from "@/lib/utils/cn";

/**
 * 覆盖层里那张卡片的外壳（弹出模块 / 推荐应用 / 用模板建的自定义浮层共用）。
 *
 * 出场完全交给 **CSS**：`.home-popup` 基础态 `opacity: 0`，带进场动画
 * （延迟 = `--float-delay`，从「进页面几秒」换算而来）。这样组件**不需要计时器 setState**，
 * 既没重渲染也避开了 `react-hooks/set-state-in-effect`。
 * 只有「关闭是否要记住」必须读 localStorage，那一步在 effect 里做 DOM 操作（不 setState）。
 *
 * `preview`（后台画布 / 手机画框）静态显示，既不延迟也不给关闭按钮，
 * 否则在后台根本看不到自己配了什么。
 *
 * ⚠️ 这个组件**单独一个文件**：它被「推荐应用」等客户端组件引用，与 `PopupModule`
 * （正文渲染）分开，避免模块初始化顺序把外壳变成 undefined —— 那会让浮层掉进格点流里，
 * 而且是静默的（见 docs/pitfalls.md P-137）。
 */
export function PopupShell({
  slug,
  config,
  defaultPlacement,
  preview = false,
  className,
  styleAttr,
  children,
}: {
  slug: string;
  config: HomeModuleConfig;
  defaultPlacement: PopupPlacement;
  preview?: boolean;
  className?: string;
  /**
   * 模块的「基本样式」变量（见 `lib/home/style.ts`）。
   * 浮层没有外层模块根元素可挂，所以由这里落到外壳元素上：
   * 变量沿 DOM 继承，卡片自己的 CSS 与用户写进 HTML 的内容都能直接 `var(--mod-*)`。
   * 自定义模块关掉玻璃卡（`card: false`）时，`.home-popup--plain` 会把外壳淡出。
   */
  styleAttr?: {
    style: Record<string, string>;
    "data-mod-style"?: string;
  };
  children: React.ReactNode;
}) {
  const view = resolvePopupView(config, { defaultPlacement });
  const rootRef = useRef<HTMLElement | null>(null);
  const plain = config.card === false;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || preview) {
      return;
    }
    // 本机记住过关闭 → 直接把动画掐掉（`forwards` 会把开场帧的 opacity: 0 定住）
    if (view.remember && isPopupDismissed(slug)) {
      root.classList.add("is-skipped");
      return;
    }
    if (view.delayMs <= 0) {
      return;
    }
    // 延迟结束后收掉 `is-delayed`：它带着 pointer-events: none，不收掉卡片就永远点不动
    const timer = window.setTimeout(() => {
      root.classList.remove("is-delayed");
    }, view.delayMs);
    return () => window.clearTimeout(timer);
  }, [preview, slug, view.delayMs, view.remember]);

  const close = () => {
    const root = rootRef.current;
    if (view.remember) {
      rememberPopupDismissed(slug);
    }
    if (!root) {
      return;
    }
    root.classList.add("is-leaving");
    // 退场结束后从布局里彻底摘掉，避免留一个透明卡片挡住点击
    window.setTimeout(() => {
      root.classList.add("is-skipped");
    }, POPUP_LEAVE_MS);
  };

  const delayClass = view.delayMs > 0 ? "is-delayed" : "is-eager";

  return (
    <aside
      aria-live="polite"
      className={cn(
        "home-popup",
        plain && "home-popup--plain",
        `home-popup--${view.edge}`,
        `home-popup--enter-${view.enter}`,
        delayClass,
        preview && "is-preview",
        className,
      )}
      ref={rootRef}
      style={
        {
          "--float-delay": `${view.delayMs}ms`,
          ...(styleAttr?.style ?? {}),
        } as React.CSSProperties
      }
      {...(styleAttr?.["data-mod-style"]
        ? { "data-mod-style": styleAttr["data-mod-style"] }
        : {})}
    >
      {view.dismissible && !preview ? (
        <button
          aria-label="关闭"
          className="home-popup__close"
          onClick={close}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
      {children}
    </aside>
  );
}
