/**
 * 相对格点盒子。不含 prisma / react。
 */

import {
  H_PCT_MAX,
  H_PCT_MIN,
  LAYOUT_COLUMNS,
  type LayoutViewportId,
} from "./viewport";

export type LayoutBox = {
  col: number;
  colSpan: number;
  row: number;
  hPct: number;
};

export type DualLayoutBox = {
  col: number;
  colSpan: number;
  row: number;
  hPct: number;
  mobileCol: number;
  mobileColSpan: number;
  mobileRow: number;
  mobileHPct: number;
};

export function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function normalizeBox(
  input: {
    col?: unknown;
    colSpan?: unknown;
    row?: unknown;
    hPct?: unknown;
  },
  columns: number = LAYOUT_COLUMNS,
): LayoutBox {
  const colSpan = clampInt(input.colSpan, 1, columns, columns);
  const col = clampInt(input.col, 1, columns - colSpan + 1, 1);
  const row = clampInt(input.row, 1, 200, 1);
  const hPct = clampInt(input.hPct, H_PCT_MIN, H_PCT_MAX, 0);
  return { col, colSpan, row, hPct };
}

export function pickBox(
  dual: DualLayoutBox,
  viewport: LayoutViewportId,
): LayoutBox {
  if (viewport === "mobile") {
    return {
      col: dual.mobileCol,
      colSpan: dual.mobileColSpan,
      row: dual.mobileRow,
      hPct: dual.mobileHPct,
    };
  }
  return {
    col: dual.col,
    colSpan: dual.colSpan,
    row: dual.row,
    hPct: dual.hPct,
  };
}

export function mergeBox(
  viewport: LayoutViewportId,
  box: LayoutBox,
): Partial<DualLayoutBox> {
  if (viewport === "mobile") {
    return {
      mobileCol: box.col,
      mobileColSpan: box.colSpan,
      mobileRow: box.row,
      mobileHPct: box.hPct,
    };
  }
  return {
    col: box.col,
    colSpan: box.colSpan,
    row: box.row,
    hPct: box.hPct,
  };
}

export function emptyDualBox(): DualLayoutBox {
  return {
    col: 1,
    colSpan: LAYOUT_COLUMNS,
    row: 1,
    hPct: 0,
    mobileCol: 1,
    mobileColSpan: LAYOUT_COLUMNS,
    mobileRow: 1,
    mobileHPct: 0,
  };
}
