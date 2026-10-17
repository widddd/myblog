/**
 * 内置模块目录：名称、默认配置与默认格点。
 * 不含 react，后台 client 组件可直接引用。
 */

import type {
  BuiltinModuleKey,
  HomeModuleConfig,
  HomePlacementView,
} from "./types";
import {
  HOME_ALBUM_CARD_LIMIT_DEFAULT,
  HOME_ALBUM_CARD_LIMIT_MAX,
  HOME_ALBUM_CARD_LIMIT_MIN,
  HOME_ALBUM_LIMIT_DEFAULT,
  HOME_ALBUM_LIMIT_MAX,
  HOME_ALBUM_LIMIT_MIN,
  HOME_ALBUM_SPEED_DEFAULT,
  HOME_ALBUM_SPEED_MAX,
  HOME_ALBUM_SPEED_MIN,
} from "./albums";
import {
  CHIP_MAX,
  CHIP_MAX_CHARS,
  CHIP_VISIBLE_MAX,
  CHIP_VISIBLE_MIN,
  DEFAULT_CHIP_VISIBLE,
} from "./chips";
import { APP_PROMO_CSS_DEFAULT, APP_PROMO_HTML } from "./templates";

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
  /**
   * 是否覆盖层模块：不进格点流，由 `HomeFloat` 画成 `position: fixed` 盖在所有模块之上。
   * 后台画布仍然照常显示它（静态预览），否则没法配大小位置。
   */
  floating?: boolean;
  /**
   * 是否「可编辑内置模块」：代码三栏与积木对内置记录也开放（API 与编辑器都据此放行）。
   * 目前只有「推荐应用」——它要能被整块换掉 HTML，而不只是一直用 React 组件那份结构。
   */
  editable?: boolean;
  /** 可编辑内置模块的出厂代码：新建内置记录时写进 html/css/js（见 templates.ts 里的同款模板） */
  defaultCode?: { html?: string; css?: string; js?: string };
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
    // Banner 的高度由它自己的 `config.height` 预设决定（满屏 100vh / 大 70vh / 中 420px），
    // **不占 `hPct`**：格点高度恒为 0（自适应，格子跟着 banner 实际高度走）。
    // 在 `hPct` 里再给一个高度只会把它钉死（P-139：自适应分支里写 banner 的 height 会压坏它）。
    defaultPlacement: { col: 1, colSpan: 12, row: 1, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 1,
      mobileHPct: 0,
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
      chipVisible: DEFAULT_CHIP_VISIBLE,
      primaryLabel: "文章",
      primaryHref: "/posts",
      secondaryLabel: "瞬间",
      secondaryHref: "/moments",
    },
    defaultPlacement: { col: 1, colSpan: 6, row: 2, rowSpan: 1, hPct: 380 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 2,
      mobileHPct: 340,
    },
    fields: [
      { kind: "text", name: "eyebrow", label: "小标题" },
      { kind: "lines", name: "lines", label: "主标题（每行一句）", hint: "换行分隔，最多 3 行" },
      {
        kind: "lines",
        name: "chips",
        label: "漂浮色块文字",
        hint: `换行分隔，最多 ${CHIP_MAX} 条，每条最多 ${CHIP_MAX_CHARS} 字。每次进页面会打散顺序，多出来的依次往上滚。`,
        max: CHIP_MAX,
      },
      { kind: "toggle", name: "showChips", label: "显示滚动色块" },
      {
        kind: "number",
        name: "chipVisible",
        label: "一屏看到几颗（越密越小）",
        min: CHIP_VISIBLE_MIN,
        max: CHIP_VISIBLE_MAX,
      },
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
    defaultPlacement: { col: 7, colSpan: 6, row: 2, rowSpan: 1, hPct: 380 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 3,
      mobileHPct: 340,
    },
    fields: [{ kind: "number", name: "limit", label: "展示条数", min: 1, max: 6 }],
  },
  {
    key: "moments",
    slug: "moments",
    name: "瞬间",
    hint: "左侧瞬间开头文案，右侧二级缩略图瀑布。占原推荐文章格点。",
    defaultConfig: { heading: "瞬间", limit: 8 },
    defaultPlacement: { col: 7, colSpan: 6, row: 2, rowSpan: 1, hPct: 380 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 3,
      mobileHPct: 340,
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
    hint: "上方分类栏 + 文章大卡 + 分页。可以在文章之间穿插瞬间卡：按发布时间与文章混排（早的在前），只画图 + 短文案，点卡片去瞬间页并高亮那一条。",
    defaultConfig: {
      showCategoryBar: true,
      momentLimit: 3,
    },
    defaultPlacement: { col: 1, colSpan: 9, row: 3, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 4,
      mobileHPct: 0,
    },
    fields: [
      { kind: "toggle", name: "showCategoryBar", label: "显示上方分类栏" },
      {
        kind: "number",
        name: "momentLimit",
        label: "一页最多穿插几个瞬间",
        min: 0,
        max: 8,
      },
    ],
  },
  {
    key: "albums",
    slug: "albums",
    name: "相册",
    hint: "把部分相册照片做成缓慢横向滚动的预览条，点图进对应相册。可以指定只看哪几个相册（留空 = 全部启用相册）。默认关闭——打开它才会出现在首页。",
    defaultEnabled: false,
    defaultConfig: {
      heading: "相册",
      albumSlugs: [],
      limit: HOME_ALBUM_LIMIT_DEFAULT,
      speedSeconds: HOME_ALBUM_SPEED_DEFAULT,
    },
    defaultPlacement: { col: 1, colSpan: 12, row: 4, rowSpan: 1, hPct: 260 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 11,
      mobileHPct: 200,
    },
    fields: [
      { kind: "text", name: "heading", label: "标题" },
      {
        kind: "lines",
        name: "albumSlugs",
        label: "只看这几个相册（留空 = 全部）",
        hint: "每行一个相册地址名，就是 /albums/ 后面那一段（后台相册页里能看到）。",
        max: 20,
      },
      {
        kind: "number",
        name: "limit",
        label: "最多展示几张",
        min: HOME_ALBUM_LIMIT_MIN,
        max: HOME_ALBUM_LIMIT_MAX,
      },
      {
        kind: "number",
        name: "speedSeconds",
        label: "滚动一轮几秒（越小越快）",
        min: HOME_ALBUM_SPEED_MIN,
        max: HOME_ALBUM_SPEED_MAX,
      },
    ],
  },
  {
    key: "album-cards",
    slug: "album-cards",
    name: "相册卡片",
    hint: "一叠一叠摆出来的相册卡：封面是这本相册的几张照片（进页面约 1 秒后轻轻抽出），下面写标题、张数与日期区间，点卡进这本相册。可以只挑几个相册。默认关闭——打开它才会出现在首页。",
    defaultEnabled: false,
    defaultConfig: {
      heading: "相册",
      albumSlugs: [],
      limit: HOME_ALBUM_CARD_LIMIT_DEFAULT,
    },
    // 与瞬间模块**同出厂规格**（宽 6 列 × 高 380px / 手机满宽 340px）：
    // 用户要求「默认就和瞬间模块一样大」，所以这两个数字必须和 moments 的定义保持一致
    defaultPlacement: { col: 7, colSpan: 6, row: 4, rowSpan: 1, hPct: 380 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 13,
      mobileHPct: 340,
    },
    fields: [
      { kind: "text", name: "heading", label: "标题" },
      {
        kind: "lines",
        name: "albumSlugs",
        label: "只摆这几个相册（留空 = 全部）",
        hint: "每行一个相册地址名，就是 /albums/ 后面那一段（后台相册页里能看到）。",
        max: 20,
      },
      {
        kind: "number",
        name: "limit",
        label: "最多摆几本",
        min: HOME_ALBUM_CARD_LIMIT_MIN,
        max: HOME_ALBUM_CARD_LIMIT_MAX,
      },
    ],
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
  {
    key: "popup",
    slug: "popup",
    name: "弹出模块",
    hint: "覆盖在所有模块之上的弹出卡片：选一条边从画面外滑入（左 / 右上 / 右下），或做成居中提示框。可设进入多少秒后出现、要不要关闭叉叉、关掉后是否记住。宽度看这里的列跨度，位置看列与行。默认关闭。",
    floating: true,
    defaultEnabled: false,
    defaultConfig: {
      placement: "top-right",
      delaySeconds: 3,
      dismissible: true,
      once: false,
      title: "欢迎回来",
      text: "这里可以写一句想让访客看到的话。",
      actionLabel: "知道了",
      actionHref: "",
      image: "",
    },
    defaultPlacement: { col: 9, colSpan: 4, row: 1, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 11,
      mobileHPct: 0,
    },
    fields: [
      {
        kind: "select",
        name: "placement",
        label: "从哪出现",
        options: [
          { value: "left", label: "左侧滑入" },
          { value: "top-right", label: "右上角滑入" },
          { value: "bottom-right", label: "右下角滑入" },
          { value: "center", label: "居中提示框" },
        ],
      },
      {
        kind: "number",
        name: "delaySeconds",
        label: "进页面几秒后出现",
        min: 0,
        max: 60,
      },
      { kind: "toggle", name: "dismissible", label: "显示关闭叉叉" },
      { kind: "toggle", name: "once", label: "关闭后不再出现（记录在本机）" },
      { kind: "text", name: "title", label: "标题" },
      { kind: "textarea", name: "text", label: "正文", rows: 3 },
      { kind: "text", name: "actionLabel", label: "按钮文字（留空不显示）" },
      { kind: "text", name: "actionHref", label: "按钮链接" },
      { kind: "text", name: "image", label: "配图地址（可留空）" },
    ],
  },
  {
    key: "app-promo",
    slug: "app-promo",
    name: "推荐应用",
    hint: "自带走秒与右上角滑入的推荐卡：方形应用图标 + 标题 + 一句说明 + 下载按钮，点按钮跳到静态下载页。白卡简约风，覆盖在所有模块之上；宽度看列跨度。默认关闭。**可编辑的内置模块**：不写代码时用内置 React 卡片，写了 HTML/CSS/JS 就整块换成你的版本（见 docs/module-html-guide.md）。",
    floating: true,
    editable: true,
    defaultEnabled: false,
    defaultCode: { html: APP_PROMO_HTML, css: APP_PROMO_CSS_DEFAULT },
    defaultConfig: {
      placement: "top-right",
      delaySeconds: 3,
      dismissible: true,
      once: false,
      badge: "推荐应用",
      title: "下载应用 SmartBlog",
      text: "随时查看我的动态",
      actionLabel: "立即下载",
      actionHref: "/pages/smartblog",
      image: "",
    },
    defaultPlacement: { col: 9, colSpan: 4, row: 1, rowSpan: 1, hPct: 0 },
    defaultMobilePlacement: {
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 12,
      mobileHPct: 0,
    },
    fields: [
      {
        kind: "select",
        name: "placement",
        label: "从哪出现",
        options: [
          { value: "left", label: "左侧滑入" },
          { value: "top-right", label: "右上角滑入" },
          { value: "bottom-right", label: "右下角滑入" },
          { value: "center", label: "居中提示框" },
        ],
      },
      {
        kind: "number",
        name: "delaySeconds",
        label: "进页面几秒后出现",
        min: 0,
        max: 60,
      },
      { kind: "toggle", name: "dismissible", label: "显示关闭叉叉" },
      { kind: "toggle", name: "once", label: "关闭后不再出现（记录在本机）" },
      { kind: "text", name: "badge", label: "小标签" },
      { kind: "text", name: "title", label: "标题" },
      { kind: "text", name: "text", label: "一句说明" },
      { kind: "text", name: "actionLabel", label: "按钮文字" },
      { kind: "text", name: "actionHref", label: "按钮链接（静态下载页）" },
      { kind: "text", name: "image", label: "应用图标地址（留空用内置图标）" },
    ],
  },
] as const;

const BY_KEY = new Map(BUILTIN_DEFINITIONS.map((item) => [item.key, item]));

/** 多行列表字段（welcome 的「主标题」「漂浮色块文字」）的逐行长度上限。 */
export const LINE_FIELD_MAX_CHARS: Record<string, number> = { chips: CHIP_MAX_CHARS };

/**
 * 把「多行输入框」的原始文本切成列表字段。
 *
 * ⚠️ **这里刻意保留空行**：编辑时 `filter(Boolean)` 会把用户刚按下的那个回车吃掉 ——
 * 受控 textarea 的 value 随即被 React 写回旧值、光标回到末尾，表现就是
 * 「无法换行、两段文字粘成一段」。空行只在保存前由 `sanitizeLineField()` 清掉。
 */
export function parseLineField(
  name: string,
  raw: string,
  max: number,
): string[] {
  const limit = LINE_FIELD_MAX_CHARS[name] ?? 60;
  return raw
    .split("\n")
    .map((line) => line.trim().slice(0, limit))
    .slice(0, max);
}

/** 保存前的收尾：去掉空行（含纯空白），渲染与落库都不该带占位空串。 */
export function sanitizeLineField(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean);
}

export function builtinDefinition(
  key: BuiltinModuleKey | null,
): BuiltinDefinition | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/** 该模块是否覆盖层模块（弹出模块 / 推荐应用）。**统一走 `isFloatingModule()`**，别在别处重写判断。 */
export function floatingDefinition(
  key: BuiltinModuleKey | null,
): BuiltinDefinition | undefined {
  const definition = builtinDefinition(key);
  return definition?.floating ? definition : undefined;
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
