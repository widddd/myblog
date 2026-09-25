import { z } from "zod";

import { AUTHOR_NAME_MAX } from "@/lib/posts/author";

export const POST_STATUSES = ["draft", "scheduled", "published"] as const;
export const BANNER_STYLES = ["cover", "solid", "gradient"] as const;

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "颜色必须是 #RRGGBB");

export const postWriteSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(200),
  slug: z.string().trim().max(120).optional().nullable(),
  // 作者（笔名）。留空 = 用管理员账号上的默认笔名，见 lib/posts/author.ts
  authorName: z.string().trim().max(AUTHOR_NAME_MAX).optional().nullable(),
  content: z.string(),
  excerpt: z.string().max(2000).optional().nullable(),
  cover: z.string().max(500).optional().nullable(),
  bannerStyle: z.enum(BANNER_STYLES).optional(),
  bannerColor: hexColor.optional().nullable(),
  bannerColor2: hexColor.optional().nullable(),
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

export const momentWriteSchema = z.object({
  content: z.string().trim().min(1, "内容不能为空").max(2000),
  images: z
    .array(
      z.object({
        key: z.string().min(1),
        thumb: z.string().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .max(9)
    .optional(),
});

export const momentPatchSchema = momentWriteSchema.partial();
