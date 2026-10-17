/**
 * 首页模块的「基本样式」：字体、字号、配色、按钮、圆角、留白、对齐。
 *
 * 设计要点：**不在数据库上开新列**。样式是有默认值、可增量覆盖的一组键，
 * 正好是 `HomeModule.config`（JSON）原本的用法，也自动继承了「读取时与默认值合并」。
 *
 * 只产出一条「变量名 → CSS 值」的映射，DOM 侧把每个变量同时写进
 * `style` 与 `data-mod-style`（见 `styleAttribute()`）：内联 style 用来穿透
 * `.home-popup` / `.home-custom-module` 这些自带外观的容器，`data-mod-style`
 * 用来让 CSS 能按「用户有没有说过话」分开处理 —— 否则没配过的模块会被
 * 「一个都没写」的默认值覆盖掉站点主题（见 docs/pitfalls.md P-137）。
 *
 * 不含 prisma / react，client 组件可直接引用。
 */

import { z } from "zod";

import { isSafeMediaUrl } from "@/lib/media/url";

export type ModuleStyle = {
  fontFamily?: ModuleFont;
  fontSize?: number;
  textColor?: string;
  headingColor?: string;
  background?: string;
  accent?: string;
  radius?: number;
  padding?: number;
  align?: ModuleAlign;
  buttonText?: string;
  buttonTextColor?: string;
  buttonRadius?: number;
  buttonFull?: boolean;
  shadow?: boolean;
  bgImage?: string;
  bgDim?: number;
};

export const MODULE_FONTS = ["inherit", "sans", "serif", "mono", "rounded"] as const;
export type ModuleFont = (typeof MODULE_FONTS)[number];

export const MODULE_ALIGNS = ["left", "center", "right"] as const;
export type ModuleAlign = (typeof MODULE_ALIGNS)[number];

export const MODULE_FONT_LABELS: ReadonlyArray<{ value: ModuleFont; label: string }> = [
  { value: "inherit", label: "跟随站点" },
  { value: "sans", label: "无衬线（黑体）" },
  { value: "serif", label: "衬线（宋体）" },
  { value: "mono", label: "等宽（代码）" },
  { value: "rounded", label: "圆体" },
];

export const MODULE_ALIGN_LABELS: ReadonlyArray<{ value: ModuleAlign; label: string }> = [
  { value: "left", label: "左对齐" },
  { value: "center", label: "居中" },
  { value: "right", label: "右对齐" },
];

/** 字体栈：中英文各给一条，Windows / Linux / 手机都用系统字体，不引外部字体文件。 */
const FONT_STACKS: Record<ModuleFont, string> = {
  inherit: "inherit",
  sans: '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans SC", system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: '"Songti SC", SimSun, "Noto Serif SC", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Mono", "Noto Sans Mono", monospace',
  rounded: '"Quicksand", "Comic Sans MS", "Yuanti SC", "PingFang SC", system-ui, sans-serif',
};

export const MODULE_STYLE_LIMITS = {
  fontSize: { min: 12, max: 22 },
  radius: { min: 0, max: 40 },
  padding: { min: 0, max: 64 },
  buttonRadius: { min: 0, max: 999 },
  bgDim: { min: 0, max: 90 },
} as const;

/** 模块样式里所有长度/百分比字段的区间，编辑器滑杆与校验共用。 */
export const MODULE_STYLE_NUMERIC_FIELDS = [
  "fontSize",
  "radius",
  "padding",
  "buttonRadius",
  "bgDim",
] as const;

export type ModuleStyleNumericField = (typeof MODULE_STYLE_NUMERIC_FIELDS)[number];

const COLOR_ERROR = "颜色只支持 #hex、rgb()、hsl() 或 var(--token) 写法";
const MEDIA_URL_ERROR = "图片只允许本地上传或 https";

const isNumericField = (value: string): value is ModuleStyleNumericField =>
  (MODULE_STYLE_NUMERIC_FIELDS as readonly string[]).includes(value);

/**
 * 这些样式字段就是**能落到 `style` 属性里的全部输入面**：所以每个字段都自带
 * `isSafe*` 级别的校验 —— 颜色只收 CSS 能安全接受的字面量、图片只收本地上传或 https。
 * 表单、API（zod）与读取侧（`normalizeModuleStyle`）三处共用这一份形状，不各写一套。
 */
const styleShape = {
  fontFamily: z.enum(MODULE_FONTS).optional(),
  fontSize: z.number().int().min(MODULE_STYLE_LIMITS.fontSize.min).max(MODULE_STYLE_LIMITS.fontSize.max).optional(),
  textColor: z.string().max(64).refine(isColorValue, COLOR_ERROR).optional(),
  headingColor: z.string().max(64).refine(isColorValue, COLOR_ERROR).optional(),
  background: z.string().max(64).refine(isColorValue, COLOR_ERROR).optional(),
  accent: z.string().max(64).refine(isColorValue, COLOR_ERROR).optional(),
  radius: z.number().int().min(MODULE_STYLE_LIMITS.radius.min).max(MODULE_STYLE_LIMITS.radius.max).optional(),
  padding: z.number().int().min(MODULE_STYLE_LIMITS.padding.min).max(MODULE_STYLE_LIMITS.padding.max).optional(),
  align: z.enum(MODULE_ALIGNS).optional(),
  buttonText: z.string().max(64).refine(isColorValue, COLOR_ERROR).optional(),
  buttonTextColor: z.string().max(64).refine(isColorValue, COLOR_ERROR).optional(),
  buttonRadius: z.number().int().min(MODULE_STYLE_LIMITS.buttonRadius.min).max(MODULE_STYLE_LIMITS.buttonRadius.max).optional(),
  buttonFull: z.boolean().optional(),
  shadow: z.boolean().optional(),
  bgImage: z
    .string()
    .max(500)
    .refine((value) => !value || isSafeMediaUrl(value), MEDIA_URL_ERROR)
    .optional(),
  bgDim: z.number().int().min(MODULE_STYLE_LIMITS.bgDim.min).max(MODULE_STYLE_LIMITS.bgDim.max).optional(),
} as const;

/**
 * 「有哪些样式字段」的**单一事实源**：写入用的 zod 形状、读取侧的清洗都必须由它派生。
 * （曾经最危险的分叉是「zod 收下了一个字段，读取侧不认识」—— 写进库、渲染时静默丢掉；
 * 反过来「读取侧处理了但 zod 不收」则是表单里配了半天、保存时被吃掉。）
 */
export const MODULE_STYLE_FIELDS = Object.keys(styleShape) as Array<keyof ModuleStyle>;

/** 写入校验用（zod）；`strict` 让拼错的键在 API 层直接 400，而不是静默丢弃。 */
export const moduleStyleSchema = z.object(styleShape).strict();

/** 校验失败时的中文提示（把 zod 的英文默认报错换成用户能照做的说法）。 */
export function describeStyleIssue(
  value: unknown,
): { path: string; message: string } | null {
  const parsed = moduleStyleSchema.safeParse(value);
  if (parsed.success) {
    return null;
  }
  const issue = parsed.error.issues[0];
  const path = String(issue?.path[0] ?? "");
  const message = path && isNumericField(path)
    ? `「${path}」需要在 ${MODULE_STYLE_LIMITS[path].min}–${MODULE_STYLE_LIMITS[path].max} 之间`
    : (issue?.message ?? "样式字段不合法");
  return { path, message };
}

/**
 * 允许的颜色写法：`#rgb` / `#rrggbb` / `#rrggbbaa` / `rgb(a,)` / `hsl(a,)`，
 * 以及本项目的主题变量（`var(--heo-theme)` 这类，能自动跟随明暗主题）。
 * 其它一律丢掉 —— 这个值会被写进 `style` 属性，不能让它当任意 CSS 值的通道。
 */
const COLOR_PATTERNS: readonly RegExp[] = [
  /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  /^rgba?\(\s*[\d.\s,%/]+\)$/i,
  /^hsla?\(\s*[\d.\s,%/deg]+\)$/i,
  /^var\(\s*--[a-z0-9-]+\s*(?:,\s*[^()]*)?\)$/i,
];

export function isColorValue(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) {
    return false;
  }
  return COLOR_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isModuleFont(value: unknown): value is ModuleFont {
  return typeof value === "string" && (MODULE_FONTS as readonly string[]).includes(value);
}

export function isModuleAlign(value: unknown): value is ModuleAlign {
  return typeof value === "string" && (MODULE_ALIGNS as readonly string[]).includes(value);
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/**
 * 归一化一份样式：未知键丢掉、超范围夹回、颜色只放行 CSS 能安全接受的字面量。
 * **只保留真正写过的键**，读侧据此判断「用户有没有改过」。
 *
 * 两处刻意与校验用 zod **不完全同构**（本函数更宽松，库里的历史脏值不该让页面挂掉）：
 * - 数值超范围夹回，而不是整条丢掉；字符串数字（表单直传）也认；
 * - 认得出但等于默认值的字段（`fontFamily: "inherit"`、`align: "left"`、`bgDim: 0`…）
 *   视为「没写」，否则默认值会以「用户明确指定」的身份覆盖主题。
 */
export function normalizeModuleStyle(input: unknown): ModuleStyle {
  if (!input || typeof input !== "object") {
    return {};
  }
  const raw = input as Record<string, unknown>;
  const style: ModuleStyle = {};

  if (isModuleFont(raw.fontFamily) && raw.fontFamily !== "inherit") {
    style.fontFamily = raw.fontFamily;
  }
  const fontSize = clampNumber(
    raw.fontSize,
    MODULE_STYLE_LIMITS.fontSize.min,
    MODULE_STYLE_LIMITS.fontSize.max,
  );
  if (fontSize !== undefined) {
    style.fontSize = fontSize;
  }

  for (const key of ["textColor", "headingColor", "background", "accent", "buttonText", "buttonTextColor"] as const) {
    const value = raw[key];
    if (isColorValue(value)) {
      style[key] = value.trim();
    }
  }

  const radius = clampNumber(
    raw.radius,
    MODULE_STYLE_LIMITS.radius.min,
    MODULE_STYLE_LIMITS.radius.max,
  );
  if (radius !== undefined) {
    style.radius = radius;
  }
  const padding = clampNumber(
    raw.padding,
    MODULE_STYLE_LIMITS.padding.min,
    MODULE_STYLE_LIMITS.padding.max,
  );
  if (padding !== undefined) {
    style.padding = padding;
  }
  const buttonRadius = clampNumber(
    raw.buttonRadius,
    MODULE_STYLE_LIMITS.buttonRadius.min,
    MODULE_STYLE_LIMITS.buttonRadius.max,
  );
  if (buttonRadius !== undefined) {
    style.buttonRadius = buttonRadius;
  }

  if (isModuleAlign(raw.align) && raw.align !== "left") {
    style.align = raw.align;
  }
  if (raw.buttonFull === true) {
    style.buttonFull = true;
  }
  if (raw.shadow === false) {
    style.shadow = false;
  }

  // 背景图只放行本地上传或 https 外链（与其它媒体字段同一口径）。
  if (typeof raw.bgImage === "string" && isSafeMediaUrl(raw.bgImage.trim())) {
    style.bgImage = raw.bgImage.trim().slice(0, 500);
  }
  const bgDim = clampNumber(
    raw.bgDim,
    MODULE_STYLE_LIMITS.bgDim.min,
    MODULE_STYLE_LIMITS.bgDim.max,
  );
  if (bgDim !== undefined && bgDim > 0) {
    style.bgDim = bgDim;
  }

  return style;
}

export function hasModuleStyle(style: ModuleStyle): boolean {
  return Object.keys(style).length > 0;
}

/** 把颜色换算成 `<input type="color">` 能显示的值；主题变量之类取不到就回退。 */
export function colorInputValue(value: string | undefined, fallback = "#ffffff"): string {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hex) {
    const body = hex[1];
    return (body.length === 3
      ? `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`
      : `#${body}`
    ).toLowerCase();
  }
  // var(--heo-card-bg) 这类：编辑器的色块给个中性值，文本输入框里仍保留原值
  return fallback;
}

/**
 * 样式 → CSS 变量表。
 *
 * `--mod-*` 是模块自己的命名空间，和站点主题的 `--heo-*` 不重叠；
 * 每个变量只在该字段**确实写过**的时候才出现，没写的交给 CSS 兜底值
 * （也就是站点主题），这样「什么都不配」= 和改造前完全一样。
 */
export function moduleStyleVars(style: ModuleStyle): Record<string, string> {
  const vars: Record<string, string> = {};
  const put = (name: string, value: string | number | undefined) => {
    if (value !== undefined) {
      vars[name] = typeof value === "number" ? String(value) : value;
    }
  };

  put("--mod-font", style.fontFamily ? FONT_STACKS[style.fontFamily] : undefined);
  put("--mod-font-size", style.fontSize ? `${style.fontSize}px` : undefined);
  put("--mod-text", style.textColor);
  put("--mod-heading", style.headingColor);
  put("--mod-bg", style.background);
  put("--mod-accent", style.accent);
  put("--mod-radius", style.radius !== undefined ? `${style.radius}px` : undefined);
  put("--mod-padding", style.padding !== undefined ? `${style.padding}px` : undefined);
  put("--mod-align", style.align);
  put("--mod-btn-bg", style.buttonText);
  put("--mod-btn-text", style.buttonTextColor);
  put("--mod-btn-radius", style.buttonRadius !== undefined ? `${style.buttonRadius}px` : undefined);
  put("--mod-btn-width", style.buttonFull ? "100%" : undefined);
  put("--mod-btn-justify", style.buttonFull ? "center" : undefined);
  put("--mod-shadow", style.shadow === false ? "none" : undefined);
  put("--mod-bg-image", style.bgImage ? `url("${style.bgImage}")` : undefined);
  put("--mod-bg-dim", style.bgDim ? String(style.bgDim / 100) : undefined);

  return vars;
}

/**
 * 写进 `style` 属性的那份：变量名 → 值。
 * `data-mod-style` 另由 `styledAttributeNames()` 生成，两份一起贴在同一个元素上。
 */
export function styleAttribute(style: ModuleStyle): Record<string, string> {
  return moduleStyleVars(style);
}

/** `data-mod-style` 的值：本次真正配过的变量名，空格分隔（CSS 用它做 `~=` 判断）。 */
export function styledAttributeNames(style: ModuleStyle): string {
  return Object.keys(moduleStyleVars(style)).join(" ");
}

/**
 * 内联样式 + 数据属性，一起贴到模块根元素上。
 * 返回的是纯对象，组件那边按 `React.CSSProperties` 断言即可（本文件不 import react）。
 */
export function moduleStyleProps(style: ModuleStyle): {
  style: Record<string, string>;
  "data-mod-style"?: string;
} {
  const names = styledAttributeNames(style);
  return {
    style: styleAttribute(style),
    ...(names ? { "data-mod-style": names } : {}),
  };
}
