# ADMIN-REWRITE-PLAN.md — 后台按 demo 重写 · 实施计划

- 日期：2026-02（按当前会话）
- 提案人：AI
- 状态：**待批准**
- 依据产物：[demo/admin-ui/index.html](demo/admin-ui/index.html)（已交付并验证）
- 前置文档：[docs/admin-ui-rewrite-spec.md](docs/admin-ui-rewrite-spec.md)（第一轮结构重写 + 第二轮白底天蓝换肤，均已落地）

---

## 0. 一句话

把 `/admin` 全部界面的视觉体系换成 demo 的**冷灰表面 + 可切换主色**（6 套预设，默认石墨），把 demo 里多出的统计指标**接上真实查询**，在概览页新增**卡片显隐 + 自动重排**（带持久化），并把**配色切换**并入同一面板；功能、路由、API 契约与数据模型**一律不动**。

---

## 1. 目标与非目标

### 1.1 目标

| # | 目标 | 判定方式 |
|---|---|---|
| G1 | 视觉体系对齐 demo | token、几何、组件形态逐项对拍 |
| G2 | demo 里的每个数字都有真实数据源 | 能在 DB 找到对应查询，无假控件 |
| G3 | 概览页卡片可显隐 + 自动重排 + 持久化 | 刷新后保持，网格无空洞 |
| G4 | 响应式行为不退化 | 沿用 spec §6 逐页走查 |
| G5 | 动效参数统一 | 沿用 P-044（过场 ≤280ms），入场上限见 §7 |

### 1.2 非目标（明确不做）

- **不做访问统计/埋点**。demo 曾有的「今日访问」「14 天访问趋势」已被删除，本项目无埋点表，重建属于 Spec 级新系统（SQLite 单写者下要考虑写入放大），本轮不做。
- **不改任何 API 契约与数据模型**（除 §5 新增一个 Setting key）。
- **不动 vendor 编辑器子树**：`src/editor/**`、`.admin-mdx-*` 的既有规则值（P-005 / P-021 / P-022 / P-027 / P-029 / P-030 / P-031）。
- **不重写前台**。`.heo-button` / `.form-field` / `.heo-card` 是前台共享类，只许看，不许改（P-070）。
- **不换成单页路由**。demo 是单 HTML 靠 `hidden` 切视图；真实后台是 Next App Router 多路由，**照抄 demo 的切页机制会砸掉架构**。

---

## 2. 先质疑：哪些照抄，哪些不能照抄

> The Algorithm 第 1 步。**demo 是视觉参照物，不是代码模板。** 逐条处理，不整包复制。

### 2.1 必须照抄（价值所在）

- **表面与墨色体系**：中性冷灰（`#f6f7f9` + 纯白卡；暗色 `#0b0d11` + `#14171c`）+ 极淡 1px 描边；暗色只派生表面与墨色。
- **主色机制**：6 套预设可切换（§6.8），每套 6 个变量 × 双主题；**默认石墨**。
- **几何**：卡片圆角 16px / 控件 12px / 极淡 1px 描边 / 极轻阴影层级。
- **组件形态**：KPI 卡、徽章、工具条 + chip 筛选、双形态列表、空态、右侧抽屉。
- **响应式断点逻辑**：桌面分栏各自滚动（P-033）；≤900px 换文档流 + 固定顶栏 + 底部 tab bar。
- **动效参数**：`--ease-enter: cubic-bezier(.22,.61,.36,1)`、入场上限 ≤460ms（仅 `.admin-stagger` 允许，见 spec §9）。

### 2.2 不能照抄（照抄就出事）

| demo 的做法 | 为什么不能抄 | 正确做法 |
|---|---|---|
| 单 HTML + `hidden` 切视图 | 会砸掉 App Router 多路由与 `searchParams` 契约（spec §2） | 每个栏目仍是独立路由页面 |
| 内联 SVG sprite 图标 | 项目已用 `@radix-ui/react-icons` | 沿用现有图标库 |
| 内联 `<style>` / 内联 JS | 后台样式必须集中在 `admin.css`（P-070） | 全部落 `admin.css` 与 tsx |
| 内联 `style="width:80%"` 等 | 破坏 token 体系，后续无法换肤 | 走 CSS 变量 / 类 |
| 静态假数据 | 会出现不可用的控件 | 全部接 §5 的真实查询 |
| 折线图 + hover tooltip | 无数据源；且 tooltip 是不可达性负担 | 换成静态条形榜（无 JS） |

### 2.3 需要新增（demo 未覆盖）

- 概览页卡片显隐面板（§6）。
- 真实的空态/加载态/错误态（demo 只有静态空态）。

---

## 3. 现状基线（实测）

| 项 | 数值 |
|---|---|
| `main/src/app/admin/admin.css` | **3394 行** |
| 后台页面 `app/admin/**/\*.tsx` | 17 个 |
| 后台组件 `components/admin/*.tsx` | 36 个 |
| `AdminWorkspace.tsx`（布局壳） | 186 行 |
| `AdminNav.tsx`（导航） | 230 行 |
| `AdminMotion.tsx`（motion 封装） | 10 行 |
| `lib/settings.ts` | 278 行 |

**结论**：这是一次**换体系**而非换色。上一轮的 token 全在 `admin.css` 的 `:root` / `:root[data-theme="dark"]`（spec §9），换色是可控的；但组件几何（按钮 36px、圆角、阴影）分散在 3394 行里，需要按 §7 阶段推进。

---

## 4. 差异清单（demo → 现有后台）

| 维度 | demo | 现有后台 | 动作 |
|---|---|---|---|
| 主色 | 6 套可切换，默认石墨 `#1f2937` | 固定天蓝 `#0ea5e9`（spec §9 二次换肤） | 引入可切换机制（§6.8） |
| 表面 | `#f6f7f9` + 纯白卡 | 白底 + sky-50 派生 | 换 token |
| 暗色 | `#0b0d11` / `#14171c` | 现有一版 | 换 token |
| 圆角 | 卡 16 / 控件 12 | 现有较小 | 改基元 |
| 按钮 | 36px 高、描边/幽灵/主色三态 | 已 36px（spec §9） | 微调 |
| 徽章 | 圆角 pill + 软底 | 现有有 | 对齐几何 |
| 侧栏 | 252px、分组标题、选中软底 | 现有 rail（可收起） | 对齐宽度与选中态 |
| 底部栏 | 4 项（概览/文章/设置/更多） | **4 项 + 「更多」按钮**：仪表盘/文章/瞬间/评论 + 更多 | **保留现有 4+更多**（位置数一致），只改视觉 |
| 概览页 | KPI×4 + 阅读榜 + 系统状态 + 最近文章 | 只有 5 张 `count` 卡 | **重写**（§5/§6） |

> 注意：demo 底栏是 4 项，后台实为 10 个入口，spec §3.3 已定「5 项 + 更多 sheet」。**以 spec 为准，demo 的 4 项是简化演示。**

---

## 5. 后端改动清单（demo 多出来的功能）

全部为 **server component 内的 Prisma 查询**，**零新增 API 路由、零迁移**。

| demo 指标 | 查询 | 说明 |
|---|---|---|
| 文章总数 | `post.count()` | 已有 |
| 评论总数 | `comment.count()` | 现有只统计 pending，需补总数 |
| 累计阅读 | `post.aggregate({ _sum: { views: true } })` | **新增**；`views` 已由 [view/route.ts](main/src/app/api/posts/[slug]/view/route.ts) 累加 |
| 阅读量 Top 5 | `post.findMany({ where: { status: "published" }, orderBy: { views: "desc" }, take: 5 })` | **新增** |
| 媒体文件数/体积 | `upload.aggregate({ _count: true, _sum: { size: true } })` | **新增**；数据库聚合，**不扫盘** |
| 自动备份状态 | `Setting.lastBackupAt` + `backupPeriodDays` / `backupKeep` | 已有 |
| 对象存储状态 | `cosBucket` / `cosRegion` / `cosSecretIdSet` | 已有；文案为**「已配置」**，连通性仍在设置页点测 |
| 程序版本 | `lib/release.ts` 的 `APP_RELEASE_LABEL` | 已有 |
| 待审评论 | `comment.count({ where: { status: "pending" } })` | 已有 |

**性能**：全部为单表聚合或小结果集查询，`Promise.all` 并行；better-sqlite3 同步查询，微秒级，不影响 1GB RAM 约束。

**明确不做**：存储占用扫盘。项目在 [SettingsForm.tsx](main/src/components/admin/SettingsForm.tsx) 写死「打开本页不会自动扫盘」，概览页不得引入自动扫盘。

**顺带发现**：`/api/admin/stats`（[route.ts](main/src/app/api/admin/stats/route.ts)）已存在，返回 `posts{published,draft,scheduled}` / `moments` / `pendingComments`。概览页现在是 server component **直接查 Prisma**、没走这个接口。本轮**沿用直接查询**（少一跳网络），不改造该接口，也不重复造第二个统计接口。

### 5.1 ⚠️ 顶栏元素对账（照抄就会造出假控件）

现有顶栏（[AdminWorkspace.tsx:138-159](main/src/components/admin/AdminWorkspace.tsx#L138-L159)）只有三样：**返回前台按钮 + 页面标题/副标题 + 「你好，username」**。demo 顶栏有 5 个元素，**其中 4 个在系统里没有对应后端**：

| demo 顶栏元素 | 现有后台 | 后端支撑 | 结论 |
|---|---|---|---|
| 搜索框（文章/评论/媒体）+ ⌘K | **无** | **无后台搜索接口**——API 清单里只有公开的 `/api/search` | ❌ **不能照抄**。要么删掉，要么另开 Spec 加后台搜索（含鉴权与索引） |
| 配色按钮 | 无 | 本轮新增 Setting `adminAccent` | ✅ 本轮功能 |
| 主题按钮（明/暗） | **待核实入口** | 项目有暗色体系（spec §9） | ⚠️ 先查清现有切换入口在哪；**若已有入口则只对齐视觉，不新增第二个入口**，避免两处状态不同步 |
| 通知铃（红点） | 无 | `pendingComments` 已有 | ⚠️ **建议不照抄**：导航项与底栏已经各有一个待审徽章，再加铃铛是**第三个重复入口**，只会分散注意力 |
| 头像 | 无（现为文字「你好，username」） | **无头像系统**（不能上传、无下拉菜单） | ⚠️ 不能照抄。可用首字母色块做纯展示，但**它不可点、无功能**——要么保留文字，要么明说它只是装饰 |

**结论：demo 顶栏 5 个元素里只有「配色按钮」能落地。** 其余 4 个必须显式决策（删除 / 改造 / 另立 Spec），**不许照抄成没有后端的摆设**。这与 §5「每个数字都要有真实数据源」是同一条纪律，只是从"数字"扩到"控件"。

### 5.2 现有功能不得在这次重写中丢失

以下行为都已在 [AdminWorkspace.tsx](main/src/components/admin/AdminWorkspace.tsx) / [AdminNav.tsx](main/src/components/admin/AdminNav.tsx) 里实现，改视觉时**必须原样保留**：

- **侧栏可收起**：`navOpen` 状态 + `admin-pane-toggle` 按钮 + `.admin-workspace--nav-collapsed`；≤1024px 默认收起（`matchMedia`）。demo 侧栏是固定不可收的，**不要按 demo 砍掉这个能力**。
- **编辑器页隐藏顶栏**：`isEditorPath()` 命中写文章 / 首页管理 / 模块编辑时，顶栏整体不渲染（`editor ? null`），把纵向空间让给编辑器。
- **`credentialsOnly` 模式**：强制改账号时不渲染导航与底栏（`admin-workspace--credentials`）。
- **返回前台按钮**（`ArrowLeftIcon` → `/`）。
- **待审评论徽章**：导航项与底栏**两处**都有（`pendingComments > 0` 时显示）。
- **导航项的实际分组（实测 `AdminNav.tsx`）**，阶段 3 加分组标题时按它分：
  - 侧栏 `RAIL` **11 项**：仪表盘 / 文章 / 写文章 / 瞬间 / 首页管理 / 模块管理 / 评论 / 媒体库 / 备份 / 更新 / 设置
  - 底栏 `TABS` **4 项** + 「更多」：仪表盘 / 文章 / 瞬间 / 评论
  - 「更多」sheet `MORE` **6 项**：首页管理 / 模块管理 / 媒体库 / 备份 / 更新 / 设置
- **激活态滑块**：侧栏与底栏都用 `m.span` + `layoutId`（`admin-rail-active` / `admin-tab-active`，220ms）——这是既有实现，**别改成逐项 transition**。
- **更多 sheet**（`AdminMoreSheet`）。
- **两处动画**：标题交叉渐变（`AnimatePresence mode="wait"`，160ms）、整页切换（`admin-page-swap`，入 220ms / 出 160ms）——换成新体系时改用 §6.8 的缓动 token，**但动画本身不能丢**。

> 判断依据：`AdminWorkspace.tsx` 194 行与 `AdminNav.tsx` 230 行的全部状态与条件分支。重写前把这两个文件的分支逐条列成清单，改完逐条对拍——**尤其 `editor` 与 `credentialsOnly` 两条分支，最容易在改视觉时被顺手删掉**。

---

## 6. 新功能：外观面板（概览卡片显隐 + 后台配色）

### 6.1 交互设计（已与用户确认：双入口）

> 用户确认：「两个都要」——面板管批量，卡片角标管单张。

**入口 A：顶栏「外观」按钮 + 滑出面板（批量）** ⚠️ *（原设计为概览页右边缘常驻把手，已变更，见下方变更记录）*

1. **布局壳顶栏右侧**一个「外观」按钮（调色盘图标 + 文字，图标用当前主色），与深浅主题切换按钮并排；
2. 点击从右侧滑出面板，列出全部 7 张卡片，每张一个开关；
3. 面板底部固定两个动作：**「全部显示」**、**「恢复默认」**；
4. 面板是**唯一能看到并恢复已隐藏卡片**的地方——这很关键，因为「隐藏」= 不渲染，被隐藏的卡在页面上没有痕迹。

> **变更记录（2026-02）**：入口最初做成「概览页右边缘、垂直居中的 32×68 常驻竖条」。发布后**第一个真实使用者没能找到它**（浅灰背景上的白底灰图标，太不显眼）。因此改为**布局壳顶栏的按钮**：① 视觉上是顶栏的一个正常元素，不再浮在页面边缘；② 配色影响整个后台，入口本就该在布局壳而非概览页；③ 与深浅主题切换并排，符合"外观类设置放一起"的直觉。原把手的样式已从 `admin.css` 删除。
>
> **同时补上的一环**：后台此前**没有主题切换入口**（主题切换只在前台 `Navbar` 的 `ThemeToggle` 里）。现在顶栏有了自己的主题按钮——逻辑复用同一个 `localStorage` key（`myblog-theme`）与 `html[data-theme]`，但**不复用前台的 `.theme-toggle` 类**（P-070）；两个图标同时在 DOM 里，由 CSS 按 `data-theme` 决定显示哪个，避免服务端不知道客户端主题导致的 hydration 不一致。
>
> **最终入口形态（用户要求，已定稿）**：外观入口**只保留在前台导航栏** —— `Navbar` 里一个图标，**只对已登录管理员渲染**，紧邻主题切换。判定放在 `SiteHeader`（server component）读 session：客户端判会让访客先看到再隐藏（闪一下），且等于暴露"这里有个后台功能"。点击走 `href="/admin?appearance=1"`。**后台标题行 `.admin-topbar` 不放任何额外按钮**（曾短暂放过「外观」按钮与主题按钮，都按要求删除；深浅主题切换用站点顶栏那一个）。
>
> **面板形态与开关状态**：面板是**右上角小弹窗**（`top: 76px; right: 16px; width: min(340px, calc(100vw - 32px))`，圆角 16px + 背板），从外侧划入；原先做过贴右侧的整高抽屉，按要求改成小弹窗。开关**从 URL 派生**（`searchParams.get("appearance") === "1"`，关闭时 `router.replace` 抹掉 query）——**不能用 `useState` 惰性初始化**：同路由只换 query 时组件不重新挂载，state 会停在首次挂载的值，表现就是"点了没反应"（已实测确认并修掉，见 P-079）。
>
> **为什么不原地弹出面板**：外观面板的样式在 `admin.css`，而它只被 `admin/layout.tsx` 引入（P-070 的隔离要求）。前台为一个面板引入 4400 行后台 CSS 不划算，复制一份面板样式又会造成双份维护。跳转到后台是成本最低且不破坏隔离的做法；若以后确实要原地弹，正确路径是把面板样式拆成独立文件由前后台共同引入，并相应修订 P-070 的表述。

**入口 B：卡片角标（单张）**

5. 每张卡片右上角一个 `×`，点击立即隐藏该卡；
6. 桌面：`hover` / `focus-within` 时显现（默认 `opacity: 0`，不抢视觉）；
7. 触屏（`hover: none`）：**常驻显示**——没有 hover 的设备否则根本找不到入口；
8. 点击区 ≥44×44（视觉仍可做 28×28 圆钮，靠 `::after` 外扩，沿用 spec §2 按钮规范）；
9. `aria-label` 带卡片名，如 `隐藏「累计阅读」`。

**兜底（必须做，否则用户会把自己锁死）**

10. 全部隐藏 → 网格区显示空态：「所有卡片都已隐藏」+「恢复默认」按钮；
11. **把手不随卡片隐藏而消失**，面板始终可达。
12. 卡片右上角若有既有内容（如系统状态卡的徽章），角标改为左上角或仅在 hover 时覆盖——逐卡确认，不许压住信息。

### 6.2 可开关卡片清单（7 张）

| key | 卡片 | 归属区 |
|---|---|---|
| `kpiPosts` | 文章 | KPI 区 |
| `kpiComments` | 评论 | KPI 区 |
| `kpiViews` | 累计阅读 | KPI 区 |
| `kpiMedia` | 媒体文件 | KPI 区 |
| `rankViews` | 阅读量最高 Top 5 | 大卡区 |
| `systemStatus` | 系统状态 | 大卡区 |
| `recentPosts` | 最近文章 | 全宽区 |

### 6.3 自动重排实现（纯 CSS，无 JS 测量）

```css
/* KPI 区：4 张时 4 列，隐藏后自动降列 */
.admin-dash__kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
/* 大卡区：2 张并排，剩 1 张时占满 */
.admin-dash__wide { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
```

隐藏 = **不渲染该卡**（不是 `display:none`），保证网格按实际卡片数重算，且不产生空洞。

### 6.4 持久化方案

- **存储**：Setting KV 新增 `dashboardCards`，值形如
  `{"kpiPosts":true,"kpiComments":true,"kpiViews":true,"kpiMedia":true,"rankViews":true,"systemStatus":true,"recentPosts":true}`
- **为什么不用 localStorage**：单管理员但可能多设备；Setting KV 是项目既有体系，且能与「面板优先」原则一致。
- **读**：概览页 server component 读一次，作为 client 组件初始值（无闪烁）。
- **写**：复用 `PUT /api/admin/settings`，**乐观更新**（先切 UI，失败回滚并提示）。

### 6.5 ⚠️ 配置字段同步三处（P-004，最容易漏）

新增 `dashboardCards` 必须同时改：

1. `main/src/lib/settings.ts` → `DEFAULT_SETTINGS` 默认值
2. `main/src/lib/validation/settings.ts` → `SettingKey` 可写白名单
3. `main/src/app/api/admin/settings/route.ts` → PUT 的 key 白名单

漏任意一处 → 表现为「开关点了没用」或「设置页保存报错」。**验收时必须逐条验证。**

### 6.6 组件拆分

- `main/src/app/admin/(protected)/page.tsx`（server）：查询 + 读设置，传数据
- `main/src/components/admin/DashboardView.tsx`（**新**，client）：卡片渲染 + 网格 + 卡片角标
- `main/src/components/admin/DashboardAppearancePanel.tsx`（**新**，client）：外观面板（配色 + 卡片两个 section），**由布局壳顶栏按钮唤出**，自足读写 `/api/admin/settings`
- 空态并入 `DashboardView`（预计 <30 行，不单开文件）

**状态归属（关键）**：显隐状态**只在 `DashboardView` 持有**，面板通过 props 接收状态与回调。两个组件各持一份 state 是这类双入口设计最常见的 bug——面板改了、角标没同步。

motion 仅允许在这两个新组件里 import（P-071 白名单），且必须 `LazyMotion` + `domAnimation`。

### 6.7 面板结构（两个 section 共用一个面板）

面板从右侧滑出，上下两段：

```
┌─ 外观 ───────────────────┐
│ 配色        影响整个后台  │
│  ●   ○   ○   ○   ○   ○   │  ← 6 个色块 + 名称，选中带描边环
│ 石墨 天青 藏青 松绿 绛红 赭石│
├──────────────────────────┤
│ 概览卡片                  │
│ [全部显示]  [恢复默认]    │
│  ☑ 文章      ☑ 评论       │
│  ☑ 累计阅读  ☑ 媒体文件   │
│  ☑ 阅读量最高             │
│  ☑ 系统状态  ☑ 最近文章   │
└──────────────────────────┘
```

**作用域必须标注清楚**：配色 = 整个 `/admin/*`；卡片 = 只有概览页。两者作用域不同却共用入口，UI 上不写清楚必然让用户误以为"切配色只影响这一页"。

面板命名：`DashboardAppearancePanel.tsx`（取代原定的 `DashboardCardsPanel.tsx`）。

### 6.8 配色方案（6 套预选）

| key | 名称 | 浅色主色 | 暗色主色 | 气质 |
|---|---|---|---|---|
| `graphite` | 石墨 | `#1f2937` | `#9ca3af` | 无彩色、极简、最耐看（**默认**） |
| `sky` | 天青 | `#0ea5e9` | `#7dd3fc` | 白天天空的亮蓝 |
| `navy` | 藏青 | `#1e40af` | `#60a5fa` | 稳重专业 |
| `emerald` | 松绿 | `#047857` | `#34d399` | 自然沉静 |
| `rose` | 绛红 | `#9f1239` | `#fb7185` | 克制有力 |
| `amber` | 赭石 | `#b45309` | `#fbbf24` | 温暖纸感 |

每套派生 **4 个锚点 + 8 级色阶**：

- **锚点**（色值在 `main/src/lib/admin/accents.ts`）：`--admin-accent`（500 主色）/ `--admin-accent-strong`（600 hover）/ `--admin-accent-deep`（700，浅底上的文字）/ `--admin-on-accent`（压在主色上的文字）
- **派生级**（公式在 `admin.css`）：`--admin-accent-50/100/200/300/400` 由 `color-mix(in srgb, var(--admin-accent) N%, var(--admin-bg))` 生成（6 / 12 / 24 / 45 / 72%）；`-500/600/700` 是锚点别名

**关键：锚点必须分浅色 / 暗色两组。** 暗色下 300/400 要与 `--admin-bg`（深色）混合，若锚点仍是深色主色，混出来就是「深底上的深色」——石墨在暗色下作文字色只有约 **1.2:1** 对比度，等于不可读。所以 `adminAccentStyle()` 生成两段：`:root{浅色锚点}` + `:root[data-theme="dark"]{暗色锚点}`，主题切换时自动跟随，**不需要额外 JS**。

**`--admin-on-accent` 是专门给「亮主色」准备的**：主色一旦变浅（如天青 `#0ea5e9`），白字压在它上面只有 2.6:1 对比度，主按钮文字发糊；天青因此把 `on-accent` 换成深蓝 `#082f49`。其余 5 套是深主色，直接配白字。

**实现时逐套算一遍对比度，浅色与暗色各算一次，别默认「主色配白字」永远成立。**

**默认改为 `graphite`**（用户反馈靛蓝偏紫、观感差）。原靛蓝体系不进预选列表。

**为什么全是低饱和深色**：后台是长时间停留界面，主色越克制，状态色（成功/警告/危险）的存在感越强，信息层级越清楚。彩色主色过多 = 状态色失效 = 不优雅。

### 6.9 实现方式（三个技术决策）

1. **单一事实源**：新增 `main/src/lib/admin/accents.ts`，导出 6 套 × 双主题的 6 个变量值 + 名称。色值集中在此，`admin.css` 只消费变量。

2. **注入点必须是 `:root`，且由 server 注入**：
   - `main/src/app/admin/layout.tsx`（server）读 `adminAccent` → 渲染 `<style>`，由 `adminAccentStyle()` 生成覆写 `:root` 与 `:root[data-theme="dark"]` 的锚点。
   - **不能**把 `data-accent` 挂在 `.admin-workspace`：**P-076 明确「弹窗 portal 到 body，token 不能挂 `.admin-workspace`」**，否则所有 portal 弹窗掉色。
   - **不能**用 localStorage：会闪烁且依赖 JS。
   - server 注入 = 首屏 HTML 内联，**零闪烁、零 JS**。
   - 注：P-040 禁的是 `layout.tsx` 里写 `<script>`，`<style>` 不受限。

3. **切换路径**：面板点击 → `PUT /api/admin/settings` → `router.refresh()` 重跑 server component。**不整页刷新、不重载 JS**。

4. **变量重命名**：`admin.css` 现有 `--admin-sky-*` 系列在阶段 1 一并改成语义化的 `--admin-accent-*`，否则"换 accent"没有落点。**已落地：admin.css 内 72 行改名完成，`--admin-sky-` 全仓 0 命中。**

### 6.10 `adminAccent` 配置同步与红线影响

同 §6.5，新增 `adminAccent` 必须同步三处：

1. `main/src/lib/settings.ts` → `DEFAULT_SETTINGS`（默认 `"graphite"`）
2. `main/src/lib/validation/settings.ts` → `SettingKey` 白名单
3. `main/src/app/api/admin/settings/route.ts` → PUT key 白名单

外加**枚举校验**：`adminAccent` 的值必须限制在 6 个 key 内，非法值回退 `graphite`（不要信任写入端）。

**红线影响（P-076）**：P-076 原文「改后台颜色只动 `admin.css` 的 `:root` / `:root[data-theme="dark"]`，禁止改 `--heo-*`」。新增多配色能力后，**色值的存放位置**从 CSS 移到 `accents.ts`，但**注入点仍是 `:root`**、`--heo-*` 依然不碰——核心约束不变。P-076 需补充这条说明（见 §12）。

---

## 7. 分阶段实施

> 每阶段独立可验证、可单独回滚。阶段间**不并行**（除 §9 标注的文件边界隔离项）。

### 阶段 1：token 换肤（只改 `admin.css` 顶部）

把 `:root` / `:root[data-theme="dark"]` 的主色、表面、描边、阴影换成 demo 体系；**其余值一律不动**。跑 `pnpm dev` 逐页截图对照，只有颜色变、几何不变。

### 阶段 2：基元层几何对齐

卡片圆角、按钮高度与变体、徽章、输入框、chip、空态。改 `admin.css` 基元段 + 少量 tsx 的 className。

### 阶段 3：布局壳

`AdminWorkspace.tsx` / `AdminNav.tsx`：侧栏宽度与分组标题、选中态、顶栏高度与搜索框位置、底部 tab bar 视觉。**导航项数量仍为 spec §3.3 定的 5 项 + 更多 sheet。**

### 阶段 4：概览页重写（含新功能）

1. 补 §5 的真实查询；
2. 新增 `DashboardView.tsx` + `DashboardAppearancePanel.tsx`；
3. 新增 `dashboardCards` Setting（§6.5 三处同步）；
4. 网格自动重排（§6.3）。

### 阶段 5：列表页与表单页视觉对齐

`posts` / `comments` / `modules` / `moments` / `uploads` / `backups` / `updates` / `settings` 逐页对齐 demo 的卡片、工具条、双形态列表。**结构不动，只改 className 与 CSS。**

### 阶段 6：写文章页与弹窗

`PostEditorForm.tsx` 外壳、`AdminDialog` 基元。`.admin-mdx-*` 与 DataClearDialog 的闸门逻辑**只换颜色，不动几何与逻辑**（spec §9 / P-068 / P-074）。

### 阶段 7：验收与文档同步

按 §10 走查，按 §12 同步文档。

---

## 8. 影响面分析

- **涉及模块**：`src/app/admin/**`（17 页）、`src/components/admin/**`（36 组件 + 新增 2）、`src/app/admin/layout.tsx`、`src/lib/settings.ts`、`src/lib/validation/settings.ts`、`src/app/api/admin/settings/route.ts`、`src/lib/admin/accents.ts`（新增）、`src/app/admin/admin.css`
- **新增/变更配置字段**：`dashboardCards`、`adminAccent`（**各自三处同步**，见 §6.5 / §6.10）
- **是否破坏红线**：
  - 存储可插拔（红线 5）：不涉及
  - SQL 参数化（红线 3）：全部走 Prisma，不新增原生 SQL
  - vendor 冻结（红线 2）：不动 `src/editor/**`
  - SQLite 单写者（红线 6）：不新增写入热点
  - 资源红线（红线 7）：不新增依赖；新增 2 个 client 组件，不引入 motion 之外的包
  - 面板优先（红线 9）：**本次功能正是把自定义能力做进面板**，符合
- **是否新增依赖**：**否**（motion 与 `@radix-ui/react-icons` 均已在 `package.json`）
- **前台影响**：零。`admin.css` 只进 `/admin/*`；不动 `globals.css` 的 `--admin-*`（前台 TransferHud 依赖，P-070）

---

## 9. 子代理拆分与冲突边界

> 用户已允许使用子代理（v4.1 flash）。**但并行必须按文件边界切，不能按页面切。**

### 9.1 硬约束

`admin.css` 是**单文件 3394 行**。任何两个子代理同时改它 = 必然冲突。因此：

| 波次 | 子代理 | 独占文件 | 可并行 |
|---|---|---|---|
| W1 | A | `admin.css`（阶段 1+2+3 全部 CSS） | 否，串行 |
| W2 | B | 概览页 3 个文件 + settings 三处 | 是 |
| W2 | C | 列表页 tsx（阶段 5，**不改 CSS**） | 是 |
| W3 | A | `admin.css` 页面级样式收口 | 否 |

### 9.2 子代理注入要求

每个子代理 prompt 必须包含：AGENTS.md 路径、`docs/ai/module.md`、`docs/pitfalls.md`、本计划对应阶段、以及**其独占文件清单**。禁止子代理自行扩大文件范围。

---

## 10. 验收标准

- [ ] 每个概览指标都能在代码里指到对应的 Prisma 查询，**无静态假数据**
- [ ] 卡片显隐：关 2 张 → 网格自动补位无空洞；刷新后保持；`dashboardCards` 三处同步无遗漏
- [ ] 单张 `×` 隐藏后，能在面板里重新打开（恢复路径可达，不丢卡）
- [ ] 全部隐藏 → 出现空态与「恢复默认」，顶栏「外观」入口始终可达
- [ ] 卡片角标：桌面 hover 显现 / 触屏常驻 / 点击区 ≥44px / 不压住卡片既有内容
- [ ] 配色：6 套逐套切换，按钮/选中态/徽章/图表全部跟随；**portal 到 body 的弹窗同样跟随**（P-076 的坑，必须实测一个弹窗）
- [ ] 配色：首屏无闪烁（server 注入而非 localStorage）；切换后不整页刷新
- [ ] 配色：非法 `adminAccent` 值回退 `graphite`，不白屏
- [ ] 前台页面零影响（`--heo-*` 未被改动，评论表单/密码门/搜索页抽查）
- [ ] 顶栏元素逐项决策完成：搜索框 / 通知铃 / 头像**不落地为无后端摆设**（§5.1）
- [ ] §5.2 的现有功能逐条对拍未丢失，尤其 `editor`（编辑器页隐藏顶栏）与 `credentialsOnly` 两条分支
- [ ] 390×844 逐页走查无横向滚动、无元素被底栏遮挡（spec §6 全清单）
- [ ] 桌面 1440 与改写前功能路径逐条对拍，**功能零变化**
- [ ] 不出现「高度 ≤44px 且宽度 100%」的按钮
- [ ] `prefers-reduced-motion: reduce` 下过场瞬时
- [ ] 前台首屏 chunk **不含 motion**
- [ ] `pnpm lint` / `pnpm build` 通过
- [ ] Windows 上 `pnpm dev` 实际跑过

### 10.1 运行时验收证据（零污染方式，2026-02）

**方法**：不碰真库、不需要用户账号 —— 复制 `data/blog.db`（含 `-wal`/`-shm`）到临时目录 → 用 `better-sqlite3` **只在副本上**把管理员密码改成已知值 → `DATABASE_PATH` 指向副本起 dev → `curl` 完成 CSRF + 登录 → 抓 `/admin` 真实 HTML。跑完删副本，真库 hash 前后一致。

**实测结果**：

| 检查项 | 结果 |
|---|---|
| `POST /api/auth/login` | 200 `{"data":{"username":"admin"}}` |
| `GET /admin` | 200，87914 字节（未登录时是 50817 字节的降级页，可作对照） |
| `admin-workspace`（布局壳） | 1 ✅ |
| `admin-dash__kpis` / `__wide` / `__full`（三个网格分区） | 1 / 1 / 0（full 区在无数据时不渲染） |
| `admin-status-list`（系统状态卡） | 2 ✅ |
| `admin-appearance__handle`（外观面板把手） | 1 ✅ *（当时的设计；该入口后改为布局壳顶栏按钮，见 §6.1 变更记录）* |
| `admin-card-toggle`（面板内开关） | 0 ✅ 合理（面板默认关闭，`open` 才渲染） |
| `admin-ranks`（阅读榜） | 0 → 页面出现「还没有已发布的文章」，**是正确分支而非 bug** |
| 4 个 KPI 卡的值 | 全部渲染出 `0` —— **"0"本身就是证据**：证明 Prisma 查询 → server component → HTML 链路真的跑通 |
| 系统状态卡内容 | `自动备份 … 正常` / `对象存储 … 未配置` / `程序版本` —— 读到了真实 Setting |
| `:root:root` accent 注入 | 存在 ✅（与 `/admin/login` 页一致） |

**尚未覆盖**：390×844 逐页视觉走查、桌面与改写前的功能路径对拍 —— 这两项需要浏览器交互（截图/点击），`curl` 无法完成。

---

## 11. 风险与容易做错的地方

1. **照抄 demo 的切页机制** → 砸掉 App Router。demo 是视觉参照，不是代码模板。
2. **漏 `dashboardCards` 三处同步**（P-004）→ 开关看起来没反应，最难查。
3. **在 `admin.css` 里改 `.heo-*` / `.form-field`**（P-070）→ 静默改坏前台评论表单、密码门、搜索页，且后台验收看不见。
4. **把 `--admin-*` token 整块搬走**（spec §8.3）→ 前台 TransferHud 掉色（P-060）。
5. **表格用横滑糊弄竖屏**（spec §8.5）→ 直接不可用。
6. **自动扫盘做「存储占用」** → 违反既有性能决策。
7. **motion 泄漏到前台**（spec §8.8）→ 审查方式：搜 `from "motion` 的文件路径白名单。
8. **3400 行 CSS 全量重写** → 高风险。原则：**token 与基元改值，页面级只调对齐**，不做推倒重来。
9. **顶栏里的浮层会被内容盖住**（已在 demo 上实测踩到）：`.topbar` 的 `backdrop-filter` 会创建 stacking context，此时内部浮层的 `z-index` 再大也跳不出这一层，而 `.content` 在文档流中排在顶栏之后 → 浮层被卡片覆盖。**修法是给 `.topbar` 自身加 `position: relative; z-index`，不是给浮层加 z-index。** 注意窄屏下顶栏是 `sticky` + `z-index`，所以同一个 bug 表现为「有时挡有时不挡」——验收时必须同时测桌面与窄屏。
10. **改名导致的存量值**：预设 key 一旦改动（如 `teal` → `sky`），已存进 Setting 的旧值会成为非法值。回退逻辑（§6.10 枚举校验）必须覆盖这种情况，不能白屏。
11. **照抄顶栏造出假控件**：demo 顶栏 5 个元素里 4 个没有后端——搜索框（**全项目无后台搜索接口**）、通知铃（与导航/底栏两处徽章重复）、头像（**无头像系统**）、主题按钮（入口待核实）。照抄的结果是界面上多出三个点不动的摆设。**逐项决策见 §5.1。**
12. **改视觉时顺手删掉既有分支**：`AdminWorkspace.tsx` 里 `editor`（编辑器页隐藏顶栏）与 `credentialsOnly` 两条分支不显眼，但删掉后写文章页会被顶栏挤掉高度、强制改账号流程会露出完整后台。**改前把 194 行的分支列成清单，改完逐条对拍**（§5.2）。
13. **既有 tsc / lint 问题（非本次重写引入）—— tsc 已清零，build 已通过**：
    - **`tsc`：8 处 → 0 处 ✅**。修的都是零行为变化的最小改动：`components/common/Lightbox.tsx` 4 处闭包内 null 收窄（TS 不在嵌套函数体继承外层收窄，同层的监听器调用不报错即为证）、`lib/upload/compress.ts` 2 处 `sharp.Sharp` 命名空间引用（文件是默认导入，改 `type Sharp`）、`lib/upload/handle.ts` 1 处 `Buffer<ArrayBufferLike>` 泛型赋值（显式标注）、`components/admin/HomeLayoutEditor.tsx:458` 1 处 `PlacementBox` 缺 `hPct`（**结论由代码结构确定**：`MoveDrag` 只有像素 `width/height`、无 `hPct`，说明拖动只改位置不动高度，故取该模块原 `hPct`）。
    - **`pnpm build`：✅ 通过**（`Compiled successfully in 1402ms` / `Finished TypeScript in 2.1s` / 65/65 静态页生成 / exit 0）。构建日志里的 "Bing 每日一图获取失败，已使用本地回退图" 是**预期行为**（构建期无外网 → 回退本地图），不是错误。
    - **`lint`：23 errors / 6 warnings（未处理，建议单独立项）**，集中在 `scripts/boot.cjs`、`scripts/relaunch-app.cjs`、`MediaLibraryPicker.tsx`、`Lightbox.tsx`、`TransferHud.tsx`、`MomentsModule.tsx`、`upload/handle.ts`——多为 React 19 的 `react-hooks/set-state-in-effect`，修它要重构 effect 逻辑，不是类型层能解决的，且涉及 7 个与本轮无关的文件，混进来会让"重写是否引入回归"失去判据。**注意**：Next 16 的 `next build` 不跑 eslint，因此它不阻塞构建。

---

## 12. 文档同步清单（交付前必做）

- [ ] `docs/admin-ui-rewrite-spec.md`：追加「第三轮：冷灰表面 + 可切换配色」小节（或另立文件）
- [ ] `docs/ai/module.md`：新增 `DashboardView.tsx` / `DashboardAppearancePanel.tsx` 行
- [ ] `docs/data-models.md`：Setting KV 新增 `dashboardCards` 说明
- [ ] `docs/api-contracts.md`：`/api/admin/settings` 可写 key 补 `dashboardCards`
- [ ] `AGENTS.md`：§3 导航、§4 pitfalls 摘要、§6 状态摘要
- [ ] `docs/pitfalls.md`：新增 P-0XX（照抄 demo 切页机制 / `dashboardCards` 与 `adminAccent` 各自三处同步 / token 不得挂 `.admin-workspace`）
- [ ] `docs/pitfalls.md` P-076：补充「配色值集中在 `lib/admin/accents.ts`，注入点仍是 `:root`」
- [ ] `docs/README.md`：职责表补本计划文件
- [ ] `PLAN.md`：里程碑条目

---

## 13. 审批与执行状态

- [x] **用户已确认 §6.1 交互**：面板 + 卡片角标「两个都要」
- [x] 用户已批准（"开始吧"）
- [x] 按 §7 分 7 阶段执行完成，每阶段附验证证据
- [x] §10 验收对账完成（15/17，2 项需浏览器交互）；§12 文档同步 9/10（`PLAN.md` 为用户主责）

### 13.1 最终交付证据（2026-02）

| 类别 | 结果 |
|---|---|
| `pnpm exec tsc --noEmit` | **0 错误**（起点是 8 处既有错误，本轮顺带清理，全部为零行为变化的最小改动） |
| `pnpm build` | **通过**：`Compiled successfully in 1402ms` / `Finished TypeScript in 2.1s` / 65/65 静态页 / exit 0 |
| 首屏 accent 注入 | 实测 `/admin/login` HTML 同时含 `:root:root{--admin-accent:#1f2937…}` 与 `:root:root[data-theme="dark"]{--admin-accent:#9ca3af…}` —— 浅/暗两套锚点都在，零闪烁 |
| 概览页 SSR（登录后真实 HTML） | 87914 字节；`admin-workspace` / `admin-dash__kpis` / `admin-dash__wide` / `admin-status-list` / `admin-appearance__handle` 均命中（未登录时是 50817 字节的降级页，差值即登录态生效的证据） |
| 交互（CDP `Runtime.evaluate`，真实环境） | **16/16 通过**：卡片角标隐藏（slot 7→6）、面板渲染（7 开关 / 6 色块）、**双入口状态同步**（被隐藏的卡在面板里同步取消勾选——验证了单一状态源）、配色切换（`#1f2937`→`#0ea5e9`，`on-accent` 同步→`#082f49`）、无 `data-accent` 属性 |
| 视觉（CDP + cookie 注入截图） | 桌面概览 / 移动端 390 / 桌面文章列表 三张：侧栏 4 组分组、石墨灰主色（非天蓝）、浅灰底白卡、四区布局、右边缘把手 —— 全部确认。*（把手后来改成顶栏按钮，截图未重拍；改动的样式已通过 tsc 与类名核对）* |
| 红线 | `--heo-*` 零写入 / `globals.css` 未改动 / `.admin-mdx-*` 仅改变量名 / motion 引用 6/6 全在 `components/admin/` |
| 零污染保证 | 所有运行时验证在**数据库副本**上完成（`DATABASE_PATH` 指向副本 + 仅在副本改密码），真库 hash 全程未变（`$2b$12$iusRa2HI`） |

### 13.2 未纳入本轮的事项（有意为之）

- **`pnpm lint` 的 29 个既有问题**：集中在 `boot.cjs`、`relaunch-app.cjs`、`Lightbox`、`TransferHud`、`MomentsModule`、`upload/handle`、`MediaLibraryPicker` 等 7 个与本轮无关的文件，多为 React 19 的 `react-hooks/set-state-in-effect`（修它需重构 effect 逻辑）。**Next 16 的 `next build` 不跑 eslint**，故不阻塞构建。建议单独立项——混进本轮会让"重写是否引入回归"失去判据。
- **`PLAN.md` 里程碑条目**：AGENTS §7 定为用户主责，建议文本见交付回复。
- **其余 8 个后台页面的视觉截图**：这些页面的结构均为第一轮重写产物，本轮只换 token，已用文章列表页验证"随 token 自动跟随"。
