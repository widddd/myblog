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
        │                                    └── HomeFloat（覆盖层：不占格点）
        ├── builtin：13 个内置 React 模块（其中「推荐应用」可编辑）
        └── custom：积木 + HTML/CSS/JS（模板建出来也落在这里）
```

- **模块目录**（`/admin/modules`）：模块是包裹。内置 13 种 + 管理员自建。
- **首页布局**（`/admin/home`）：把目录里的模块放到 12 列格子上。**进不进格点流只有一个口子**：`lib/home/grid-model.ts` 的 `buildHomeAreas()`（前台 `HomeGrid` 与后台画布都过它）—— 页脚运行时间、覆盖层模块、App 里不渲染的模块都在**分组之前**摘掉。

一个模块在首页最多出现一次（`HomePlacement.moduleId` 唯一）。要两块自定义内容就建两个模块。

布局不进 Setting KV（避免 P-004 多源不同步，且 JSON 会很大），单独建表。

## 3. 数据模型

`HomeModule`

| 字段 | 说明 |
|---|---|
| `slug` | 唯一。内置固定为 key，自建为 `custom-<slugify(name)>` |
| `name` | 显示名 |
| `kind` | `builtin` / `custom` |
| `builtinKey` | 13 个 key 之一，仅 builtin |
| `html` / `css` / `js` | 自建模块，以及**可编辑内置模块**（推荐应用）；各上限 32KB。可编辑内置模块的这三栏为空时，读取侧补上出厂代码（`BuiltinDefinition.defaultCode`，用户写过就不覆盖） |
| `blocks` | JSON：`HomeBlock[]`，仅 custom |
| `config` | JSON：实例配置（读取时与内置默认值合并；含 `style` 基本样式与自建浮层的 `floating` 开关） |
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
| 3 | 1–9 | 文章卡片（分类栏 + 大卡 + 分页，卡间可穿插瞬间卡） |
| 3 | 10–12（堆叠） | 公告 → 站点 → 分类 → 标签 → 最近发布 |
| — | Footer 版本信息行中间 | 运行时间（Setting `siteStartedAt` 为空则不显示） |

`uptime` 不占首页格点，实际由 Footer 复用同一个模块组件渲染在版本信息行中间；在首页管理中勾选或取消勾选仍控制它是否显示。

## 5. 桌面 / 手机

两套几何存在 `HomePlacement`：桌面 `col/colSpan/row/hPct`，手机 `mobileCol/mobileColSpan/mobileRow/mobileHPct`。其它模块配置共用。高度 `hPct` 是标准设计视口（电脑 1440×900 / 手机 390×844）的百分数，`0` 表示随内容增高。真机用 `--h-unit: clamp(7px, 1dvh, 11px)`。

走手机套：`(max-width: 959px), ((hover: none) and (max-height: 540px))`（横屏手机仍走手机套）。桌面 12 列带两侧留白；手机 12 列铺满，area `display: contents`，格子用 `--m-cell-*`。格点必须写成 CSS 变量（P-036）。后台 `/admin/home` 可强制电脑/手机画框。详见 [responsive-layout-spec.md](responsive-layout-spec.md)。

## 6. 内置 15 模块

| key | 来源组件 | 可配置 |
|---|---|---|
| `banner` | `HomeBanner` | 副标题、高度（满屏/大/中） |
| `welcome` | `modules/WelcomeModule` | 小标题、主标题多行、**漂浮色块文字**（`chips`，每行一条，**最多 24 条**、每条最多 8 字）、**一屏看到几颗**（`chipVisible`，3–16，决定密度：`泡泡高度 = 可用高度 ÷ 一屏几颗`，下限 24px）、色块开关、两个按钮。泡泡列是 client 组件（`modules/WelcomeChips`）：**每次进页面 Fisher–Yates 打散顺序**，列表整份复制两份交给 CSS `rowup-scroll` 无缝上滚（时长 18–90s 随密度变），密度按格子实际高度用 `ResizeObserver` 实时算 |
| `recommend` | `modules/RecommendModule` | 条数 1–6；**默认关闭** |
| `moments` | `modules/MomentsModule` | 标题、文案条数 3–12；占原推荐格点。详见 [moments-home-spec.md](moments-home-spec.md) |
| `posts` | `modules/PostsModule` | 是否显示分类栏；**一页最多穿插几个瞬间**（`momentLimit`，0–8，0 = 不插）。穿插卡 = `modules/MomentCard`，瞬间与文章**按时间混排**（比本页最后一篇还早的属于后面的页），纯逻辑在 `lib/home/interleave.ts`。发布/改/删瞬间本来就走 `lib/moments/admin.ts` 的 `revalidatePublicContent()`（含 `revalidatePath("/")`），所以首页会立刻跟着变 |
| `albums` | `modules/AlbumsModule` | 标题、**只看这几个相册**（每行一个相册地址名，留空 = 全部启用相册；只做筛选，不会按相册自动成组）、最多几张（6–24，默认 12）、**滚动一轮几秒**（20–180，默认 60）。取数 `listHomeAlbumImages()`：多个相册**轮流取**（每册最多 4 张）所以是混排；图片走**二级缩略图**；`prefers-reduced-motion` 与后台画布预览静态。**默认关闭**（老站排版不被升级改动），默认格点桌面满宽 260px、手机 200px。详见 [albums-spec.md](albums-spec.md) §3.6 |
| `album-cards` | `modules/AlbumCardsModule`（client：只用来量一次封面区宽度） | **一本相册一张卡**（与上面 `albums` 的滚动照片条是两码事）：封面是这本相册**一叠照片**（最多 4 张二级缩略图，进页面约 1s 后依次向右抽出）+ 标题 + 张数（有卷时带 · N 卷）+ 照片日期区间，整张卡点进这本相册。标题、**只摆这几个相册**（同上留空 = 全部）、最多几本（2–8，默认 4）。取数 `listHomeAlbumCards()`（吃 `listPublicAlbums` 的缓存，写入侧本来就会立即过期）。**默认关闭**，出厂格点与瞬间模块**同规格**（桌面 6 列 × 380px、手机满宽 340px）。详见 [albums-spec.md](albums-spec.md) §3.6b |
| `announcement` | `widgets/AnnouncementWidget` | 标题、正文（空则回退 `Setting.announcement`） || `site` | `widgets/SiteStatsWidget` | 标题 |
| `categories` | `widgets/CategoriesWidget` | 标题 |
| `tags` | `widgets/TagsWidget` | 标题 |
| `recent` | `widgets/RecentPostsWidget` | 标题、条数 |
| `uptime` | `modules/UptimeModule` | 标题。开始时间走 Setting `siteStartedAt`（精确到秒）；启用时渲染在 Footer 版本信息行中间，空则不显示，后台画布显示占位提示 |
| `popup` | `modules/PopupModule` | **覆盖层**：出场边（左侧 / 右上 / 右下 / 居中提示框）、进页面几秒后出现（0–60）、关闭叉叉开关、关掉后是否记住、标题 / 正文 / 按钮文字 / 按钮链接 / 配图。默认关闭 |
| `app-promo` | `modules/AppPromoModule` | **覆盖层 + 可编辑内置模块**：自带 3 秒右上角滑入的白卡（方形内置矢量 logo + 小标签 + 标题 + 一句说明 + 立即下载）。出场边 / 延迟 / 关闭叉叉 / 是否记住 / 内容字段同上，外加小标签 / 标题 / 一句说明 / 按钮文字与静态下载页链接 / 应用图标地址（留空用内置矢量 logo）。**写了 HTML/CSS/JS 就整块换成用户版本**（出厂代码见 `lib/home/templates.ts` 的 `APP_PROMO_HTML`，与 React 卡片同一套类名），编辑页可「填回出厂代码」。默认关闭 |

### 6b. 覆盖层模块（popup / app-promo）

和普通内置模块的**唯一区别在渲染层**，其余（配置、大小、位置、启用开关、后台画布）完全一致：

- 标记：`BuiltinDefinition.floating = true`（`floatingDefinition()` 查询）。
- 前台：`HomeGrid` 把它们**摘掉**（不进 `toAreas()`，不占格点流），由 `components/home/HomeFloat` 画成覆盖层。
  **`HomeFloat` 必须是 `.home-shell` 的兄弟节点**，不能是后代 —— `.home-shell` 带 `z-index` 会建层叠上下文，后代里写 `z-index: 100` 也压不过 Banner（见 P-135）。
- 出场：`position: fixed` + `--float-z: 100`（低于灯箱 200 / 顶栏进度 240）；延迟用 CSS `animation-delay: var(--float-delay)`，**组件不需要计时器**，进场动画常驻在 `.home-popup--enter-*` 上。
- 位置与大小：`col`/`colSpan` 决定贴左/居中/贴右与宽度（`clamp(280px, colSpan/12*100vw, 440px)`），
  **垂直边由模块自己的 `placement` 决定**（左上/左下都归「左侧滑入」，右上/右下与中间各一款）；
  手机档忽略四角、统一贴底满宽（底部安全区已留）。同侧启用多个时自动往下/往上错开一档。
- 关闭：`dismissible` 控制叉叉；`once` 打开时关闭会写 `localStorage`（键 `myblog:popup:<slug>`）并在下次访问直接不显示；
  延迟期间挂 `is-delayed`（`pointer-events: none`），**延迟结束必须摘掉**（见 P-136）。
- 后台画布：`HomeModuleRenderer` 传 `preview` → 静态渲染（`relative`、无动画、无关闭按钮），
  否则画布里根本看不到自己配了什么。

侧栏五块被抽成 `components/widgets/*`，文章/分类/标签/归档页的 `Sidebar` 改为组合同一批组件，不存在两份实现。文章阅读页 `Sidebar reading` 默认只渲染目录，其余五块由 `PostSidebar` 右侧按钮展开。

### 6c. 模块编辑器：模板 + 基本样式 + 可编辑内置模块（2026-10-02）

**模板**（`lib/home/templates.ts`）：新建模块时先选起点，5 个模板 —— 空白模块 / 图文卡片 / 通栏横幅 / **弹出模块** / **推荐应用**。模板 = 一份出厂 HTML+CSS+JS + 初始 `config` + 默认几何，**只是新建时的初值**，不进库、不参与渲染，日后改模板写法不影响已建模块。

- 「弹出模块 / 推荐应用」两个模板建出来的是 **`kind: custom` + `config.floating: true`**：同样是覆盖层，与内置那两个行为一致。
- **浮层判定只有一个口子**：`lib/home/types.ts` 的 `isFloatingModule()`（内置看 `FLOATING_MODULE_KEYS`，自建看 `config.floating`）。`HomeGrid` 摘除、`HomeFloat` 渲染、`ModuleBody` 套不套外壳三处都走它 —— 各判各的就会出现「卡片内容在、定位与动画全没了」（P-137）。

**基本样式**（`lib/home/style.ts`）：字体 / 字号 / 对齐 / 正文色 / 标题色 / 背景色 + 背景图 + 压暗 / 强调色 / 圆角 / 内边距 / 投影 / 按钮底色·文字色·圆角·占满一行。

- **不开数据库列**：样式是有默认值、可增量覆盖的一组键，落在 `HomeModule.config.style`（JSON），自动继承「读取时与默认值合并」。字段清单是**单一事实源**：写入校验（zod `.strict()`）与读取清洗由同一份 `styleShape` 派生，避免「配了半天保存被吃掉」或「写进库渲染时静默丢掉」。
- 产出 `--mod-*` 变量 + `data-mod-style="--mod-text --mod-radius …"`（**配过的变量名**）。官网 CSS 只在该变量确实配过时把 `--heo-*` 重绑到它，**没配过就完全跟随主题** —— 这条是「空变量把主题刷没」的防线（`globals.css` 里 `.home-module, .home-popup[data-mod-style]` 的兜底块）。
- 用户自己写的 HTML/CSS 可以直接 `var(--mod-accent, var(--heo-theme))` 取用；`--heo-*` 在自己的模块范围内被重绑，所以站点组件（`.glass-card` 等）也会跟着走。

**可编辑内置模块**：`BuiltinDefinition.editable` + `defaultCode`。「推荐应用」是唯一的例子：不写代码时走 React 卡片，写了 HTML/CSS/JS 就整块换成用户版本（`ModuleBody` 里 `editable && hasCustomCode` 分支，**但必须套 `PopupShell`**，见 P-137）；`updateHomeModule()` 按 `isEditableBuiltin()` 放行这三栏；`ensureHomeModules()` 只给**空**的字段补出厂代码，用户写过的一律不动。编辑页有「填回出厂代码」。

**导入文件**：`POST /api/admin/modules/import`（`lib/home/import-html.ts`）按扩展名分栏，HTML 里的 `<style>` / `<script>`（无 `src`）自动搬到对应栏；各栏 32KB。**只解析不落库**，保存仍走原来的 PATCH，写入路径只有一条。

**编辑器预览**：模块编辑页右栏直接服务端预渲染 `HomeModuleRenderer`（真实数据、与前台同一实现）。浮层模块在编辑器里走 `.home-popup.is-preview`（相对定位、无动画）—— 那条规则原先只覆盖 `.home-float.is-preview` 与 `.home-editor__preview`，现在由 `.module-editor__preview` 也覆盖。

写模块代码的完整说明（可用变量、类名、13 个坑、自检清单）在 [module-html-guide.md](module-html-guide.md)。

数据查询：文章继续只走 `lib/posts/query.ts` 的 `publishedWhere()`；瞬间走 `listHomeMoments()`。`lib/home/data.ts` 按当前启用的模块与积木决定查什么，关掉的模块不打数据库。**瞬间模块与文章卡片的穿插卡共用同一份取数**：`collectSources()` 取两边 `limit` 的较大值，`data.listing.moments` 与 `data.moments` 指向同一批瞬间 —— 两处各查一次会打两次库、还可能查出不同顺序。

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

**首页管理 `/admin/home`**：左栏可调首页外观、选中模块的开关、当前视口的位置/宽高与配置（可重置该视口大小）；右栏是**设计视口真尺寸**的画框（电脑 1440×900 / 手机 390×844，CSS `zoom` 缩放适配窗口，`适应 / 100% / 75% / 50%`），可拖动、可改宽高。不是 iframe（站点 `X-Frame-Options: DENY`）。

2026-10-06 重写（详见 [home-layout-editor-spec.md](home-layout-editor-spec.md)、坑见 P-161～P-166）：

- **预览 = 前台**：画布渲染 `.home-grid[data-vp]` + `buildHomeAreas()`（`lib/home/grid-model.ts`）出来的**同一份** area/cell 模型，类名与 CSS 变量逐字一致；不再改 `--grid-max`、不再套内边距、不再自己算高度。手机画框靠 `[data-vp="mobile"]` 那组选择器吃到完整手机档（含模块**内部**的手机版式，见 `responsive-layout-spec.md`）。
- **编辑辅助不占尺寸**：名称手柄 / 选中描边 / 宽高手柄 / 落点提示都是格子内 `position: absolute; inset: 0` 的 `.home-editor__chrome`（`pointer-events: none`，只有手柄自己收事件）。
- **覆盖层与页脚运行时间不进格点流**：画布把它们分别画在 `.home-editor__floats`（画框内的覆盖层槽位）与 `.home-editor__footer-band`（画框底部的页脚带），与前台同一套判定。
- **落点四件事**：三选一的落点（`并入同格 / 放进某行空列 / 新起一行`）、明确的插入前后与同格位置、统一的占位尺寸、**冻结几何快照**（按下那一刻量一次，拖动中概不重算）→ 不会「落点反复切换」。贴住某一格上下沿 12px 内算「插到这一行之前/之后」——两个行带之间只有 16px，不给容差就点不中（P-164 的姊妹问题）。
- **手机档只做纵向插入**：手机里 area 是 `display: contents`，同格 = 同一 grid 区域 = 互相压住，所以手机落点只产出新行带。
- **边缘自动滚动**：指针进入画框上下沿 64px 内按距离比例每帧滚动（指针不动也继续），每帧用最后一次指针位置重算落点；松手 / Esc / 离开边缘立即停。pointer capture 在**画布**上（P-043）。
- **高度模式**：左栏「自适应 / 固定」二选一（0 = 自适应），电脑与手机各记各的；拖动排序**只改位置**，不动高度（P-139 的口径）。
- **栏位（侧面 / 固定）**：每一格可以选「侧面」（钉在视口里跟随滚动，同格一起钉）或「固定」（随页面滚）。存在模块 `config.pin`（`auto` 缺省 = 窄的同格堆叠当侧面），跟格点一起保存。
  - **硬规则：只有「这些列里最后一格」才允许贴** —— 贴住的格子停在视口里不动，下面还占着同样列的格子会一路滚上来压在它身上（P-168，实测 86×121 / 288×128 的重叠）。被挡住时编辑界面会给原因 + 一个「把下面这一列的模块并进来」的动作；真正的侧面栏就是把这些格子收进同一格。
  - 手机档一律不启用侧面（屏太窄，钉住只会挤在一起）。
- **保存闭环**：`PUT /api/admin/home/layout` 的 item 带 `sort`（同格顺序），保存后用返回值回写本地 —— 保存前后、刷新前后同一份布局。

**模块管理 `/admin/modules`**：列表 + 新建（选模板）/ 编辑。内置模块只能改 `config` 与名称，不能删、不能改 key、不能加代码；**例外是「推荐应用」**（`editable`）：它开放代码与基本样式，但结构（key / 系统标记）仍然不给动。可编辑内置模块的写入闸门在 `lib/home/layout.ts` 的 `isEditableBuiltin()`。

编辑器（`components/admin/ModuleEditor.tsx`）：左栏 = 名称 / 基本样式 / 积木 / 覆盖层开关（浮层与 CSS 作用域开关）；右栏 = 「导入文件」+ HTML/CSS/JS 三栏 + 「填回出厂代码」+ **前台真实观感的预览**（服务端预渲染 `HomeModuleRenderer`，含真实文章/瞬间数据）。

## 10. API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET / PUT | `/api/admin/home/layout` | 读写全部格点（PUT 整表替换，zod 校验） |
| GET / POST | `/api/admin/modules` | 目录列表 / 新建 custom（可带模板的初值：代码、config、初始格点） |
| GET / PATCH / DELETE | `/api/admin/modules/[id]` | 详情 / 修改 / 删除（内置 409，仍在启用中 409）。**可编辑内置模块**（推荐应用）也接受 `html/css/js` |
| POST | `/api/admin/modules/import` | 导入文件 → 三栏内容（只解析不落库） |

写成功统一调 `revalidatePublicContent()` 刷新 `/`。

## 11. 以后改首页的流程

1. 先在 `/admin/modules` 建（选模板）或改模块；
2. 往模块里加积木或代码，或者只调「基本样式」；
3. 最后在 `/admin/home` 入格。

写模块代码前先看 [module-html-guide.md](module-html-guide.md)。**禁止再往 `page.tsx` 堆一次性 JSX**（P-035）。
