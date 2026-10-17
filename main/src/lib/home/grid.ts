import type { CSSProperties } from "react";

import { moduleHeightCss } from "@/lib/layout/viewport";

/**
 * 格子 → CSS 变量。
 *
 * 刻意不写 inline `grid-column`：手机端要用媒体查询切换几何，
 * 而 inline 样式会盖掉媒体查询（见 docs/pitfalls.md P-036）。
 * 桌面左侧留白是第 1 条轨道，所以内容列要 +1。
 * 手机 12 列铺满，不加偏移。
 */
export function areaStyle(
  area: {
    row: number;
    col: number;
    colSpan: number;
  },
  options?: { gutter?: boolean },
): CSSProperties {
  const offset = options?.gutter === false ? 0 : 1;
  return {
    "--cell-col": area.col + offset,
    "--cell-col-span": area.colSpan,
    "--cell-row": area.row,
  } as CSSProperties;
}

/**
 * 模块盒子 → CSS 变量。
 *
 * `--cell-h` / `--m-cell-h` 直接是**CSS 长度**（`420px` / `auto`），不是可计算的数字：
 * 高度口径见 `moduleHeightCss()` —— 0 = 自适应（随内容），其余按像素。
 * 值本身不写 inline `height`，同样是为了让媒体查询能盖（P-036）。
 */
export function moduleBoxStyle(placement: {
  hPct: number;
  mobileCol: number;
  mobileColSpan: number;
  mobileRow: number;
  mobileHPct: number;
}): CSSProperties {
  return {
    "--cell-h": moduleHeightCss(placement.hPct),
    "--m-cell-col": placement.mobileCol,
    "--m-cell-col-span": placement.mobileColSpan,
    "--m-cell-row": placement.mobileRow,
    "--m-cell-h": moduleHeightCss(placement.mobileHPct),
  } as CSSProperties;
}
