// P-077 自查：把新组件里引用的 admin-*/moment-* 类名与 admin.css 逐个比对，缺失必须为 0。
// 跑法：node scripts/check-admin-classes.mjs
import { readFileSync } from "node:fs";

const CSS = "src/app/admin/admin.css";
const FILES = [
  "src/components/admin/MomentCompose.tsx",
  "src/components/admin/MomentImageButton.tsx",
  // 语音：麦克风按钮（发布区）与置顶录音卡片。**只登记后台专属这两个**：
  // `components/moment/MomentAudioRow.tsx` 是前台组件（`moment-audio__*` 定义在 globals.css，
  // 后台页面也能用），登记进来只会被误判成"admin.css 缺失"（见 docs/moment-audio-spec.md §2.6）。
  "src/components/admin/MomentVoiceButton.tsx",
  "src/components/admin/VoiceRecorderPanel.tsx",
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
  // 相册：列表（新建/开关/删除）、详情（基本信息 + 封面 + 照片）、卷（建改删排）、媒体库卡片上的相册下拉
  "src/components/admin/AlbumManager.tsx",
  "src/components/admin/AlbumEditor.tsx",
  "src/components/admin/AlbumVolumePanel.tsx",
  "src/components/admin/UploadAlbumSelect.tsx",
  "src/components/admin/UploadCard.tsx",
  // 后台自绘下拉（AdminSelect：相册 / 卷 / 媒体库按相册筛选这一族全走它，P-141 不登记就永远不检查）
  "src/components/admin/AdminSelect.tsx",
  "src/components/admin/UploadsAlbumFilter.tsx",
  // 媒体库类型分区（全部 / 图片 / 视频 / 音频）：音频与图片、视频分开看（P-141：不登记就永远不检查）
  "src/components/admin/UploadsKindFilter.tsx",
  // 文章折叠组：编辑器里的组外壳 + 工具栏插入
  "src/components/admin/ImageGroupJsxEditor.tsx",
  "src/components/admin/InsertImageGroup.tsx",
  // 媒体库上传预览（自绘相册下拉）+ 分卷选择（自绘卷下拉，弹窗与媒体库卡片共用）
  "src/components/admin/UploadPreviewDialog.tsx",
  "src/components/admin/UploadVolumeSelect.tsx",
  "src/components/admin/UploadsToolbar.tsx",
  "src/app/admin/(protected)/albums/page.tsx",
  "src/app/admin/(protected)/albums/[id]/page.tsx",
  "src/app/admin/(protected)/uploads/page.tsx",
  // 模块管理：样式面板 / 模板选择弹窗 / 列表与编辑页（改这几个的类名后同样要跑这一条）
  "src/components/admin/ModuleEditor.tsx",
  "src/components/admin/NewModuleButton.tsx",
  "src/app/admin/(protected)/modules/page.tsx",
  "src/app/admin/(protected)/modules/[id]/page.tsx",
  // 后台外壳：.admin-workspace--* 变体（编辑页/手机档导航的开合都在这里，改后同样要跑这一条）
  "src/components/admin/AdminWorkspace.tsx",
  // 备份页：位置列（本地 / 上传中 / 上云失败 / 本地 + COS）与补传按钮都在这块列表里
  "src/components/admin/BackupPanel.tsx",
  "src/components/admin/AdminNav.tsx",
  // 首页管理画布：`home-editor__*` / `home-grid__*` 这一族（格子手柄、落点提示、编辑辅助层）
  "src/components/admin/HomeLayoutEditor.tsx",
];

const css = readFileSync(CSS, "utf8");
const names = new Set();

for (const file of FILES) {
  // motion 的 layoutId 长得像类名（如 layoutId="admin-tab-active"），但它是动画标识、
  // 不需要在 CSS 里存在。先摘掉，否则会报成"缺失"。
  const src = readFileSync(file, "utf8")
    .replace(/layoutId=\{[^}]*\}/g, "")
    .replace(/layoutId="[^"]*"/g, "");
  for (const match of src.matchAll(/["'`]([a-zA-Z0-9_-]*(?:admin|moment|home-editor|home-grid)-[a-zA-Z0-9_-]+)["'`]/g)) {
    names.add(match[1]);
  }
  for (const match of src.matchAll(/className="([^"]+)"/g)) {
    for (const token of match[1].split(/\s+/)) {
      if (/^(admin|moment|home-editor|home-grid)-/.test(token)) {
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
