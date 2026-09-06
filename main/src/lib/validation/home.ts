import { z } from "zod";

import { HOME_BLOCK_TYPES, HOME_GRID_COLUMNS } from "@/lib/home/types";
import { isSafeHref, isSafeMediaUrl } from "@/lib/media/url";

const MAX_CODE_LENGTH = 32_768;

export const homeLayoutPutSchema = z.object({
  items: z
    .array(
      z.object({
        moduleId: z.number().int().positive(),
        enabled: z.boolean(),
        col: z.number().int().min(1).max(HOME_GRID_COLUMNS),
        colSpan: z.number().int().min(1).max(HOME_GRID_COLUMNS),
        row: z.number().int().min(1).max(200),
        hPct: z.number().int().min(0).max(100),
        mobileCol: z.number().int().min(1).max(HOME_GRID_COLUMNS),
        mobileColSpan: z.number().int().min(1).max(HOME_GRID_COLUMNS),
        mobileRow: z.number().int().min(1).max(200),
        mobileHPct: z.number().int().min(0).max(100),
      }),
    )
    .max(200),
});

const blockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(HOME_BLOCK_TYPES),
  text: z.string().max(2_000).optional(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  href: z
    .string()
    .max(500)
    .refine((value) => !value || isSafeHref(value), "链接只允许站内路径或 https")
    .optional(),
  src: z
    .string()
    .max(500)
    .refine((value) => !value || isSafeMediaUrl(value), "图片只允许本地上传或 https")
    .optional(),
  alt: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(12).optional(),
  source: z.enum(["latest", "recommend"]).optional(),
  variant: z.enum(["solid", "ghost"]).optional(),
});

/** 内置模块的可调项 + 自建模块的包裹开关。未知键一律丢掉。 */
const configSchema = z
  .object({
    subtitle: z.string().max(200),
    height: z.enum(["full", "large", "medium"]),
    eyebrow: z.string().max(60),
    title: z.string().max(120),
    lines: z.array(z.string().max(60)).max(3),
    chips: z.array(z.string().max(8)).max(12),
    showChips: z.boolean(),
    primaryLabel: z.string().max(20),
    primaryHref: z
      .string()
      .max(200)
      .refine((value) => !value || isSafeHref(value), "链接只允许站内路径或 https"),
    secondaryLabel: z.string().max(20),
    secondaryHref: z
      .string()
      .max(200)
      .refine((value) => !value || isSafeHref(value), "链接只允许站内路径或 https"),
    limit: z.number().int().min(1).max(12),
    showCategoryBar: z.boolean(),
    heading: z.string().max(40),
    body: z.string().max(500),
    card: z.boolean(),
    scopedCss: z.boolean(),
  })
  .partial();

export const moduleCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  html: z.string().max(MAX_CODE_LENGTH).optional(),
  css: z.string().max(MAX_CODE_LENGTH).optional(),
  js: z.string().max(MAX_CODE_LENGTH).optional(),
  blocks: z.array(blockSchema).max(40).optional(),
  config: configSchema.optional(),
});

export const modulePatchSchema = moduleCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个要修改的字段" },
);
