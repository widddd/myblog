"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  chipRailList,
  chipRailMetrics,
  chipRailStyle,
  normalizeChipVisible,
  shuffleChips,
} from "@/lib/home/chips";

const CHIP_COLORS = [
  "#4db8e8",
  "#5ba3d9",
  "#e38100",
  "#57bd6a",
  "#62c4ee",
  "#ff7c7c",
];

/**
 * 欢迎卡右侧的**漂浮泡泡列**：一列、上下无缝滚动、每次进页面换一个顺序。
 *
 * 为什么是客户端组件：
 * 1. **随机顺序**必须在挂载**之后**做 —— 服务端/首帧渲染必须与 SSR 完全一致，
 *    否则 hydration 会报不一致（所以第一次打散走一帧延迟）；
 * 2. **密度**要知道泡泡列的真实高度：按「一屏几颗」反推每颗多高（`chipRailMetrics()`），
 *    挂载时量一次，之后交给 `ResizeObserver`（用户手改高度、切视口都会重算）。
 * 服务端那一次给的是 CSS 里的默认密度，量到之后由 `--chip-*` 变量覆盖。
 *
 * 滚动本身完全交给 CSS（`rowup-scroll` 把整列上移 50%）；列表在下面复制了一份，
 * 所以到点接得回开头，不会跳。
 */
export function WelcomeChips({
  labels,
  visible,
}: {
  labels: string[];
  visible: number;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [railHeight, setRailHeight] = useState(0);
  const [order, setOrder] = useState(labels);
  const visibleCount = normalizeChipVisible(visible);

  // 打散顺序：延迟一帧，避开「effect 里同步 setState」（会触发级联渲染），
  // 也让首次渲染与 SSR 完全一致。
  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setOrder(shuffleChips(labels));
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在挂载时打散一次（保存后刷新自然会带上新列表）
  }, []);

  // 量泡泡列高度：挂载时一次 + 后续尺寸变化
  useEffect(() => {
    const node = railRef.current;
    if (!node) {
      return;
    }
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const height = node.getBoundingClientRect().height;
        setRailHeight((current) => (Math.abs(current - height) < 1 ? current : height));
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const metrics = useMemo(
    () => chipRailMetrics({ railHeight, visible: visibleCount }),
    [railHeight, visibleCount],
  );
  const rail = useMemo(() => chipRailList(order), [order]);

  return (
    <div
      aria-hidden="true"
      className="dash-chips"
      ref={railRef}
      style={chipRailStyle(metrics) as React.CSSProperties}
    >
      {rail.map((label, index) => (
        <div
          className="dash-chip"
          key={`${label}-${index}`}
          style={{ background: CHIP_COLORS[index % CHIP_COLORS.length] }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
