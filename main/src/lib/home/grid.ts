import type { CSSProperties } from "react";

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

export function moduleBoxStyle(placement: {
  hPct: number;
  mobileCol: number;
  mobileColSpan: number;
  mobileRow: number;
  mobileHPct: number;
}): CSSProperties {
  return {
    "--cell-h": placement.hPct,
    "--m-cell-col": placement.mobileCol,
    "--m-cell-col-span": placement.mobileColSpan,
    "--m-cell-row": placement.mobileRow,
    "--m-cell-h": placement.mobileHPct,
  } as CSSProperties;
}
