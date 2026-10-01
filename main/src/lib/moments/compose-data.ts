import type { MomentComposeData } from "@/lib/moments/compose-types";
import { getSetting } from "@/lib/settings";
import { resolveMaxImagesPerBatch } from "@/lib/upload/limits";
import {
  MOMENT_VISIBILITY_DAYS_MAX,
  MOMENT_VISIBILITY_PRESETS,
  momentVisibilityDaysLabel,
} from "@/lib/moments/visibility";
import {
  getMomentVisibleDays,
  listMomentVisibilityGroups,
} from "@/lib/moments/visibility-groups";
import { resolveGroupView } from "@/lib/moments/visibility-group-view";
import { formatDateTimeSeconds } from "@/lib/utils/date";

export type {
  MomentComposeData,
  MomentVisibilityPanelData,
} from "@/lib/moments/compose-types";

/** 抽屉里除预设档位之外还要给预览的天数（自定义输入常用到的一档） */
const PREVIEW_EXTRA_DAYS = 45;

/**
 * 发瞬间的共享取数：概览页的「快速发瞬间」卡片与 `/admin/moments` 用的是同一份，
 * 避免两处各算一套可见期文案（不一致时最直观的表现就是卡片里显示的天数和列表对不上）。
 */
export async function loadMomentComposeData(
  now: Date = new Date(),
): Promise<MomentComposeData> {
  const [globalDays, groupRows, configuredMaxImages] = await Promise.all([
    getMomentVisibleDays(),
    listMomentVisibilityGroups(),
    // 与 Android 客户端走的是同一个 Setting（见 lib/upload/limits.ts），两处不会漂
    getSetting<number>("uploadMaxImagesPerBatch"),
  ]);
  // 组的「实际生效天数」在服务端算好（与抽屉里的显示同一套算法）
  const groups = groupRows.map((group) => resolveGroupView(group, globalDays));

  // 客户端组件不能接收函数，所以把可选天数的预览文案在这里一次性算成纯数据。
  const previewLabels: Record<string, string> = { "0": "" };
  for (const value of [
    ...MOMENT_VISIBILITY_PRESETS,
    globalDays,
    PREVIEW_EXTRA_DAYS,
  ]) {
    if (!(String(value) in previewLabels)) {
      previewLabels[String(value)] = formatDateTimeSeconds(
        new Date(now.getTime() - value * 86_400_000),
      );
    }
  }

  return {
    globalDays,
    groups,
    maxImages: resolveMaxImagesPerBatch(configuredMaxImages),
    settingsData: {
      initialDays: globalDays,
      currentLabel: momentVisibilityDaysLabel(globalDays),
      previewLabels,
      minDays: 1,
      maxDays: MOMENT_VISIBILITY_DAYS_MAX,
    },
    nowMs: now.getTime(),
  };
}
