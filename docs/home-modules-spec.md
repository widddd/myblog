# 首页模块化与后台布局（Spec）

- 日期：2026-08-30
- 状态：已实施（M8）
- 相关红线：AGENTS §2.1 复用优先、§2.4 评论纯文本、§2.8 文档同步

## 1. 目标

管理员在后台像填方格一样排布首页，并能新建模块（现有基础组件 / HTML+CSS+JS）。前台按布局渲染：桌面两侧留白、随显示器变宽；电脑/手机两套几何（盒子先定高），走手机套时 12 列铺满。

已确认的两条边界：

- Banner 也是默认大方格，可拖到任意行，不是钉死在顶上的例外。
- 自定义代码只给管理员写，**直接注入当前页**（能碰整页 DOM / 样式 / 脚本），不过 MDX sanitize 管线。

## 2. 两层模型

```
HomeModule（模块目录）──> HomePlacement（格点）──> HomeGrid（渲染）
        │
        ├── builtin：11 个内置 React 模块
        └── custom：积木 + HTML/CSS/JS
```

- **模块目录**（`/admin/modules`）：模块是包裹。内置 11 种 + 管理员自建。
- **首页布局**（`/admin/home`）：把目录里的模块放到 12 列格子上。

一个模块在首页最多出现一次（`HomePlacement.moduleId` 唯一）。要两块自定义内容就建两个模块。

布局不进 Setting KV（避免 P-004 多源不同步，且 JSON 会很大），单独建表。

## 3. 数据模型

`HomeModule`

| 字段 | 说明 |
|---|---|
| `slug` | 唯一。内置固定为 key，自建为 `custom-<slugify(name)>` |
| `name` | 显示名 |
| `kind` | `builtin` / `custom` |
| `builtinKey` | 11 个 key 之一，仅 builtin |
| `html` / `css` / `js` | 仅 custom，各上限 32KB |
| `blocks` | JSON：`HomeBlock[]`，仅 custom |
| `config` | JSON：实例配置（读取时与内置默认值合并） |
| `system` | 内置为 true，不可删除，只能关闭 |

`HomePlacement`

| 字段 | 说明 |
|---|---|
| `moduleId` | 唯一 |
| `enabled` | 关掉即前台不渲染 |
| `col` 1–12 / `colSpan` 1–12 | 桌面横向位置 |
| `row` ≥1 | 行带（band） |
| `rowSpan` | **保留字段，恒为 1**，见 §4 |
| `hPct` | 桌面高度占设计视口的百分数；0 = hug |
| `mobileCol` / `mobileColSpan` / `mobileRow` / `mobileHPct` | 手机套几何 |
| `sort` | 同格堆叠顺序；保存时按桌面 `row, col` 重算 |

## 4. 格点模型：行带 + 同格堆叠（关键决策）

最初设想用 CSS Grid 的行跨越（posts 跨 5 行、右侧 5 个 widget 各占 1 行）。**这个方案不可用**：CSS Grid 会把跨行元素多出来的高度平均摊到它跨过的每一行，于是右侧 widget 之间被撑出两三百像素的空隙。

实际采用的模型：

- `row` 是**行带**。同一行带内的格子横向并排，行带高度 = 最高的那个格子。
- 格子由 `(row, col, colSpan)` 标识。**落在同一个格子里的多个模块纵向堆叠**，顺序按 `sort`。
- 因此不需要 `rowSpan`：右侧一整列 widget 就是「同一个格子里堆了 5 个模块」。
- 同一行带内横向重叠时，被压住的格子整体下移一行（`toAreas()` 里解决，前台与后台画布共用）。

默认布局（与改造前视觉等价）：

| 行 | 列 | 模块 |
|---|---|---|
| 1 | 1–12（出血满宽） | 首页大图 |
| 2 | 1–6 / 7–12 | 欢迎光临 / 瞬间（推荐文章默认关闭，仍可在首页管理打开） |
| 3 | 1–9 | 文章卡片（分类栏 + 大卡 + 分页） |
| 3 | 10–12（堆叠） | 公告 → 站点 → 分类 → 标签 → 最近发布 |
| 4 | 1–12（居中文案） | 运行时间（Setting `siteStartedAt` 为空则前台不显示） |

## 5. 桌面 / 手机

两套几何存在 `HomePlacement`：桌面 `col/colSpan/row/hPct`，手机 `mobileCol/mobileColSpan/mobileRow/mobileHPct`。其它模块配置共用。高度 `hPct` 是标准设计视口（电脑 1440×900 / 手机 390×844）的百分数，`0` 表示随内容增高。真机用 `--h-unit: clamp(7px, 1dvh, 11px)`。

走手机套：`(max-width: 959px), ((hover: none) and (max-height: 540px))`（横屏手机仍走手机套）。桌面 12 列带两侧留白；手机 12 列铺满，area `display: contents`，格子用 `--m-cell-*`。格点必须写成 CSS 变量（P-036）。后台 `/admin/home` 可强制电脑/手机画框。详见 [responsive-layout-spec.md](responsive-layout-spec.md)。

## 6. 内置 11 模块

| key | 来源组件 | 可配置 |
|---|---|---|
| `banner` | `HomeBanner` | 副标题、高度（满屏/大/中） |
| `welcome` | `modules/WelcomeModule` | 小标题、主标题多行、漂浮色块文字（`chips`，每行一条）、色块开关、两个按钮 |
| `recommend` | `modules/RecommendModule` | 条数 1–6；**默认关闭** |
| `moments` | `modules/MomentsModule` | 标题、文案条数 3–12；占原推荐格点。详见 [moments-home-spec.md](moments-home-spec.md) |
| `posts` | `modules/PostsModule` | 是否显示分类栏 |
| `announcement` | `widgets/AnnouncementWidget` | 标题、正文（空则回退 `Setting.announcement`） |
| `site` | `widgets/SiteStatsWidget` | 标题 |
| `categories` | `widgets/CategoriesWidget` | 标题 |
| `tags` | `widgets/TagsWidget` | 标题 |
| `recent` | `widgets/RecentPostsWidget` | 标题、条数 |
| `uptime` | `modules/UptimeModule` | 标题。开始时间走 Setting `siteStartedAt`（精确到秒）；空则前台不渲染，后台画布显示占位提示 |

侧栏五块被抽成 `components/widgets/*`，文章/分类/标签/归档页的 `Sidebar` 改为组合同一批组件，不存在两份实现。文章阅读页 `Sidebar reading` 默认只渲染目录，其余五块由 `PostSidebar` 右侧按钮展开。

数据查询：文章继续只走 `lib/posts/query.ts` 的 `publishedWhere()`；瞬间走 `listHomeMoments()`。`lib/home/data.ts` 按当前启用的模块与积木决定查什么，关掉的模块不打数据库。

## 7. 自建模块：包裹 + 积木 + 代码

自建模块 = 包裹（可选玻璃卡）+ `blocks[]` + 代码三栏。

积木全部复用现成组件：标题、段落、按钮、图片、分隔线、文章大卡（`PostCard`）、文章宫格（`mini-card`）、分类列表、标签云、站点统计、最近发布、HTML 片段。

代码注入（`CustomModuleRuntime`）：

- HTML：`dangerouslySetInnerHTML`。
- CSS：默认用 `.home-custom--<slug>{...}` 原生嵌套包一层限定在模块内；可取消勾选改为全站生效。
- JS：`document.createElement('script')` 执行（`innerHTML` 里的 `<script>` 不会跑），外面套 `try/catch`，一块脚本报错不连坐整页。

## 8. 安全边界

- 只有 `requireAdmin` 能写 `html/css/js`；单模块各 32KB 上限。
- 这是**管理员内容面**，按用户决策不过 sanitize。等价于管理员可以 XSS 自己的站点，单管理员场景可接受。
- **不因此放宽任何其他链路**：评论/昵称仍纯文本禁 `dangerouslySetInnerHTML`，正文 MDX 仍过 `lib/markdown/sanitize.ts`。
- 现有 CSP 不限制 `script-src`。若以后收紧 CSP，自定义 JS 会一起失效（P-034）。

## 9. 后台 UI

沿用写文章的分栏骨架与 P-033 的滚动/收起规则。

**首页管理 `/admin/home`**：左栏可调首页外观、选中模块的开关、当前视口的位置/宽高与配置（可重置该视口大小）；右栏强制模拟电脑 16:10 或手机 390×844 画框，可拖动、改宽、改高。不是 iframe（站点 `X-Frame-Options: DENY`）。

**模块管理 `/admin/modules`**：列表 + 新建/编辑。内置模块只能改 `config` 与名称，不能删、不能改 key、不能加代码。

## 10. API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET / PUT | `/api/admin/home/layout` | 读写全部格点（PUT 整表替换，zod 校验） |
| GET / POST | `/api/admin/modules` | 目录列表 / 新建 custom |
| GET / PATCH / DELETE | `/api/admin/modules/[id]` | 详情 / 修改 / 删除（内置 409，仍在启用中 409） |

写成功统一调 `revalidatePublicContent()` 刷新 `/`。

## 11. 以后改首页的流程

1. 先在 `/admin/modules` 建或改模块；
2. 往模块里加积木或代码；
3. 最后在 `/admin/home` 入格。

**禁止再往 `page.tsx` 堆一次性 JSX**（P-035）。
