/**
 * 后台配色预设 —— 单一事实源。
 *
 * 设计约定（见 ADMIN-REWRITE-PLAN.md §6.8 / §6.9）：
 * - 每套提供 **浅色 / 暗色两组锚点**，其余色阶（50/100/200/300/400）由 admin.css 里的
 *   `color-mix(in srgb, var(--admin-accent) N%, ...)` 公式派生，不在这里重复写。
 * - 浅色锚点是深色主色、暗色锚点必须换成亮色：暗色下 300/400 的派生要跟 `--admin-bg`
 *   混合，若锚点仍是深色，混出来的就是「深底上的深色」——石墨在暗色下作文字色只有
 *   约 1.2:1 对比度，等于不可读。这是必须在数据里区分两组值的原因。
 * - 色值只此一处；`admin.css` 只消费 `--admin-accent*` 变量，不写死任何预设色值。
 * - 注入方式：admin layout(server) 读 Setting `adminAccent` → 渲染 <style>。
 *   **不能**把 token 挂到 `.admin-workspace`——弹窗 portal 到 document.body（P-076）。
 *
 * `onAccent` 是压在主色之上的文字色。深主色配白字即可；亮主色（如天青 #0ea5e9）
 * 配白字只有 2.6:1 对比度，必须换成深色，否则主按钮文字发糊。
 */

export const ADMIN_ACCENT_KEYS = [
  "graphite",
  "sky",
  "navy",
  "emerald",
  "rose",
  "amber",
] as const;

export type AdminAccentKey = (typeof ADMIN_ACCENT_KEYS)[number];

export type AdminAccentPreset = {
  key: AdminAccentKey;
  /** 配色面板里显示的名字 */
  name: string;

  /* —— 浅色主题锚点 —— */
  /** 500 主色：按钮底色、选中态、进度条 */
  accent: string;
  /** 600：hover 加深 */
  strong: string;
  /** 700：浅底上的文字色 */
  deep: string;
  /** 压在主色上的文字色 */
  onAccent: string;

  /* —— 暗色主题锚点（必须比浅色更亮）—— */
  accentDark: string;
  strongDark: string;
  deepDark: string;
  onAccentDark: string;
};

export const GRAPHITE_ACCENT: AdminAccentPreset = {
  key: "graphite",
  name: "石墨",
  accent: "#1f2937",
  strong: "#111827",
  deep: "#0b1017",
  onAccent: "#ffffff",
  accentDark: "#9ca3af",
  strongDark: "#d1d5db",
  deepDark: "#e5e7eb",
  onAccentDark: "#0b0d11",
};

export const ADMIN_ACCENTS: readonly AdminAccentPreset[] = [
  GRAPHITE_ACCENT,
  {
    key: "sky",
    name: "天青",
    accent: "#0ea5e9",
    strong: "#0284c7",
    deep: "#0369a1",
    onAccent: "#082f49",
    accentDark: "#7dd3fc",
    strongDark: "#bae6fd",
    deepDark: "#e0f2fe",
    onAccentDark: "#082f49",
  },
  {
    key: "navy",
    name: "藏青",
    accent: "#1e40af",
    strong: "#1e3a8a",
    deep: "#172554",
    onAccent: "#ffffff",
    accentDark: "#60a5fa",
    strongDark: "#93c5fd",
    deepDark: "#bfdbfe",
    onAccentDark: "#0b0d11",
  },
  {
    key: "emerald",
    name: "松绿",
    accent: "#047857",
    strong: "#065f46",
    deep: "#064e3b",
    onAccent: "#ffffff",
    accentDark: "#34d399",
    strongDark: "#6ee7b7",
    deepDark: "#a7f3d0",
    onAccentDark: "#0b0d11",
  },
  {
    key: "rose",
    name: "绛红",
    accent: "#9f1239",
    strong: "#881337",
    deep: "#6b0f2a",
    onAccent: "#ffffff",
    accentDark: "#fb7185",
    strongDark: "#fda4af",
    deepDark: "#fecdd3",
    onAccentDark: "#0b0d11",
  },
  {
    key: "amber",
    name: "赭石",
    accent: "#b45309",
    strong: "#92400e",
    deep: "#78350f",
    onAccent: "#ffffff",
    accentDark: "#fbbf24",
    strongDark: "#fcd34d",
    deepDark: "#fde68a",
    onAccentDark: "#0b0d11",
  },
];

export const DEFAULT_ADMIN_ACCENT: AdminAccentKey = GRAPHITE_ACCENT.key;

export function isAdminAccentKey(value: unknown): value is AdminAccentKey {
  return (
    typeof value === "string" &&
    (ADMIN_ACCENT_KEYS as readonly string[]).includes(value)
  );
}

/**
 * 解析存进 Setting 的值。
 * 非法值（含预设改名后残留的旧值）一律回退默认，**不抛错**——
 * 一个脏值不该让整个后台白屏。
 */
export function resolveAdminAccent(value: unknown): AdminAccentPreset {
  const found = ADMIN_ACCENTS.find((preset) => preset.key === value);
  return found ?? GRAPHITE_ACCENT;
}

function declarations(preset: AdminAccentPreset, dark: boolean): string {
  return [
    `--admin-accent:${dark ? preset.accentDark : preset.accent}`,
    `--admin-accent-strong:${dark ? preset.strongDark : preset.strong}`,
    `--admin-accent-deep:${dark ? preset.deepDark : preset.deep}`,
    `--admin-on-accent:${dark ? preset.onAccentDark : preset.onAccent}`,
  ].join(";");
}

/**
 * 生成注入用的完整 CSS 文本：浅色锚点写在 `:root`，暗色锚点写在
 * `:root[data-theme="dark"]`（`data-theme` 由全局 ThemeInit 设置），
 * 这样用户切深浅色时锚点自动跟随，不需要额外的 JS。
 */
export function adminAccentStyle(value: unknown): string {
  const preset = resolveAdminAccent(value);
  // 用 `:root:root` 提高特异性：admin.css 里也有一份 :root 的默认锚点，
  // 两者特异性若同为 (0,1,0)，就只能靠文档顺序决胜 —— 而 <style> 会不会被
  // 提升到 head 由框架决定、不可控。提高特异性后与顺序无关。
  return [
    `:root:root{${declarations(preset, false)}}`,
    `:root:root[data-theme="dark"]{${declarations(preset, true)}}`,
  ].join("");
}
