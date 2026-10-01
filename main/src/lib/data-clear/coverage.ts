/**
 * 数据清理的覆盖清单：`prisma/schema.prisma` 里每一张表都必须落在「删除 / 保留 / 按条件删」三档之一。
 *
 * 为什么要有这份清单：`lib/admin/data-clear.ts` 的 deleteMany 是手写的，
 * 新增表时只改 schema 和业务代码、忘了补清理，清理功能不会报错——表就静默活下来了。
 * `MomentVisibilityGroup`（2026-09-27）与 `PenName`（2026-09-25）都晚于数据清理功能
 * （2026-09-06），于是「清空数据」后可见范围组还在（见 P-103）。
 * `coverage.test.ts` 会把 schema 全表、这份清单、以及 data-clear.ts 里真实的 deleteMany 调用
 * 三方比对：漏登记、登记了却没删、删了却没登记，`pnpm test` 都会失败。
 *
 * 本文件不 import prisma，服务端与测试都能引用。
 */

/**
 * 删除顺序 = 依赖顺序（也逐字对应 `lib/admin/data-clear.ts` 里两段 deleteMany 的先后）：
 * 子表在前，`Comment` 先删回复再删父级，`MomentVisibilityGroup` 跟在 `Moment` 之后。
 * 改这里必须同步改 data-clear.ts；顺序被测试逐个比对。
 */
export const DATA_CLEAR_DELETE_ORDER = [
  "PostTag",
  "MomentLike",
  "Comment",
  "Post",
  "Moment",
  "MomentVisibilityGroup",
  "Category",
  "Tag",
  "PenName",
  "StaticPage",
  "Upload",
  "BackupSecret",
] as const;

/** 任何情况下都不删：站点配置与首页模块（spec §2.1）。 */
export const DATA_CLEAR_RETAINED_MODELS = [
  {
    model: "Setting",
    reason: "站点配置：站点名、COS、后台配色、首页透明度、瞬间全局可见期…",
  },
  {
    model: "HomeModule",
    reason: "首页模块目录（含自建模块的 html/css/js 与实例配置）",
  },
  {
    model: "HomePlacement",
    reason: "首页格点布局（电脑/手机两套几何）",
  },
] as const;

/** 只有勾选对应范围时才删。 */
export const DATA_CLEAR_CONDITIONAL_MODELS = [
  {
    model: "AdminUser",
    reason: "只有勾选「删除管理员账号」时才删；只删数据时不动它",
  },
] as const;

export type DataClearModelClass = "delete" | "retain" | "conditional";

/** Prisma 的 delegate 名 = 模型名首字母小写（`MomentVisibilityGroup` → `momentVisibilityGroup`）。 */
export function prismaDelegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** 某张表属于哪一档；未登记返回 null（`coverage.test.ts` 靠它判定「未分类」）。 */
export function classifyDataClearModel(
  model: string,
): DataClearModelClass | null {
  if ((DATA_CLEAR_DELETE_ORDER as readonly string[]).includes(model)) {
    return "delete";
  }
  if (DATA_CLEAR_RETAINED_MODELS.some((entry) => entry.model === model)) {
    return "retain";
  }
  if (DATA_CLEAR_CONDITIONAL_MODELS.some((entry) => entry.model === model)) {
    return "conditional";
  }
  return null;
}
