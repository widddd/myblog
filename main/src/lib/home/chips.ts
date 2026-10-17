/**
 * 「欢迎光临」漂浮泡泡的纯逻辑：取几颗、怎么打散、密度怎么算。
 *
 * 无 react / DOM 依赖（`Math.random` 只在 `shuffleChips()` 里，可注入随机源做测试）。
 * 组件负责把结果贴成 className 与 CSS 变量，CSS 负责滚动。
 */

/** 泡泡总数上限（配置里的「漂浮色块文字」最多几条） */
export const CHIP_MAX = 24;
/** 每条文字长度上限 */
export const CHIP_MAX_CHARS = 8;
/** 一屏想看到几颗的区间（越少越稀疏、越多越密） */
export const CHIP_VISIBLE_MIN = 3;
export const CHIP_VISIBLE_MAX = 16;
/** 默认一屏几颗：偏密一点（6 太稀，用户要求「密一点、多一点」） */
export const DEFAULT_CHIP_VISIBLE = 8;
/** 兜底泡泡（没配 `chips` 时用） */
export const DEFAULT_CHIPS = ["NX", "TS", "MD", "SQL", "CSS", "UI"];

/** 一屏几颗：脏值 → 默认值，超区间夹回。 */
export function normalizeChipVisible(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CHIP_VISIBLE;
  }
  return Math.min(
    CHIP_VISIBLE_MAX,
    Math.max(CHIP_VISIBLE_MIN, Math.round(parsed)),
  );
}

/** 泡泡文字清洗：trim、截断、去空、封顶 `CHIP_MAX` 条。 */
export function normalizeChipLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => String(item ?? "").trim().slice(0, CHIP_MAX_CHARS))
    .filter(Boolean)
    .slice(0, CHIP_MAX);
}

/**
 * 打散顺序（Fisher–Yates）。
 *
 * 每次进页面换一个顺序 —— 泡泡多起来之后（上限 24 条）固定顺序会显得像一条循环广告。
 * `random` 可注入，测试里就能断言「是同一个集合、但顺序变了」而不是碰运气。
 */
export function shuffleChips(
  labels: string[],
  random: () => number = Math.random,
): string[] {
  const next = [...labels];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/**
 * 上滚用的列表：把同一批泡泡**复制两份**拼起来。
 *
 * 动画把整列上移 50%（正好是一份的高度），到点接上第二份 → 无缝循环。
 * 所以必须整份复制，不能在中间截断（截断会在回卷时跳一下）。
 */
export function chipRailList(labels: string[]): string[] {
  return [...labels, ...labels];
}

export type ChipRailMetrics = {
  /** 一颗泡泡的高度 */
  chipHeight: number;
  /** 颗与颗之间的间距 */
  gap: number;
  /** 偶数颗的横向错位（做出漂浮感） */
  offset: number;
  /** 滚动一圈的秒数（颗数多就慢一点，观感更稳） */
  durationSeconds: number;
};

/**
 * 按「一屏几颗」算密度：格子高度给定，泡泡高度 = 可用高度 ÷ 一屏几颗。
 *
 * 用户在后台把「一屏几颗」从 6 调到 12，泡泡会自动变小、变密，而不用去猜 px 值；
 * 反过来调小就变稀疏。高度按 0.72 的可用系数扣掉上下留白，并有 `minChipHeight` 兜底
 * （太密时至少还能看清字）。
 */
export function chipRailMetrics(options: {
  /** 泡泡列的高度（px）；未知时给 0，交给 CSS 的默认值 */
  railHeight: number;
  visible: number;
  /** 泡泡高度下限，避免密集时小到看不清 */
  minChipHeight?: number;
}): ChipRailMetrics | null {
  const visible = normalizeChipVisible(options.visible);
  // 下限 24px：比这更小字就贴边了（用户要的是「密」不是「糊」）
  const minChipHeight = options.minChipHeight ?? 24;
  if (!(options.railHeight > 0)) {
    return null;
  }
  const usable = options.railHeight * 0.72;
  const chipHeight = Math.max(minChipHeight, Math.round(usable / visible));
  const gap = Math.max(4, Math.round(chipHeight * 0.14));
  const offset = Math.max(18, Math.round(chipHeight * 0.5));
  // 一屏 `visible` 颗、每颗「高度 + 间距」算一步：步长越小走得越慢，观感更稳。
  // 夹在 18–90s，避免极端配置下快得像抖或慢得像停。
  const perStep = chipHeight + gap;
  const durationSeconds = Math.min(
    90,
    Math.max(18, Math.round((perStep * visible) / 12)),
  );
  return { chipHeight, gap, offset, durationSeconds };
}

/** 把密度写成 CSS 变量（组件贴到泡泡列的 style 上）；没算出来就返回空对象走 CSS 默认值。 */
export function chipRailStyle(metrics: ChipRailMetrics | null): Record<string, string> {
  if (!metrics) {
    return {};
  }
  return {
    "--chip-h": `${metrics.chipHeight}px`,
    "--chip-gap": `${metrics.gap}px`,
    "--chip-offset": `${metrics.offset}px`,
    "--chip-duration": `${metrics.durationSeconds}s`,
  };
}
