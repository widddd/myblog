# admin-ui-rewrite-spec.md — 后台前端 UI 重写方案

## 1. 目标

重写 `/admin` 全部界面的视觉、结构与动效，**不改任何功能**。四个硬指标：

1. **丝滑**：切页、折叠、弹窗、列表进出都有统一的过场，不出现布局抖动。
2. **竖屏手机完全可用**：≤768px 宽度下每个后台页面都能不横向滚动地完成全部操作。
3. **写文章界面优雅**：标题、设置、正文、操作四块层次清晰，手机上编辑器占满可视区。
4. **按钮不再被拉成细长条**：按钮宽度由内容决定，全宽只在明确指定时出现，且全宽时高度加大。

## 2. 「功能不变」的判定基线

改写过程中允许任意改动 DOM 结构、类名、组件拆分、文件划分。以下必须逐字保持一致，作为回归锚点：

- 每个 `fetch` / `adminJson` 调用的 URL、method、payload 键名与取值逻辑
- 每个表单提交的字段集合与校验时机
- 路由结构与 `searchParams` 键（`page` / `status` / `targetType` / `q`）
- 服务端组件的数据查询与 `metadata`
- 所有确认弹窗的文案语义与危险操作闸门（尤其 [DataClearDialog.tsx](main/src/components/admin/DataClearDialog.tsx) 的 15 秒服务端闸门，P-068）

改写每个文件前先把该文件的网络调用列成清单，改完逐条比对。

## 3. 架构决策

### 3.1 后台样式拆出独立文件

新建 `main/src/app/admin/admin.css`，在 [main/src/app/admin/layout.tsx](main/src/app/admin/layout.tsx) 顶部 import（App Router 下这样只进 `/admin/*` 的 CSS 产物）。

从 [main/src/app/globals.css](main/src/app/globals.css)（现 5637 行）迁出的区段：

- 337–345：`html:has(.admin-workspace)` 视口锁 + 隐藏站点页脚
- 363 起：`.admin-workspace .heo-card:hover` 覆盖
- 2720–2757：`.admin-nav__badge`、`.admin-comment-*`
- 2760–4694：`/* —— Auth / admin (M1) —— */` 主体，含 4676 起的 560px 媒体查询
- 4695–5099：首页画布 `.home-editor*`
- 5100–5193：模块编辑器 `.module-*`
- 5194–5338：960px / 768px 两段后台媒体查询
- 5603–5610：720px 段里的 `.auth-card`、`.admin-topbar`

**必须留在 globals.css 的**：

- `:root` 与 `[data-theme="dark"]` 里的 `--admin-*` token（globals.css 276 / 291 / 295 的前台 `.transfer-hud` 依赖 `--admin-danger`、`--admin-ease`）
- `.heo-button`、`.form-field`、`.heo-card`——前台的 [CommentForm.tsx](main/src/components/comment/CommentForm.tsx)、[PasswordGate.tsx](main/src/components/post/PasswordGate.tsx)、[search/page.tsx](main/src/app/search/page.tsx)、[not-found.tsx](main/src/app/not-found.tsx)、[TransferHud.tsx](main/src/components/common/TransferHud.tsx)、[BlockRenderer.tsx](main/src/components/home/BlockRenderer.tsx) 都在用。后台改用自己的新基元类，**不得在 admin.css 里重定义这三类**。

`admin.css` 内部按固定顺序分段，每段加注释分隔：token → reset → 基元（按钮/表单/卡片/列表/徽章）→ 布局壳 → 页面级 → 编辑器外壳 → 首页画布 → 模块编辑器 → 响应式覆盖。

### 3.2 类名体系

保留 `admin-` 前缀与 `--admin-*` token（P-044 与多篇 docs 已引用，改前缀无收益）。语义变化的才改名，例如表格类由 `.admin-table` 换成双形态的 `.admin-list`。新增基元一律 `admin-` 开头，BEM 风格（`block__element--modifier`）。当前后台面共 197 个类名，改写后在 admin.css 顶部注释里维护一份分层清单。

### 3.3 动画：引入 motion

新增依赖 `motion`（framer-motion 后继，MIT）。约束：

- **只允许从 `src/components/admin/**` 下的 client 组件 import**。任何 `src/components/home/**`、`src/components/layout/**`、`src/app/layout.tsx` 引用即视为违规（资源红线 7）。
- 用 `LazyMotion` + `domAnimation` 特性包 + `m.*` 组件形态，provider 放在 `AdminWorkspace` 根部，避免把完整 feature bundle 打进去。
- 外层套 `MotionConfig`，`reducedMotion="user"`，与 globals.css 5629 的 `prefers-reduced-motion` 规则保持一致。
- 时长受 P-044 约束：过场 ≤280ms，微交互 ≤160ms。**不要用会超调的弹簧**——后台连点频繁，超调读起来是卡顿不是高级。
- 不得包裹 `EditorLoader` 及 vendor 编辑器子树（P-005 / P-021）。
- 不得接管 [HomeLayoutEditor.tsx](main/src/components/admin/HomeLayoutEditor.tsx) 的画布拖动，`setPointerCapture` 挂在画布上的现状保持（P-043）。

图标：改用已在 [package.json](main/package.json) 里的 `@radix-ui/react-icons` 替换当前散落在页面里的 emoji（[moments/page.tsx](main/src/app/admin/(protected)/moments/page.tsx)、[admin/page.tsx](main/src/app/admin/(protected)/page.tsx) 等），不引新图标库。

### 3.4 手机端布局模型切换

桌面沿用「锁视口 + 分栏各自滚动」（P-033）。手机端（≤768px）整体换模型：

- 解除 `html:has(.admin-workspace)` 的 `overflow: hidden`，回到文档流滚动
- 隐藏前台 `SiteHeader` 与 `Footer`，由后台自己的固定顶栏（页面标题 + 返回前台入口）承担，回收那 60px
- 底部固定 tab bar 取代左侧 rail
- 所有固定元素加 `env(safe-area-inset-bottom)` / `-top` 内边距

## 4. 分阶段实施

### 阶段 1：CSS 平移（零视觉变化）

按 3.1 的行号区段把规则搬进 `admin.css`，只做搬运不改任何值。搬完在 Windows 上跑 `pnpm dev`，逐页对比截图确认与搬运前一致。这一步单独提交，后续所有改动都在 admin.css 内进行，便于回滚。

### 阶段 2：token 与基元层

在 admin.css 顶部补齐后台专属 token（不与 globals.css 的 `--admin-*` 重名）：间距阶梯、圆角阶梯、层级阴影、控件高度（桌面 40px / 触屏 44px）、断点变量、z-index 阶梯。

**按钮 `.admin-btn`**（替换后台里所有 `.heo-button` 用法）：

- 基础：`inline-flex`，宽度由内容决定，`min-width` 约 88px，横向 padding 18px，圆角走 token
- 关键修复：显式写 `justify-self: start` 与 `align-self: center`。当前「又细又长」的根因是 `.admin-filter` / `.admin-form` 等 grid 容器在窄屏塌成单列后，grid item 默认 `stretch` 把按钮拉满宽
- 变体：`--primary` / `--ghost` / `--danger` / `--icon`（40×40 正方）/ `--link`
- `--block`（全宽）只用于手机端主行动，且高度提到 48px、圆角加大，避免 44px 高的全宽细条观感
- 触屏点击区靠伪元素向外扩到 44×44，不靠拉高视觉高度
- 按钮组 `.admin-btn-row`：`flex` + `wrap`，成员 `flex: 0 1 auto`；**手机端不改成单列 stretch**，允许换行；只有被标 `--block` 的主行动独占一行
- 状态：`disabled` 降透明度不改尺寸；提交中在按钮内换 spinner 且用 `min-width` 锁住宽度，防止文案从「保存」变「保存中…」引起抖动

**表单 `.admin-field`**（替换后台里的 `.form-field`）：统一标签/输入/提示三段结构，输入高度走控件 token，focus 环用 `--heo-theme-op`；`.admin-field-row` 在 ≥768px 双列、以下单列。

**卡片 `.admin-card`**：替换后台对 `.heo-card` 的直接引用，桌面有边框阴影，手机端去掉横向 margin 与部分圆角，做成通栏。

**列表 `.admin-list`**：同一套 DOM 两种形态。桌面用 CSS Grid 模拟表格（表头行 + 数据行），手机端切成卡片：每行变一张卡，字段用 `::before` 取 `data-label` 出标签，操作区落到卡片底部成一行按钮。**不要用 `overflow-x: auto` 让表格横滑糊弄过去**。

### 阶段 3：布局壳与导航

改写 [AdminWorkspace.tsx](main/src/components/admin/AdminWorkspace.tsx)：

- 删掉 84–115 行那套 `phase` + `setTimeout(200)` + `onAnimationEnd` 的手写切页状态机，换成 `AnimatePresence`（`mode="wait"`），key 用 pathname。这是当前切页发涩的主因。
- 顶栏标题交叉渐变改用 motion 的 layout 过渡，保持「顶栏固定、只有文字渐变」的既有观感（docs/architecture.md 第 100 行描述）。
- 侧栏收起动画从 `width` / `flex-basis` 过渡换成对宽度 token 的过渡 + 内容淡出，减少重排。
- 新增视口判定：≤768px 时不渲染左侧 rail，改渲染顶栏 + 底部 tab bar。判定用 CSS 为主（两套结构都在 DOM 里，由媒体查询切显示），避免服务端/客户端不一致的 hydration 问题。

改写 [AdminNav.tsx](main/src/components/admin/AdminNav.tsx)：

- 现有 10 个入口在手机底栏放不下。底栏固定 5 项：仪表盘、文章、瞬间、评论（带待审徽章）、更多。
- 「更多」打开从底部升起的全屏 sheet，列出首页管理、模块管理、媒体库、备份、更新、设置，以及退出登录与版本角标。
- 「写文章」不进底栏，改成文章列表页的浮动主行动按钮。
- 激活态用 motion 的 `layoutId` 做滑块，不用逐项 transition。

响应式覆盖里同步处理：globals.css 5217–5327 那段 960px 补丁作废，重写为 768px 断点下的完整移动布局；桌面与移动之间的 769–1024px 区间保留左栏但用收起态默认值。

### 阶段 4：列表页卡片化

以下页面把 `<table className="admin-table">` 换成阶段 2 的 `.admin-list` 结构，字段加 `data-label`：

- [posts/page.tsx](main/src/app/admin/(protected)/posts/page.tsx)：标题/状态/更新时间/操作。置顶、推荐、加密三个状态从 emoji 前缀改成状态徽章。
- [comments/page.tsx](main/src/app/admin/(protected)/comments/page.tsx)：内容列在手机上是主体，其余字段作为卡片元信息行；`CommentRowActions` 的操作在卡片底部成行。
- [modules/page.tsx](main/src/app/admin/(protected)/modules/page.tsx)：同上。

同时处理：

- 筛选表单 `.admin-filter` 重写为工具条：桌面横排，手机端输入框整行、下拉两列、筛选按钮跟在下拉后面（不全宽）。
- [moments/page.tsx](main/src/app/admin/(protected)/moments/page.tsx)、[uploads/page.tsx](main/src/app/admin/(protected)/uploads/page.tsx) 已是列表/网格，只需把网格列数改成容器查询驱动，并把 emoji 换成图标。
- 分页 `.admin-pager` 与 [Pagination](main/src/components/common/Pagination.tsx) 在手机端改成上一页/页码/下一页三段等距，点击区 ≥44px。
- 列表项进出用 motion 的 `AnimatePresence` + 轻微位移淡入，删除时高度收拢，不要整表重排闪一下。

### 阶段 5：写文章界面

改写 [PostEditorForm.tsx](main/src/components/admin/PostEditorForm.tsx)（704 行）与对应 `.post-workspace*` 样式（globals.css 4006–4130）。功能边界：状态/时间/置顶/推荐/分类/标签/新建分类标签/封面/Banner/slug/摘要/密码/清除密码/Markdown 导入/可视化-预览切换/保存/保存并发布，全部保留。

桌面：

- 顶部标题栏三段化：左侧无边框大字标题输入、中间「可视化 / 预览」改成带滑块的 segmented control（当前是三个并排 ghost 按钮，见 652–671 行）、右侧只留「保存」与「保存并发布」两个按钮。
- 651 行的 `.admin-form-actions` 不再承载四个按钮，避免窄屏塌成一列全宽细条。
- 692 行那段长提示文案收进标题栏的信息图标浮层，默认不占位。
- 左栏 `SettingsFold` 折叠动画从 `grid-template-rows: 0fr → 1fr`（globals.css 3983–3991）换成 motion 的高度动画，箭头旋转保留。左栏 Grid 必须继续写 `align-content: start`（P-063）。
- 左栏宽度从 320px 提到 340px，与首页画布左栏统一；卡片间距、内边距统一走 token。

手机（≤768px）：

- 左栏设置整体移入从底部升起的 sheet，由标题栏的「设置」按钮唤起，sheet 内仍是四个折叠分组。关闭走右上角箭头 / 背板 / Escape，不要复用桌面 `settingsOpen` 收起状态。当前 5313–5318 行那套「左栏变成 max-height: 42vh 的横条」的做法废弃。
- 编辑器区占满剩余视口高度，页面本身不滚动，滚动交给编辑器内部（保持 P-027 的纵向 flex，不要让工具栏与正文并排）。窄屏工具栏用换行断点分成格式行 / 插入行，按钮必须全部可见，不要单行裁切。
- 底部固定操作条：预览切换 + 保存 + 保存并发布。操作条与底部 tab bar 互斥（写文章页不显示 tab bar）。
- 键盘弹出时用 `dvh` 而非 `vh` 计算高度。

`.admin-mdx-*` 下的字号、深色、工具栏规则（globals.css 3318–3430）原样搬运，**不要顺手重构**（P-021 / P-022 / P-029 / P-030 / P-031）。

### 阶段 6：面板与弹窗

- [SettingsForm.tsx](main/src/components/admin/SettingsForm.tsx)、[BackupPanel.tsx](main/src/components/admin/BackupPanel.tsx)、[UpdatePanel.tsx](main/src/components/admin/UpdatePanel.tsx)：改用 `.admin-card` + `.admin-field` + `.admin-btn`，分节标题层级统一；长表单在手机端每节可折叠。
- 弹窗统一为一个基元：桌面居中卡片，手机全屏 bottom sheet（顶部拖拽条、可下滑关闭）。涉及 [MediaLibraryPicker.tsx](main/src/components/admin/MediaLibraryPicker.tsx)、[MediaInsertMenu.tsx](main/src/components/admin/MediaInsertMenu.tsx)、[UploadCard.tsx](main/src/components/admin/UploadCard.tsx) 的删除菜单。弹窗继续 portal 到 body（P-032）。[DataClearDialog.tsx](main/src/components/admin/DataClearDialog.tsx) **不要**套进这套 sheet：保持独立圆角卡片，红色进度条贴卡片底边（P-074）。
- `DataClearDialog` 的倒计时进度条保持由服务端闸门驱动，只换外观，**不要把倒计时逻辑挪进动画层**（P-068）。
- [DeleteButton.tsx](main/src/components/admin/DeleteButton.tsx)、[CommentRowActions.tsx](main/src/components/admin/CommentRowActions.tsx)：`confirm()` 换成统一弹窗基元，文案不变。
- [LoginForm.tsx](main/src/components/admin/LoginForm.tsx)、[SetupForm.tsx](main/src/components/admin/SetupForm.tsx)、[AccountForm.tsx](main/src/components/admin/AccountForm.tsx) 与 `.auth-*` 样式：登录/创建站点页重做为居中卡片，手机端通栏，输入框 16px 字号（防 iOS 自动缩放）。

### 阶段 7：画布与模块编辑器的手机适配

- [HomeLayoutEditor.tsx](main/src/components/admin/HomeLayoutEditor.tsx)：手机端左栏改成顶部横向标签页 + 下方画布，画布保留横向滚动（这是设计工具，允许横滑）。拖动逻辑与 pointer capture 不动（P-043）。
- [ModuleEditor.tsx](main/src/components/admin/ModuleEditor.tsx)：HTML/CSS/JS 三栏在手机端改成标签页切换，代码框高度用 `dvh`。

## 5. 动效清单（统一预算）

- 切页：出 160ms 淡出 + 位移 8px，入 220ms，`--admin-ease`
- 顶栏标题：交叉渐变 160ms
- 侧栏收起 / 折叠展开：280ms
- 弹窗：背板 160ms 淡入，面板 220ms（手机 sheet 从下 220ms）
- 列表项进出：160ms
- 按钮 / 链接 hover 与按压：≤120ms
- tab bar 激活滑块：`layoutId`，220ms
- 触屏设备（`hover: none`）去掉全部 hover 态，改按压反馈

## 6. 验收清单

- iPhone 竖屏尺寸（390×844）下逐页走查：仪表盘、文章列表、写文章、瞬间、首页管理、模块管理、评论、媒体库、备份、更新、设置、登录、创建站点。每页不得出现横向滚动条，不得有元素被底栏遮挡。
- 所有按钮：不存在「高度 ≤44px 且宽度 100%」的组合。
- 桌面 1440 宽下与改写前的功能路径逐条对拍。
- `prefers-reduced-motion: reduce` 下所有过场退化为瞬时。
- `pnpm lint` 与 `pnpm build` 通过；`pnpm test` 不受影响（后台 UI 无单测）。
- 检查构建产物：前台首屏 chunk 不含 motion。

## 7. 文档同步（交付前必做，对照 docs/agents-maintenance.md）

- [docs/ai/module.md](docs/ai/module.md)：新增 `src/app/admin/admin.css` 行；更新 156–161 行的后台组件描述；新增/拆分的组件补行
- [docs/architecture.md](docs/architecture.md)：第 68 行设计体系段落补「后台样式独立文件」；第 100 行后台壳段落按新结构重写，补手机端布局模型
- [AGENTS.md](AGENTS.md)：§3 导航加 `docs/admin-ui-rewrite-spec.md` 与 `admin.css`；§1 技术栈行加 motion；§4 补新 pitfalls 摘要；§6 状态摘要
- [docs/README.md](docs/README.md)：职责表加本文件
- [docs/pitfalls.md](docs/pitfalls.md)：从 P-070 起追加（现最后一条为 P-069）——后台样式只进 admin.css 且不得重定义前台共享类、motion 只许在后台 client 组件、后台表格必须双形态不许横滑
- [README.md](README.md)：后台使用说明若含界面描述则同步
- [PLAN.md](PLAN.md)：新增里程碑条目

## 8. 容易做错的地方

1. **「按钮又细又长」不是缺响应式，恰恰是响应式写多了。** 根因是 `.admin-filter`、`.admin-form` 等 grid 容器在窄屏塌成单列后 grid item 默认 `stretch`。正确的修法是给按钮基元加 `justify-self: start` / `width: auto`，不是再加一层媒体查询去写宽度。加媒体查询只会让问题在下一个容器里复发。

2. **`.heo-button` / `.form-field` / `.heo-card` 是前台共享类。** 前台评论表单、文章密码门、搜索页、404、传输 HUD、首页积木渲染器都在用。在 admin.css 里重定义或「顺手优化」它们，会静默改坏这些前台界面，而且这些页面不在后台验收清单里，很难发现。后台必须用新的 `.admin-btn` / `.admin-field` / `.admin-card`。

3. **`--admin-*` token 必须留在 globals.css。** 名字带 admin，但前台 `.transfer-hud` 依赖 `--admin-danger` 和 `--admin-ease`。整块搬进 admin.css 会让首页大图加载进度条掉色掉动画（P-060 那条链路）。

4. **手机端真正的障碍是双重视口锁。** `html:has(.admin-workspace) { overflow: hidden }` 加上前台 60px 导航栏，再加编辑页的 `height: 100%`，三者叠起来让手机上永远只剩一小条可用区。必须整体切到「文档流滚动 + 后台自有固定顶/底栏 + 隐藏前台导航页脚」，而不是在锁死的视口里继续调 padding。

5. **表格不能用横滑糊弄。** 竖屏下横向滚动的表格等于不可用。要的是同一套 DOM 在桌面呈表格、手机呈卡片，靠 CSS 切换——渲染两套结构会让服务端组件的数据映射写两遍，后续必然不同步。

6. **「丝滑」的上限是 280ms（P-044），别靠弹簧超调找高级感。** 后台是高频连点场景，超调和回弹读起来是延迟。真正的丝滑来自三件事：统一 easing、消除布局抖动（按钮锁宽、图片占位、折叠用高度动画而非显隐）、以及把现在那套 `setTimeout(200)` 手写切页状态机换掉。

7. **写文章页的「优雅」只能改壳。** vendor 编辑器子树是冻结区，`.admin-mdx-*` 里已有的标题字号、深色 `--base*` 覆盖、工具栏纵向 flex 都是踩过坑定下来的（P-021 / P-022 / P-027 / P-029 / P-030 / P-031）。可以改标题栏、左栏、底部操作条、容器高度，不要动这些规则的值。

8. **motion 一旦泄漏到前台就违反资源红线。** 它只在浏览器跑，不吃服务端内存，但会进首屏 JS。约束是 import 路径而非运行时——审查时直接搜 `from "motion` 的文件路径白名单，只允许 `src/components/admin/`。同时必须用 `LazyMotion` + `domAnimation`，否则完整 feature bundle 会把后台首屏也拖慢。

## 9. 二次换肤（参考稿设计体系）

视觉层对齐 `reference/main.css` 的白底 + 天蓝（sky-500 `#0ea5e9`）+ 苹果缓动，**功能与响应式结构不变**。

- Token 全部写在 `admin.css` 的 `:root` / `:root[data-theme="dark"]`，不再跟 `--heo-theme`（暗色不再变黄）。暗色只派生表面与墨色，浅底色（sky-50/100）用 `color-mix` 半透明，不要直接铺浅蓝。
- 同名覆盖 `--admin-danger` / `--admin-ease` / `--admin-body|heading|title` 只影响加载了 admin.css 的 `/admin/*`；`globals.css` 里的同名 token 留给前台 TransferHud（P-070 / P-076）。
- 按钮桌面视觉高度 36px、`min-width` 72、字重 600；44px 点击区继续靠 `::after`；`justify-self: start` 必须保留。
- 切页 / 导航滑块缓动改为 `cubic-bezier(0.16, 1, 0.3, 1)`。超调弹簧只给弹窗 pop 与 iOS 开关。列表逐项入场用纯 CSS `.admin-stagger`（460ms，唯一允许超 280ms 的地方），不要把 server page 改成 client。
- `.admin-mdx-*` 尺寸与 `--base*` 覆盖结构、数据清理弹窗闸门与贴底进度条只换颜色映射，不改几何。

## 10. 第三轮：冷灰表面 + 可切换配色（2026-02）

> 本轮**换的是体系**，不只是换色。完整实施计划见根目录 [ADMIN-REWRITE-PLAN.md](../ADMIN-REWRITE-PLAN.md)，本节只记录与 §9 的差异与结论。

### 10.1 表面与墨色

- 页面底 `#ffffff → #f6f7f9`（浅灰），卡片保持纯白 —— 浅色下靠**底色差**分层，不再全靠边框；暗色 `#0b0d11` / surface `#14171c`。
- 墨色由 Apple 灰阶换成中性冷灰（`#0f1729 / #667085 / #98a2b3 / #b8bfcc`，暗色各一档）。
- 圆角 `10/14/20/28 → 9/12/16/20`。
- `--admin-ease`（`cubic-bezier(0.16,1,0.3,1)`）与 `--admin-fast/mid/slow`（160/220/280ms）**不动**——它们定义在 `globals.css`，是前后台共享层（前台 TransferHud 也依赖）。§5 的动效预算继续有效。

### 10.2 主色从「固定」变「可切换」

§9 的「白底 + 天蓝 `#0ea5e9`」被替换为 **6 套预设可切换**（默认石墨 `#1f2937`，另含天青/藏青/松绿/绛红/赭石）。

- **色阶改造**：原 `--admin-sky-50…700` 8 级硬编码 → `--admin-accent*` **4 个锚点 + 8 级派生**（50/100/200/300/400 由 `color-mix(in srgb, var(--admin-accent) N%, var(--admin-bg))` 生成）。文件内 72 处消费点只改名、不改结构。先例是原暗色段的 50/100/200 本来就是这么派生的。
- **色值事实源**：从 CSS 移到 `main/src/lib/admin/accents.ts`（6 套 × 浅/暗各 4 锚点）。`admin.css` 只消费变量，**不写死任何预设色值**。
- **注入**：`admin/layout.tsx`（server）读 Setting `adminAccent` → `adminAccentStyle()` 输出 `:root:root{浅色锚点}` + `:root:root[data-theme="dark"]{暗色锚点}`。用 `:root:root` 提特异性，避免与 admin.css 的 `:root` 靠文档顺序决胜；零闪烁、零 JS、不用 localStorage。token 仍挂 `:root`（P-076：弹窗 portal 到 body）。
- **锚点必须两套**：暗色下 300/400 与 `--admin-bg` 混合，锚点若是深色主色就会得到「深底上的深色」（石墨实测 1.2:1）。详见 P-076。
- **亮主色连带项**：主色变浅后（天青 `#0ea5e9`）白字压上去只有 2.6:1，`--admin-on-accent` 改深蓝 `#082f49`；`--admin-shadow-accent` 的硬编码 sky rgb 也改成 `color-mix` 跟随主色。

### 10.3 概览页重构与新功能

- 原 5 张 `count` 卡 → **7 张可显隐卡片**：4 张 KPI（文章/评论/累计阅读/媒体文件）+ 阅读量 Top 5 + 系统状态 + 最近文章。指标全部接真实查询（`_sum(views)` / `orderBy views desc` / `upload` 聚合），**零埋点、零扫盘**。
- **卡片显隐**：双入口（顶栏「外观」面板批量 + 单卡角标单张），隐藏 = 不渲染，网格 `auto-fit` 自动重排；持久化到 Setting `dashboardCards`。**入口演进（三次）**：概览页右边缘常驻竖条把手 → 布局壳顶栏按钮 → **最终落在前台导航 `Navbar`**（图标，仅管理员可见；点击带 `?appearance=1` 进后台并自动展开弹窗）。前两版被否的原因：边缘把手在浅灰背景上太不显眼（第一个真实使用者没找到）；后台顶栏按钮在后台页面里多余，而入口既然是"看站点外观"，放站点顶栏更自然。**后台标题行 `.admin-topbar` 不放任何额外按钮**（只有返回、标题、用户名）。**面板样式仍在 `admin.css`，前台不引入它**（P-070 隔离）。

**面板形态**：**右上角小弹窗**（`top: 76px; right: 16px; width: min(340px, calc(100vw - 32px)); max-height: calc(100vh - 92px)`，圆角 16px + 背板），从外侧（右）划入。原先做过贴右侧的整高抽屉，用户要求改成右上角小弹窗。

**开关状态从 URL 派生，不用 state**（`searchParams.get("appearance") === "1"`；关闭时用 `router.replace` 抹掉 query）。用 `useState` 惰性初始化会在"同路由只换 query"时失效——表现为入口点了没反应，详见 `docs/pitfalls.md` P-079。
- **配色切换并入同一面板**：面板上半段标注「影响整个后台」，下半段标注「只影响概览页」。
- 状态归属：显隐 state **只在 `DashboardView`**，面板经 props 收发。

### 10.4 质感对齐（2026-02，逐项量参照稿后改）

用户反馈「没有 demo 那种高级感，你没改完全」后做的一轮**质感层**对齐。方法：用系统自带 Edge 无头模式把**真实 `admin.css`** 加载进复刻 DOM，逐元素取 `getComputedStyle` / `getBoundingClientRect`，与参照稿同视口比对——**数值对齐，不靠观感判断**。

| 层 | 改了什么 | 参照稿依据 |
|---|---|---|
| 侧栏 | 节奏改扁平结构（分组标题与导航项同为直接子元素 + 统一 `gap: 2px`，标题自带 `padding: 14px 10px 6px`）；导航项 `h36 / gap10 / 13.5px / ink-2`；分组标题 `11px/600/.07em/uppercase`；图标 17px；版本号做 pill。实测 y 坐标与参照稿完全一致 | `.nav*` / `.sidebar__foot` |
| KPI 卡 | 图标加**语义彩色软底**（ok/warn/info/muted + 主色默认档）；数值 `27px/640/-.03em`（原 32px/400）；胶囊 28×28、glyph 15px；label 12.5px | `.kpi*` |
| 徽章 | 从「只有一个灰档」改为**五档语义色**（ok/warn/danger/info/muted）+ `.admin-dot`；**修掉「警告用了危险色」的 bug**；接上文章状态 / 备份 / 对象存储 / 评论待审等 10 处调用点 | `.badge--*` |
| 阴影 | `--admin-shadow-1/2/3` 换成参照稿三式（**含 -20/-28px 负扩散**；原来无负扩散 = 卡片下铺一层灰雾）；卡片 hover 位移 -3px → -1px | `--shadow-sm/--shadow/--shadow-lg` |
| 字级 | `--admin-title 21→16`、`--admin-heading 17→14`、`--admin-body 15→14`（**已同步更新 AGENTS P-044**）；弹窗标题单独钉 16、登录页钉 21 | `.topbar__title h1` / `.card__head h3` |
| 间距 | `.admin-card` padding `22/24→18/20`、`.admin-dash` gap `20→14`、`.admin-topbar` `16/24→13/22`、内容区 `20/24/48→20/22/44` | `.card--pad` / `.view.stack` / `.topbar` |
| 列表 | 表头 `11.5px/600/.05em/uppercase` + 浅灰底；单元格 `13px 16px`；主文字 650→520；行 hover 去主色改中性；分页 44→32；新增 `.admin-btn--sm` | `.tbl*` / `.pager__btn` / `.btn--sm` |
| 按钮 | ghost 从「主色文字」改回中性 `ink` + hover 中性底；主按钮 hover 去掉主色光晕 | `.btn--ghost` / `.btn--primary:hover` |
| 其他 | 全局 `.admin-workspace :where(:focus-visible)`（原只有 3 个选择器有焦点环）；空态 64px + 52px 图标盒；输入框三处统一 38/9/focus 3px；23 处硬编码圆角归并到 token；外观面板 `340/16/16 → 240/12/12` | `.empty` / `.input` / 各档圆角 |
| 入场动画 | 新增 `--admin-enter: 380ms` 与 `--admin-ease-enter: cubic-bezier(.22,.61,.36,1)`；`@keyframes admin-view-rise`（`translateY(18px) scale(.985) → none`）挂在 `.admin-dash > *`，按 `0 / 60ms / 120ms` stagger —— 切到概览页时三块内容**自上而下依次升起**。实测 `animationstart` 事件：34ms / 85ms / 151ms，与配置的 0/60/120ms 吻合 | `@keyframes viewRise` + `.view.is-enter > *`（§8） |

**刻意不跟参照稿的地方**（列出来是为了防止后来者把它们当"没改完"去补）：双形态列表（P-072）、顶栏实心无磨砂（P-033 锁视口，顶栏不是 overlay）、顶栏不放搜索/铃铛/头像、卡片显隐角标、外观面板两段作用域标注、`.admin-seg` 分段控件、`.admin-fab`、手机底栏结构、已逐字对齐的颜色 token。

### 10.5 本轮不做

- **访问统计 / 埋点**：项目无埋点表，demo 里那两个指标（今日访问、14 天趋势）已删除。重建属于 Spec 级新系统（SQLite 单写者下要评估写入放大）。
- 存储占用**不自动扫盘**（沿用既有决策，媒体体积走数据库聚合）。
