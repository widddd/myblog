import { z } from "zod";

import {
  CHIP_MAX,
  CHIP_MAX_CHARS,
  CHIP_VISIBLE_MAX,
  CHIP_VISIBLE_MIN,
} from "@/lib/home/chips";
import { moduleStyleSchema } from "@/lib/home/style";
import { HOME_BLOCK_TYPES, HOME_GRID_COLUMNS, HOME_PIN_MODES, POPUP_PLACEMENTS } from "@/lib/home/types";
import { H_PCT_MAX } from "@/lib/layout/viewport";
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
        /**
         * 同格堆叠顺序。**后台会把它一起发上来**：只按 payload 顺序重算会抹掉
         * 「上移 / 下移」与「拖进同格第几位」的结果（保存前后顺序不一致）。
         * 不传时退回旧口径（按 `row, col` + payload 顺序重算）。
         */
        sort: z.number().int().min(0).max(1000).optional(),
        /**
         * 栏位（侧面/固定）：跟格点一起保存，写进模块 `config.pin`。
         * 它是「这一格怎么摆」的属性，跟位置/宽窄同一个心智模型，所以搭同一条写入路径。
         */
        pin: z.enum(HOME_PIN_MODES).optional(),
        hPct: z.number().int().min(0).max(H_PCT_MAX),
        mobileCol: z.number().int().min(1).max(HOME_GRID_COLUMNS),
        mobileColSpan: z.number().int().min(1).max(HOME_GRID_COLUMNS),
        mobileRow: z.number().int().min(1).max(200),
        mobileHPct: z.number().int().min(0).max(H_PCT_MAX),
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
    chips: z.array(z.string().max(CHIP_MAX_CHARS)).max(CHIP_MAX),
    showChips: z.boolean(),
    // 一屏看到几颗泡泡（只决定密度；总列表长度见 CHIP_MAX）
    chipVisible: z.number().int().min(CHIP_VISIBLE_MIN).max(CHIP_VISIBLE_MAX),
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
    // 首页相册模块：看哪些相册（每行一个地址名，留空 = 全部）+ 滚动速度
    albumSlugs: z.array(z.string().max(60)).max(20),
    speedSeconds: z.number().int().min(20).max(180),
    showCategoryBar: z.boolean(),
    // 文章卡片模块里穿插的瞬间卡：一页最多几条（0 = 关掉）
    momentLimit: z.number().int().min(0).max(8),
    heading: z.string().max(40),
    body: z.string().max(500),
    /** 栏位：auto（窄堆叠=侧面）/ side（钉住）/ flow（随页面滚） */
    pin: z.enum(HOME_PIN_MODES),
    // 覆盖层模块（弹出模块 / 推荐应用）
    placement: z.enum(POPUP_PLACEMENTS),
    delaySeconds: z.number().int().min(0).max(60),
    dismissible: z.boolean(),
    once: z.boolean(),
    text: z.string().max(300),
    actionLabel: z.string().max(24),
    actionHref: z
      .string()
      .max(300)
      .refine((value) => !value || isSafeHref(value), "链接只允许站内路径或 https"),
    image: z
      .string()
      .max(500)
      .refine((value) => !value || isSafeMediaUrl(value), "图片只允许本地上传或 https"),
    badge: z.string().max(16),
    card: z.boolean(),
    scopedCss: z.boolean(),
    /** 覆盖层开关（自建模块从「弹出模块 / 推荐应用」模板建出来时是 true） */
    floating: z.boolean(),
    // 基本样式（字体 / 配色 / 按钮 / 圆角…）在 lib/home/style.ts 里定义形状，
    // 表单、API 与读取侧共用同一份字段清单（避免 P-004 那种「配了不生效」）
    style: moduleStyleSchema,
  })
  .partial();

/** 模板带来的初始格点（与 homeLayoutPutSchema 同口径，缺省不传就不建 placement）。 */
const placementSchema = z.object({
  col: z.number().int().min(1).max(HOME_GRID_COLUMNS),
  colSpan: z.number().int().min(1).max(HOME_GRID_COLUMNS),
  row: z.number().int().min(1).max(200),
  hPct: z.number().int().min(0).max(H_PCT_MAX),
  mobileCol: z.number().int().min(1).max(HOME_GRID_COLUMNS),
  mobileColSpan: z.number().int().min(1).max(HOME_GRID_COLUMNS),
  mobileRow: z.number().int().min(1).max(200),
  mobileHPct: z.number().int().min(0).max(H_PCT_MAX),
});

export const moduleCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  html: z.string().max(MAX_CODE_LENGTH).optional(),
  css: z.string().max(MAX_CODE_LENGTH).optional(),
  js: z.string().max(MAX_CODE_LENGTH).optional(),
  blocks: z.array(blockSchema).max(40).optional(),
  config: configSchema.optional(),
  placement: placementSchema.optional(),
});

export const modulePatchSchema = moduleCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个要修改的字段" },
);
