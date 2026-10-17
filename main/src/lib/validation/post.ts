import { z } from "zod";

import { MOMENT_MAX_MEDIA_TOTAL, momentContentError } from "@/lib/moments/compose-rules";
import { MOMENT_PEAK_BUCKETS, MOMENT_PEAK_MAX } from "@/lib/moments/peaks";
import { AUTHOR_NAME_MAX } from "@/lib/posts/author";
import { BANNER_STYLES, COVER_STYLES } from "@/lib/posts/banner";

export const POST_STATUSES = ["draft", "scheduled", "published"] as const;
export { BANNER_STYLES } from "@/lib/posts/banner";

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "颜色必须是 #RRGGBB");

/** 封面 / Banner 焦点：0–100 的百分比整数，50 = 居中。 */
const focalPercent = z.number().int().min(0).max(100);

export const postWriteSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(200),
  slug: z.string().trim().max(120).optional().nullable(),
  // 作者（笔名）。留空 = 用管理员账号上的默认笔名，见 lib/posts/author.ts
  authorName: z.string().trim().max(AUTHOR_NAME_MAX).optional().nullable(),
  content: z.string(),
  excerpt: z.string().max(2000).optional().nullable(),
  cover: z.string().max(500).optional().nullable(),
  coverStyle: z.enum(COVER_STYLES).optional(),
  coverColor: hexColor.optional().nullable(),
  coverColor2: hexColor.optional().nullable(),
  bannerStyle: z.enum(BANNER_STYLES).optional(),
  bannerImage: z.string().max(500).optional().nullable(),
  bannerColor: hexColor.optional().nullable(),
  bannerColor2: hexColor.optional().nullable(),
  coverFocalX: focalPercent.optional(),
  coverFocalY: focalPercent.optional(),
  bannerFocalX: focalPercent.optional(),
  bannerFocalY: focalPercent.optional(),
  status: z.enum(POST_STATUSES),
  publishedAt: z.string().optional().nullable(),
  pinned: z.boolean().optional(),
  recommend: z.boolean().optional(),
  // 文章页是否显示「已修改 + 修改时间」，编辑页设置栏可关
  showRevisedAt: z.boolean().optional(),
  password: z.string().max(128).optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  tagIds: z.array(z.number().int().positive()).optional(),
});

export const postPatchSchema = postWriteSchema.partial();

export const taxonomyWriteSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(40),
  slug: z.string().trim().max(80).optional().nullable(),
});

/** 笔名只存名字：作者没有独立页面，不需要 slug */
export const penNameWriteSchema = z.object({
  name: z.string().trim().min(1, "笔名不能为空").max(AUTHOR_NAME_MAX),
});

/** 一条瞬间里的一项媒体（图片 / 视频 / 语音）。kind 缺省 = 图片，旧数据零改动。 */
const momentMediaSchema = z.object({
  key: z.string().min(1),
  thumb: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  kind: z.enum(["image", "video", "audio"]).optional(),
  /** 视频 / 语音真实 mime；图片不写 */
  mime: z.string().max(100).optional(),
  /** 视频 / 语音时长（秒） */
  duration: z.number().positive().max(86_400).optional(),
  /** 语音波形峰值（0–100，最多 MOMENT_PEAK_BUCKETS 个）；拿不到就不写，见 lib/moments/peaks.ts */
  peaks: z.array(z.number().min(0).max(MOMENT_PEAK_MAX)).max(MOMENT_PEAK_BUCKETS).optional(),
});

/** 瞬间写入的公共形状（不含跨字段规则 —— `momentPatchSchema` 要 `.partial()`，套不上 refine）。 */
const momentBaseSchema = z.object({
  // 允许空：只发图片 / 视频 / 语音也成立（跨字段规则见 lib/moments/compose-rules.ts）
  content: z.string().trim().max(2000),
  // 数组上限 = 非音频 9 + 语音 5；真正的分项规则在 momentContentError（单一判定点）
  images: z.array(momentMediaSchema).max(MOMENT_MAX_MEDIA_TOTAL).optional(),
  // 可见范围组：null/缺省 = 跟随全局可见期；正整数 = 用该组的天数（见 lib/moments/visibility.ts）
  visibilityGroupId: z.number().int().positive().optional().nullable(),
});

export const momentWriteSchema = momentBaseSchema.superRefine((value, ctx) => {
  const message = momentContentError(value);
  if (message) {
    ctx.addIssue({ code: "custom", message });
  }
});

export const momentPatchSchema = momentBaseSchema.partial();
