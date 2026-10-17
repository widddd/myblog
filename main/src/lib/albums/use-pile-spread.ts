"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";

import { PILE_HOLD_MS, PILE_STAGGER_MS, pileSpread } from "./pile";

// SSR 期没有布局可量（`renderToStaticMarkup` 也不跑 effect），用 useEffect 顶一下；
// 客户端一律走 useLayoutEffect —— 终态要在**首帧绘制前**写入，否则会闪一下叠放态。
// （同款写法见 `components/album/PhotoPile.tsx` 的几何测量）
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * 「一叠照片抽出」的**唯一执行器**：`/albums` 列表卡与首页「相册卡片」模块共用它。
 *
 * 之前两个组件各写一套（一个在 `useEffect` 里改内联样式、一个把终态直接写进首帧内联样式），
 * 结果两边都不可靠，而且越改越漂。这里把**首帧 / 终帧 / 时序**收敛成一份：
 *
 * 1. **首帧**由组件按 `pileSpread()` 渲染（叠放态：同一左缘、尺寸已是终值、第一张在最上面）。
 *    本 hook 不改首帧的样子，只保证"起点已经提交"；
 * 2. `PILE_HOLD_MS`（1s）后，**在 rAF 里**才写终帧 —— 浏览器因此拿到"起点 → 终点"两次样式，
 *    补间才成立（延迟到点即写终值，只是把元素瞬移过去，见 docs/pitfalls.md P-160）；
 * 3. 第一张**任何情况下都不碰**（不写 left / transform）。
 *
 * 为什么终帧要等 rAF（而不是 setTimeout 回调里直接写）：
 * - 后台标签页 / 页面切走时 rAF 不派发 —— 于是"抽"这个动作会在页面重新可见时才播，
 *   不会在用户看不见的时候悄悄播完（恢复回来只看到一个已经铺开的终态）；
 * - 顺带把"起点先提交"交给浏览器自己的帧时序，不依赖计时器精度。
 *
 * `instant`（后台画布预览）与 `prefers-reduced-motion: reduce`：直接给终态、不补间
 * （CSS 那侧同时把 transition 关掉，见 globals.css / albums.css）。
 */
export function usePileSpread({
  container,
  layerSelector,
  count,
  shrink,
  staggerMs = PILE_STAGGER_MS,
  holdMs = PILE_HOLD_MS,
  instant = false,
}: {
  /** 一叠的容器：每一层都是它的后代，DOM 顺序 = 层序（第 0 层在最上面） */
  container: RefObject<HTMLElement | null>;
  /** 层选择器（容器内）：列表卡是 `img`，首页模块是 `.home-album-cards__layer` */
  layerSelector: string;
  count: number;
  shrink: number;
  staggerMs?: number;
  holdMs?: number;
  /** 后台画布预览：不跑抽出动作，直接给终态 */
  instant?: boolean;
}): void {
  useIsomorphicLayoutEffect(() => {
    const root = container.current;
    if (!root || count < 2) {
      return;
    }
    const layers = [...root.querySelectorAll<HTMLElement>(layerSelector)];
    if (layers.length < 2) {
      return; // 一张照片没有"抽出来"这回事
    }
    const flow = pileSpread(count, shrink, staggerMs);

    /** 终帧：只写 `left` / `transform` —— 尺寸、层次、错峰都是首帧就定好的，动画期间一个都不改。 */
    const toEnd = () => {
      layers.forEach((node, index) => {
        if (index === 0) {
          return; // 第一张全程不移动
        }
        const step = flow[index];
        if (!step) {
          return;
        }
        node.style.left = `${step.to.left.toFixed(2)}%`;
        node.style.transform = step.to.rotate
          ? `rotate(${step.to.rotate.toFixed(2)}deg)`
          : "";
      });
    };

    if (instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      toEnd();
      return;
    }

    // 首帧复位：把后面几张摆回叠放态，并且**这次复位不补间**。
    // 为什么必须复位：重复进入 / 张数变了 / 组件重挂载但 DOM 被复用时，内联 `left` 可能还
    // 停在上一轮的终帧 —— 不复位就会"一进页面就是铺开的"（动画被跳过）。
    // `transition: none` 只活到下面那次强制重排为止（同一任务里就恢复），不留痕。
    layers.forEach((node, index) => {
      if (index === 0) {
        return;
      }
      node.style.transition = "none";
      node.style.left = "0%";
      node.style.transform = "";
    });
    // 读一次布局：把"起点"这一刻就落进样式/布局（而不是跟终点挤在同一帧里被合并掉）
    void root.offsetWidth;
    layers.forEach((node, index) => {
      if (index === 0) {
        return;
      }
      node.style.transition = ""; // 交还给 CSS 的过渡（left + transform，延迟走 --pile-delay）
    });

    let frame = 0;
    const timer = window.setTimeout(() => {
      frame = window.requestAnimationFrame(toEnd);
    }, holdMs);

    return () => {
      window.clearTimeout(timer);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [container, layerSelector, count, shrink, staggerMs, holdMs, instant]);
}
