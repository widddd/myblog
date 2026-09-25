/**
 * 概览页卡片清单 —— key、默认显隐、面板文案的单一事实源。
 *
 * 设计约定（见 ADMIN-REWRITE-PLAN.md §6.2 / §6.4）：
 * - 卡片 key 只在这里定义；Settings 校验、概览页渲染、外观面板三处都从这里 import。
 * - 「隐藏」= **不渲染该卡**（不是 display:none），这样网格按实际卡片数重算、不留空洞。
 * - 非法/缺失值一律回退，**不抛错**：一个脏值不该让概览页白屏。
 */

export const DASHBOARD_CARD_KEYS = [
  "kpiPosts",
  "kpiComments",
  "kpiViews",
  "kpiMedia",
  "rankViews",
  "systemStatus",
  "recentPosts",
] as const;

export type DashboardCardKey = (typeof DASHBOARD_CARD_KEYS)[number];

export type DashboardCards = Record<DashboardCardKey, boolean>;

/** 卡片所属分区 —— 决定它落在哪个网格里，进而决定隐藏后的重排行为。 */
export type DashboardCardZone = "kpi" | "wide" | "full";

export type DashboardCardMeta = {
  key: DashboardCardKey;
  /** 外观面板里显示的名字 */
  label: string;
  zone: DashboardCardZone;
};

/** 默认全部显示。 */
export const DEFAULT_DASHBOARD_CARDS: DashboardCards = {
  kpiPosts: true,
  kpiComments: true,
  kpiViews: true,
  kpiMedia: true,
  rankViews: true,
  systemStatus: true,
  recentPosts: true,
};

export const DASHBOARD_CARD_META: readonly DashboardCardMeta[] = [
  { key: "kpiPosts", label: "文章", zone: "kpi" },
  { key: "kpiComments", label: "评论", zone: "kpi" },
  { key: "kpiViews", label: "累计阅读", zone: "kpi" },
  { key: "kpiMedia", label: "媒体文件", zone: "kpi" },
  { key: "rankViews", label: "阅读量最高", zone: "wide" },
  { key: "systemStatus", label: "系统状态", zone: "wide" },
  { key: "recentPosts", label: "最近文章", zone: "full" },
];

export function isDashboardCardKey(value: unknown): value is DashboardCardKey {
  return (
    typeof value === "string" &&
    (DASHBOARD_CARD_KEYS as readonly string[]).includes(value)
  );
}

/**
 * 解析存进 Setting 的值。
 * 未知键丢弃、缺键补默认、非布尔值按默认处理——写入端不可信。
 */
export function resolveDashboardCards(value: unknown): DashboardCards {
  const source: Record<string, unknown> =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: DashboardCards = { ...DEFAULT_DASHBOARD_CARDS };

  for (const key of DASHBOARD_CARD_KEYS) {
    const raw = source[key];
    if (typeof raw === "boolean") {
      result[key] = raw;
    }
  }

  return result;
}

/** 是否至少有一张可见卡片。全关时概览页要出空态 + 「恢复默认」，不是白屏。 */
export function hasVisibleDashboardCard(cards: DashboardCards): boolean {
  return DASHBOARD_CARD_KEYS.some((key) => cards[key]);
}
