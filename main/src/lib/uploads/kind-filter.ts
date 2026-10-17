/**
 * 媒体库的**类型分区**口径（图片 / 视频 / 音频）—— 纯常量与纯函数，组件与服务端共用。
 *
 * 用户口径：音频"储存在媒体库里和其他媒体一样，但音频和视频图片要分开放"，
 * 所以媒体库多一个类型维度：`?kind=image|video|audio`，空 = 全部（见 docs/moment-audio-spec.md §2.6）。
 * 取值与 `lib/uploads/admin.ts` 的 `mimePrefixesForKinds()` 一一对应，别在这里另造前缀。
 */
export const UPLOAD_KIND_FILTERS = [
  { value: "", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
] as const;

export type UploadKindFilterValue = (typeof UPLOAD_KIND_FILTERS)[number]["value"];

/** 只认这四个值：`?kind=` 里塞别的一律当"全部"（不给脏查询串机会，与列表接口的宽入口一致）。 */
export function parseUploadKindFilter(raw: string | undefined | null): UploadKindFilterValue {
  const value = (raw ?? "").trim();
  return UPLOAD_KIND_FILTERS.some((option) => option.value === value)
    ? (value as UploadKindFilterValue)
    : "";
}
