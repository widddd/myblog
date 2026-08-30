import { z } from "zod";

export const POST_STATUSES = ["draft", "scheduled", "published"] as const;
export const BANNER_STYLES = ["cover", "solid", "gradient"] as const;

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "颜色必须是 #RRGGBB");

export const postWriteSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(200),
  slug: z.string().trim().max(120).optional().nullable(),
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
  password: z.string().max(128).optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  tagIds: z.array(z.number().int().positive()).optional(),
});

export const postPatchSchema = postWriteSchema.partial();

export const taxonomyWriteSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(40),
  slug: z.string().trim().max(80).optional().nullable(),
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
