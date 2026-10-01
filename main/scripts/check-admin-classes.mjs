// P-077 自查：把新组件里引用的 admin-*/moment-* 类名与 admin.css 逐个比对，缺失必须为 0。
// 跑法：node scripts/check-admin-classes.mjs
import { readFileSync } from "node:fs";

const CSS = "src/app/admin/admin.css";
const FILES = [
  "src/components/admin/MomentCompose.tsx",
  "src/components/admin/MomentImageButton.tsx",
  "src/components/admin/MomentScopePicker.tsx",
  "src/components/admin/MomentSettingsDrawer.tsx",
  "src/components/admin/MomentVisibilityPanel.tsx",
  "src/components/admin/MomentVisibilityGroups.tsx",
  "src/components/admin/SortableImageGrid.tsx",
  "src/components/admin/MomentAdminList.tsx",
  "src/app/admin/(protected)/moments/page.tsx",
  // 概览页：卡片槽位与外观面板（改概览页类名后同样要跑这一条）
  "src/components/admin/DashboardView.tsx",
  "src/app/admin/(protected)/page.tsx",
  // 静态页面：目录设置 / 保留地址清单 / 页面列表 / 编辑器（改这几个的类名后同样要跑这一条）
  "src/components/admin/StaticPagesManager.tsx",
  "src/components/admin/StaticPageEditor.tsx",
  "src/app/admin/(protected)/pages/page.tsx",
  "src/app/admin/(protected)/pages/[id]/page.tsx",
  // 后台外壳：.admin-workspace--* 变体（编辑页/手机档导航的开合都在这里，改后同样要跑这一条）
  "src/components/admin/AdminWorkspace.tsx",
  "src/components/admin/AdminNav.tsx",
];

const css = readFileSync(CSS, "utf8");
const names = new Set();

for (const file of FILES) {
  // motion 的 layoutId 长得像类名（如 layoutId="admin-tab-active"），但它是动画标识、
  // 不需要在 CSS 里存在。先摘掉，否则会报成"缺失"。
  const src = readFileSync(file, "utf8")
    .replace(/layoutId=\{[^}]*\}/g, "")
    .replace(/layoutId="[^"]*"/g, "");
  for (const match of src.matchAll(/["'`]([a-zA-Z0-9_-]*(?:admin|moment)-[a-zA-Z0-9_-]+)["'`]/g)) {
    names.add(match[1]);
  }
  for (const match of src.matchAll(/className="([^"]+)"/g)) {
    for (const token of match[1].split(/\s+/)) {
      if (/^(admin|moment)-/.test(token)) {
        names.add(token);
      }
    }
  }
}

function definedInCss(name) {
  const escaped = name.replace(/-/g, "\\-");
  return new RegExp("\\." + escaped + "(?![a-zA-Z0-9_-])").test(css);
}

const missing = [...names].filter((name) => !definedInCss(name)).sort();
console.log("引用类名 " + names.size + " 个");
console.log(missing.length ? "缺失 " + missing.length + " 个：" + missing.join(", ") : "缺失 0 个 OK");
process.exit(missing.length ? 1 : 0);
