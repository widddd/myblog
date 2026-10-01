import {
  MOMENT_VISIBILITY_UNLIMITED,
  momentVisibilityDaysLabel,
  normalizeVisibilityDays,
  resolveMomentVisibilityDays,
} from "@/lib/moments/visibility";

export type MomentVisibilityGroupView = {
  id: number;
  name: string;
  days: number;
};

/**
 * 组的展示口径：组只会在全局天花板之内生效，所以前端要显示「实际能撑多久」。
 * 与 lib/moments/visibility-groups.ts 的 toView 同源，避免两处算法漂移。
 */
export function resolveGroupView(
  group: MomentVisibilityGroupView,
  globalDays: number,
) {
  const effectiveDays = resolveMomentVisibilityDays({
    globalDays,
    groupDays: group.days,
  });
  return {
    ...group,
    days: normalizeVisibilityDays(group.days),
    daysLabel: momentVisibilityDaysLabel(group.days),
    effectiveDays,
    effectiveLabel: momentVisibilityDaysLabel(effectiveDays),
    cappedByGlobal: globalDays !== MOMENT_VISIBILITY_UNLIMITED && globalDays < group.days,
  };
}

export type MomentVisibilityGroupResolved = ReturnType<typeof resolveGroupView>;
