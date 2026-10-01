import type { MomentVisibilityGroupView } from "@/lib/moments/visibility-group-view";

/**
 * 发瞬间相关的**纯类型**（没有任何 import 副作用，client 组件可以直接引用）。
 *
 * 单独成文件的原因：取数实现 `lib/moments/compose-data.ts` 会连带 `visibility-groups.ts` → prisma，
 * 客户端组件只能引用这里的类型，不能碰那个模块（否则会把服务端依赖拖进 client bundle）。
 */

/**
 * 全局可见期面板 / 详细设置抽屉要的纯数据。
 * 客户端组件不能接收函数（RSC 会直接报错），所以文案一律在服务端算好再传下来。
 */
export type MomentVisibilityPanelData = {
  /** 已保存的全局可见期（天，0 = 永久公开） */
  initialDays: number;
  /** 当前生效值文案 */
  currentLabel: string;
  /** 每个可选天数 → 该天数下的预览截止时刻文案（本地日期时间） */
  previewLabels: Record<string, string>;
  /** 自定义输入的下界/上界 */
  minDays: number;
  maxDays: number;
};

/** 发一条瞬间所需的全部服务端数据。 */
export type MomentComposeData = {
  /** 全局可见期（天，0 = 永久公开） */
  globalDays: number;
  /** 可见范围组（已按 min(全局, 组) 算好实际生效天数的视图） */
  groups: MomentVisibilityGroupView[];
  /** 「详细设置」抽屉的纯数据 */
  settingsData: MomentVisibilityPanelData;
  /** 一次最多能选几张图（后台 Setting `uploadMaxImagesPerBatch`，与 Android 客户端同源） */
  maxImages: number;
  /** 服务端渲染时刻：列表首屏的「还剩多久」用它保证水合一致 */
  nowMs: number;
};
