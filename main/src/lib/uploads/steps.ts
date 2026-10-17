/**
 * 媒体「发布」两步的名字，以及「没配 COS 时该跳过哪一步」的规则。
 *
 * 纯函数、无 prisma / next 依赖，可直接单测（配 steps.test.ts）。
 *
 * 背景（这是一条被踩过的规则，别再改回去）：
 * COS 在本项目里是**可选**的——`docs/api-contracts.md` 的 `POST /api/upload` 明确写着
 * 「未配 COS 时也可入库」。两步的实际含义是：
 * - `derivatives`：只在本机生成一级 / 二级缩略图 → **任何站点都该做**；
 * - `replicate`：把原图与一级缩略图传到 COS，并把 `driver` 改成 `cos` → 没有 COS 时
 *   **无从执行，也不该报错**，直接跳过（调用方拿到 `{skipped:true}`，媒体留在本机）。
 *
 * 老实现走到 `replicate` 会抛 503「请先在设置里填写腾讯云 COS 配置后再发布」，
 * 于是纯本地站点上**媒体库上传、文章保存发布、发瞬间**三条路都会失败（见 P-145）。
 */
export const MEDIA_STEPS = ["derivatives", "replicate"] as const;

export type MediaStep = (typeof MEDIA_STEPS)[number];

/** 这一步在没有 COS 时是否该跳过（只有「上云」那一步）。 */
export function shouldSkipCosStep(step: MediaStep, cosConfigured: boolean): boolean {
  return step === "replicate" && !cosConfigured;
}
