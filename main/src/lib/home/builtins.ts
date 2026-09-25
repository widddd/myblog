/**
 * 内置模块目录：名称、默认配置与默认格点。
 * 不含 react，后台 client 组件可直接引用。
 */

import type {
  BuiltinModuleKey,
  HomeModuleConfig,
  HomePlacementView,
} from "./types";

type DefaultBox = Pick<
  HomePlacementView,
  "col" | "colSpan" | "row" | "rowSpan" | "hPct"
>;

type DefaultMobileBox = Pick<
  HomePlacementView,
  "mobileCol" | "mobileColSpan" | "mobileRow" | "mobileHPct"
>;

export type BuiltinDefinition = {
  key: BuiltinModuleKey;
  slug: string;
  name: string;
  /** 后台左栏说明 */
  hint: string;
  /** 是否满宽出血（Banner 需要顶到视口两边） */
  bleed?: boolean;
  /** 首次写入格点时是否启用。缺省 true。 */
  defaultEnabled?: boolean;
  defaultConfig: HomeModuleConfig;
  defaultPlacement: DefaultBox;
  defaultMobilePlacement: DefaultMobileBox;
  /** 可在后台调整的字段，决定表单渲染哪些控件 */
  fields: BuiltinField[];
};

export type BuiltinField =
  | { kind: "text"; name: keyof HomeModuleConfig; label: string; placeholder?: string }
  | { kind: "textarea"; name: keyof HomeModuleConfig; label: string; rows?: number }
  | {
      kind: "lines";
      name: keyof HomeModuleConfig;
      label: string;
      hint?: string;
      max?: number;
    }
  | { kind: "number"; name: keyof HomeModuleConfig; label: string; min: number; max: number }
  | { kind: "toggle"; name: keyof HomeModuleConfig; label: string }
  | {
      kind: "select";
      name: keyof HomeModuleConfig;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
    };

export const BUILTIN_DEFINITIONS: readonly BuiltinDefinition[] = [
  {
    key: "banner",
    slug: "banner",
    name: "首页大图",
    hint: "满宽底图 + 站名。底图仍由站点设置的 Banner / Bing 日图决定。",
    bleed: true,
    defaultConfig: { subtitle: "记录思考，也记录生活。", height: "full" },
    defaultPlacement: { col: 1, colSpan: 12, row: 1, rowSpan: 1, hPct: 100 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 1,
      mobileHPct: 70,
    },
    fields: [
      { kind: "text", name: "subtitle", label: "副标题" },
      {
        kind: "select",
        name: "height",
        label: "高度",
        options: [
          { value: "full", label: "满屏" },
          { value: "large", label: "大（70vh）" },
          { value: "medium", label: "中（420px）" },
        ],
      },
    ],
  },
  {
    key: "welcome",
    slug: "welcome",
    name: "欢迎光临",
    hint: "左侧欢迎卡：标题、滚动色块与两个入口按钮。",
    defaultConfig: {
      eyebrow: "欢迎光临",
      lines: ["记录思考", "也记录生活"],
      chips: ["NX", "TS", "MD", "SQL", "CSS", "UI"],
      showChips: true,
      primaryLabel: "文章",
      primaryHref: "/posts",
      secondaryLabel: "瞬间",
      secondaryHref: "/moments",
    },
    defaultPlacement: { col: 1, colSpan: 6, row: 2, rowSpan: 1, hPct: 37 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 2,
      mobileHPct: 32,
    },
    fields: [
      { kind: "text", name: "eyebrow", label: "小标题" },
      { kind: "lines", name: "lines", label: "主标题（每行一句）", hint: "换行分隔，最多 3 行" },
      {
        kind: "lines",
        name: "chips",
        label: "漂浮色块文字",
        hint: "换行分隔，最多 12 条，每条最多 8 字",
        max: 12,
      },
      { kind: "toggle", name: "showChips", label: "显示滚动色块" },
      { kind: "text", name: "primaryLabel", label: "按钮一文字" },
      { kind: "text", name: "primaryHref", label: "按钮一链接" },
      { kind: "text", name: "secondaryLabel", label: "按钮二文字" },
      { kind: "text", name: "secondaryHref", label: "按钮二链接" },
    ],
  },
  {
    key: "recommend",
    slug: "recommend",
    name: "推荐文章",
    hint: "宫格小卡。取「首页推荐」文章，没有勾选时回退最新已发布。默认关闭，由瞬间模块占原位。",
    defaultEnabled: false,
    defaultConfig: { limit: 6 },
    defaultPlacement: { col: 7, colSpan: 6, row: 2, rowSpan: 1, hPct: 37 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 3,
      mobileHPct: 36,
    },
    fields: [{ kind: "number", name: "limit", label: "展示条数", min: 1, max: 6 }],
  },
  {
    key: "moments",
    slug: "moments",
    name: "瞬间",
    hint: "左侧瞬间开头文案，右侧二级缩略图瀑布。占原推荐文章格点。",
    defaultConfig: { heading: "瞬间", limit: 8 },
    defaultPlacement: { col: 7, colSpan: 6, row: 2, rowSpan: 1, hPct: 37 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 3,
      mobileHPct: 36,
    },
    fields: [
      { kind: "text", name: "heading", label: "标题" },
      { kind: "number", name: "limit", label: "文案条数", min: 3, max: 12 },
    ],
  },
  {
    key: "posts",
    slug: "posts",
    name: "文章卡片",
    hint: "上方分类栏 + 文章大卡 + 分页。",
    defaultConfig: { showCategoryBar: true },
    defaultPlacement: { col: 1, colSpan: 9, row: 3, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 4,
      mobileHPct: 0,
    },
    fields: [{ kind: "toggle", name: "showCategoryBar", label: "显示上方分类栏" }],
  },
  {
    key: "announcement",
    slug: "announcement",
    name: "公告",
    hint: "留空则沿用站点设置里的公告文案。",
    defaultConfig: { heading: "公告" },
    defaultPlacement: { col: 10, colSpan: 3, row: 3, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 5,
      mobileHPct: 0,
    },
    fields: [
      { kind: "text", name: "heading", label: "标题" },
      { kind: "textarea", name: "body", label: "内容（留空用站点设置）", rows: 3 },
    ],
  },
  {
    key: "site",
    slug: "site",
    name: "站点",
    hint: "文章 / 分类 / 标签数量统计。",
    defaultConfig: { heading: "站点" },
    defaultPlacement: { col: 10, colSpan: 3, row: 3, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 6,
      mobileHPct: 0,
    },
    fields: [{ kind: "text", name: "heading", label: "标题" }],
  },
  {
    key: "categories",
    slug: "categories",
    name: "分类",
    hint: "分类列表与各自文章数。",
    defaultConfig: { heading: "分类" },
    defaultPlacement: { col: 10, colSpan: 3, row: 3, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 7,
      mobileHPct: 0,
    },
    fields: [{ kind: "text", name: "heading", label: "标题" }],
  },
  {
    key: "tags",
    slug: "tags",
    name: "标签",
    hint: "标签云。",
    defaultConfig: { heading: "标签" },
    defaultPlacement: { col: 10, colSpan: 3, row: 3, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 8,
      mobileHPct: 0,
    },
    fields: [{ kind: "text", name: "heading", label: "标题" }],
  },
  {
    key: "recent",
    slug: "recent",
    name: "最近发布",
    hint: "带封面缩略图的最新文章列表。",
    defaultConfig: { heading: "最近发布", limit: 5 },
    defaultPlacement: { col: 10, colSpan: 3, row: 3, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 9,
      mobileHPct: 0,
    },
    fields: [
      { kind: "text", name: "heading", label: "标题" },
      { kind: "number", name: "limit", label: "展示条数", min: 1, max: 10 },
    ],
  },
  {
    key: "uptime",
    slug: "uptime",
    name: "运行时间",
    hint: "首页底部版本信息行中间显示站点已运行多久。开始时间在站点设置里填；空着则不显示。",
    defaultConfig: { heading: "本站已运行" },
    defaultPlacement: { col: 1, colSpan: 12, row: 4, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 10,
      mobileHPct: 0,
    },
    fields: [{ kind: "text", name: "heading", label: "标题" }],
  },
] as const;

const BY_KEY = new Map(BUILTIN_DEFINITIONS.map((item) => [item.key, item]));

export function builtinDefinition(
  key: BuiltinModuleKey | null,
): BuiltinDefinition | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

const CUSTOM_DESKTOP: DefaultBox = {
  col: 1,
  colSpan: 12,
  row: 1,
  rowSpan: 1,
  hPct: 0,
};
const CUSTOM_MOBILE: DefaultMobileBox = {
  mobileCol: 1,
  mobileColSpan: 12,
  mobileRow: 1,
  mobileHPct: 0,
};

/** 当前视口「重置大小」用的默认宽高（不改行列）。 */
export function defaultSizeFor(
  key: BuiltinModuleKey | null,
  viewport: "desktop" | "mobile",
): { colSpan: number; hPct: number } {
  const definition = builtinDefinition(key);
  if (viewport === "mobile") {
    const box = definition?.defaultMobilePlacement ?? CUSTOM_MOBILE;
    return { colSpan: box.mobileColSpan, hPct: box.mobileHPct };
  }
  const box = definition?.defaultPlacement ?? CUSTOM_DESKTOP;
  return { colSpan: box.colSpan, hPct: box.hPct };
}

/** 自建模块可用的积木清单（后台插入菜单用）。 */
export const BLOCK_LIBRARY = [
  { type: "heading", label: "标题", hint: "h2/h3 级标题" },
  { type: "text", label: "段落", hint: "纯文本段落" },
  { type: "button", label: "按钮", hint: "跳转链接按钮" },
  { type: "image", label: "图片", hint: "上传或外链图片" },
  { type: "divider", label: "分隔线", hint: "细线分隔" },
  { type: "postList", label: "文章大卡", hint: "复用前台 PostCard" },
  { type: "postGrid", label: "文章宫格", hint: "复用推荐位小卡" },
  { type: "categories", label: "分类列表", hint: "复用侧栏分类" },
  { type: "tags", label: "标签云", hint: "复用侧栏标签" },
  { type: "siteStats", label: "站点统计", hint: "文章/分类/标签数字" },
  { type: "recent", label: "最近发布", hint: "复用侧栏最近发布" },
  { type: "html", label: "HTML 片段", hint: "直接写一段 HTML" },
] as const;
