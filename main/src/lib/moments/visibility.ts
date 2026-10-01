import { formatDateTime } from "@/lib/utils/date";

/**
 * 瞬间可见期（唯一裁决点）
 *
 * 两层设置怎么合并不冲突，规则只有一条：
 *   **最终对外可见天数 = min(全局可见期, 该瞬间所属可见范围组的天数)**，其中 0 = 不限制（∞）。
 *
 * - 全局：Setting `momentVisibleDays`（0 = 永久公开，默认）。是整站的天花板。
 * - 分组：`MomentVisibilityGroup.days`，逐条瞬间可选。只能在全局天花板之内收紧，不能放宽。
 * - 未分组 / 组已删除（外键 SetNull）：只受全局约束。
 *
 * 所以「全局设 30 天 + 某条用 3 天组」= 3 天；「全局设 7 天 + 某条用 1 年组」= 仍是 7 天。
 * 后台列表会把「生效天数」和「被谁收紧」显示出来，不会出现两份设置互相打架的黑盒。
 */
export const MOMENT_VISIBILITY_DAYS_KEY = "momentVisibleDays";
export const MOMENT_VISIBILITY_DAYS_MAX = 3650;
export const MOMENT_VISIBILITY_GROUP_NAME_MAX = 12;
export const MOMENT_VISIBILITY_UNLIMITED = 0;

/** 后台「可见期」下拉的常用档位（天）：3 天 / 7 天 / 15 天 / 1 个月 / 3 个月 / 半年 / 1 年 */
export const MOMENT_VISIBILITY_PRESETS = [3, 7, 15, 30, 90, 180, 365] as const;

const MS_PER_DAY = 86_400_000;

export type MomentVisibilityRule = {
  groupId?: number | null;
  groupName?: string | null;
  globalDays?: number | null;
  groupDays?: number | null;
};

export type MomentVisibilityGroupInfo = {
  id: number;
  name: string;
  days: number;
};

export type MomentVisibility = {
  groupId: number | null;
  /** 分组名；未分组为 null（组被删掉后也是 null） */
  groupName: string | null;
  /** 分组自己的天数，未分组为 null */
  groupDays: number | null;
  /** 全局可见期天数，0 = 不限制 */
  globalDays: number;
  /** 实际生效天数，0 = 不限制 */
  effectiveDays: number;
  /** effectiveDays === 0 */
  unlimited: boolean;
  /** 过期时间；不限制时为 null */
  expiresAt: Date | null;
  /** 现在是否已过期（对外不可见） */
  expired: boolean;
  /** 谁把可见期收紧到当前值：global | group | none */
  limitedBy: "global" | "group" | "none";
};

/** 天数归一化：非法/越界一律回退到 0（不限制），不抛错。 */
export function normalizeVisibilityDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return MOMENT_VISIBILITY_UNLIMITED;
  }
  const rounded = Math.round(value);
  if (rounded <= 0) {
    return MOMENT_VISIBILITY_UNLIMITED;
  }
  return Math.min(MOMENT_VISIBILITY_DAYS_MAX, rounded);
}

/** 生效天数：min(全局, 分组)，0 视为 ∞；任一侧缺省/非法按「该侧不限制」处理。 */
export function resolveMomentVisibilityDays(
  rule: Pick<MomentVisibilityRule, "globalDays" | "groupDays">,
): number {
  const global = normalizeVisibilityDays(rule.globalDays);
  const group = normalizeVisibilityDays(rule.groupDays);
  if (global === MOMENT_VISIBILITY_UNLIMITED) {
    return group;
  }
  if (group === MOMENT_VISIBILITY_UNLIMITED) {
    return global;
  }
  return Math.min(global, group);
}

/** 可见期换算成截止时刻：发布时间 + 生效天数。不限制时返回 null。 */
export function momentVisibilityCutoff(
  createdAt: Date,
  effectiveDays: number,
): Date | null {
  const days = normalizeVisibilityDays(effectiveDays);
  if (days === MOMENT_VISIBILITY_UNLIMITED) {
    return null;
  }
  return new Date(createdAt.getTime() + days * MS_PER_DAY);
}

/** 谁把可见期收紧了：两侧都不限制 = none。 */
function resolveLimitedBy(
  globalDays: number,
  groupDays: number | null,
): MomentVisibility["limitedBy"] {
  if (groupDays === null) {
    return globalDays === MOMENT_VISIBILITY_UNLIMITED ? "none" : "global";
  }
  if (globalDays === MOMENT_VISIBILITY_UNLIMITED) {
    return groupDays === MOMENT_VISIBILITY_UNLIMITED ? "none" : "group";
  }
  if (groupDays === MOMENT_VISIBILITY_UNLIMITED) {
    return "global";
  }
  return groupDays < globalDays ? "group" : "global";
}

/** 规则层判定（不需要发布时间：只知道"会限制成几天"）。 */
export function resolveMomentVisibility(rule: MomentVisibilityRule): MomentVisibility {
  const globalDays = normalizeVisibilityDays(rule.globalDays);
  const groupId = rule.groupId ?? null;
  const groupDays = groupId === null ? null : normalizeVisibilityDays(rule.groupDays);
  const effectiveDays = resolveMomentVisibilityDays({ globalDays, groupDays });

  return {
    groupId,
    groupName: rule.groupName?.trim() ? rule.groupName.trim() : null,
    groupDays,
    globalDays,
    effectiveDays,
    unlimited: effectiveDays === MOMENT_VISIBILITY_UNLIMITED,
    expiresAt: null,
    expired: false,
    limitedBy: resolveLimitedBy(globalDays, groupDays),
  };
}

/**
 * 单条瞬间的完整判定：到期时刻 = 发布时间 + 生效天数（不看"读取时刻"，否则同一条瞬间每次刷新都不一样）。
 * 后台列表、公开查询、文案都走这里。
 */
export function describeMomentVisibility(
  rule: MomentVisibilityRule & { createdAt: Date | string },
  now: Date = new Date(),
): MomentVisibility {
  const base = resolveMomentVisibility(rule);
  const createdAt = new Date(rule.createdAt);
  const expiresAt = momentVisibilityCutoff(createdAt, base.effectiveDays);
  return {
    ...base,
    expiresAt,
    expired: expiresAt !== null && expiresAt.getTime() <= now.getTime(),
  };
}

/** 剩余可见天数（向上取整）；不限制返回 null，已过期返回 0。 */
export function momentVisibilityRemainingDays(
  visibility: Pick<MomentVisibility, "expiresAt">,
  now: Date = new Date(),
): number | null {
  if (!visibility.expiresAt) {
    return null;
  }
  const remainingMs = visibility.expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return 0;
  }
  return Math.ceil(remainingMs / MS_PER_DAY);
}

/** 生效天数 → 人话：0 天 = 永久公开，30 天 = 1 个月，365 = 1 年。 */
export function momentVisibilityDaysLabel(effectiveDays: number): string {
  const days = normalizeVisibilityDays(effectiveDays);
  if (days === MOMENT_VISIBILITY_UNLIMITED) {
    return "永久公开";
  }
  if (days % 365 === 0) {
    return days === 365 ? "1 年" : `${days / 365} 年`;
  }
  if (days % 30 === 0) {
    return days === 30 ? "1 个月" : `${days / 30} 个月`;
  }
  return `${days} 天`;
}

/** 后台列表短语，例如「3 天（三天可见组）」「7 天（全局收紧）」。 */
export function momentVisibilityPhrase(visibility: MomentVisibility): string {
  const label = momentVisibilityDaysLabel(visibility.effectiveDays);
  if (visibility.limitedBy === "group" && visibility.groupName) {
    return `${label}（${visibility.groupName}）`;
  }
  if (visibility.limitedBy === "global" && visibility.groupName) {
    return `${label}（全局收紧，组为 ${momentVisibilityDaysLabel(visibility.groupDays ?? 0)}）`;
  }
  if (visibility.limitedBy === "global") {
    return `${label}（全局）`;
  }
  return label;
}

/** 过期时间文案，例如「2026-09-30 12:00」（不退回相对时间，避免"3 天前"这种歧义）。 */
export function formatMomentExpiry(expiresAt: Date): string {
  return formatDateTime(expiresAt);
}

export type MomentVisibilityFilter = {
  OR: Array<Record<string, unknown>>;
};

/**
 * 公开查询的 where 条件（收口在 lib/moments/visibility.ts）。
 *
 * 关键实现约束（踩过的坑，别改回去）：
 * 1. **不要写 `visibilityGroupId: { notIn: [...] }` 这一支。** 外键 `ON DELETE SET NULL`
 *    已经保证「组被删 → visibilityGroupId = NULL」，孤儿 id 不可能存在；多加这一支不但多余，
 *    还会让 Prisma 把整条 OR 组合算错（实测：5 天前那条被错误放行）。
 * 2. **不设条件时要返回 `undefined`，不要返回 `OR: []` 或 `OR: [{}]`。** 实测 Prisma 对这两种
 *    写法都不按"恒真"处理（直接返回空集合），会把整站瞬间误判为不可见。
 *    调用方照 `where: undefined` 写即可（Prisma 视作不带条件）。
 */
export function buildMomentVisibilityFilter(input: {
  globalDays?: number | null;
  groups: ReadonlyArray<{ id: number; days: number }>;
  now?: Date;
}): MomentVisibilityFilter | undefined {
  const now = input.now ?? new Date();
  const globalDays = normalizeVisibilityDays(input.globalDays);
  const globalCutoff =
    globalDays === MOMENT_VISIBILITY_UNLIMITED
      ? null
      : new Date(now.getTime() - globalDays * MS_PER_DAY);
  const globalClause: Record<string, unknown> =
    globalCutoff === null ? {} : { createdAt: { gte: globalCutoff } };
  /** 未分组（或组已被删除 → SetNull）的瞬间只受全局约束 */
  const ungroupedClause: Record<string, unknown> = {
    visibilityGroupId: null,
    ...globalClause,
  };

  // 没有分组：全局限制时只输出一支"按全局截止时刻"，全局不限制时返回 undefined（不带条件）
  const globalCondition: MomentVisibilityFilter | undefined =
    globalCutoff === null ? undefined : { OR: [globalClause] };

  const groups = input.groups.filter(
    (group) => Number.isInteger(group.id) && group.id > 0,
  );
  if (groups.length === 0) {
    return globalCondition;
  }

  const groupClauses = groups.map((group) => {
    const days = normalizeVisibilityDays(group.days);
    const groupCutoff =
      days === MOMENT_VISIBILITY_UNLIMITED
        ? null
        : new Date(now.getTime() - days * MS_PER_DAY);
    // 分组分支必须同时满足「组窗口」和「全局天花板」：
    // 生效天数 = min(全局, 组)，换算成时间就是 cutoff = max(全局 cutoff, 组 cutoff)。
    // 少乘全局这一侧，长组就会绕过全局上限（实测：全局 7 天 + 一年组会漏出 40 天前那条）。
    const cutoff = pickStricterCutoff(globalCutoff, groupCutoff);
    return {
      visibilityGroupId: group.id,
      ...(cutoff === null ? {} : { createdAt: { gte: cutoff } }),
    };
  });

  return { OR: [ungroupedClause, ...groupClauses] };
}

/** 取更严（更晚）的截止时刻：null = 该侧不限制。 */
function pickStricterCutoff(a: Date | null, b: Date | null): Date | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return a.getTime() >= b.getTime() ? a : b;
}

/** 分组 + 全局 → 组信息表（给公开查询用：避免逐条查库）。 */
export function toVisibilityRuleLookup(
  groups: ReadonlyArray<MomentVisibilityGroupInfo>,
): Map<number, MomentVisibilityGroupInfo> {
  const map = new Map<number, MomentVisibilityGroupInfo>();
  for (const group of groups) {
    map.set(group.id, group);
  }
  return map;
}
