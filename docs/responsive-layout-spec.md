# Spec：双视口自适应布局（容器决定内容）

- 日期：2026-08-30
- 提案人：AI
- 状态：已实施
- 相关红线：复用优先、首页只走模块（P-035）、格点 CSS 变量（P-036）、禁止行跨越（P-037）、布局不进 Setting KV（P-004）

## 1. 目标

模块盒子先定宽高，内部按容器重排；电脑/手机两套几何、其它配置共用。同一套断点接到内页侧栏与瞬间二级页。横屏手机仍走手机套。

## 2. 设计方案

标准视口：电脑 1440×900（16:10）、手机 390×844（约 9:19.5）。

**模块高度按像素读**（2026-10-02 起，见 [pitfalls P-139](pitfalls.md)）：`hPct` / `mobileHPct` **0 = 自适应**（随内容），其余就是**像素高度**；`lib/layout/viewport.ts` 的 `moduleHeightCss()` 直接产出 CSS 长度（`380px` / `auto`）写进 `--cell-h` / `--m-cell-h`，不再有 `dvh` 换算（旧的 `--h-unit` 已删除）。用户可调范围 0–1200px（`H_PCT_MAX`）。

**Banner 例外**：首页大图的高度**不属于 `hPct`** —— 它由自己的 `config.height` 预设（`full` 100vh / `large` 70vh / `medium` 420px）决定，格点高度固定是 `0`（自适应，格子跟着 banner 走）。自适应分支里不要写 banner 的 `height`（`100%` / `auto` 两种写法都会把它压坏，见 P-139），只有格子被手动配成固定高度时才用 `.home-grid__cell--banner.is-hfixed .home-banner { height: 100% }` 接管。

固定高度的格子要**按视口分别标记**（`is-hfixed` / `is-m-hfixed`），并把高度一路送到内容：`.home-grid__cell.is-hfixed > * { height: 100% }`。矮格子的兜底是**容器查询** `@container home-mod (max-height: …)`，容器就是格子本身（`container-type: size` 只在固定高度那一支声明，自适应那一支是 `inline-size`，因此 `max-height` 查询不会命中）。

走手机套：`(max-width: 959px), ((hover: none) and (max-height: 540px))`。实现见 `lib/layout/viewport.ts`，CSS 必须与此条件一致。

**后台画框（2026-10-06 起）**：`/admin/home` 的画框就是**设计视口真尺寸**（电脑 1440×900 / 手机 390×844），用 CSS `zoom` 缩放适配窗口，滚动条按设计 px 模拟（隐藏真滚动条 + `padding-right: 15px`），所以内容宽度恒等于「设计视口宽 − 15」——前台 1440 宽窗口下的真实内容宽。三条硬规则：

1. **`data-vp` 必须吃到完整的一档**：后台窗口通常是电脑宽，`@media` 不会命中，所以手机画框靠 `.home-grid[data-vp="mobile"]` 那组选择器生效；**模块内部**的手机版式（`.post-card` / `.home-moment*` / `.moment-grid` / `.dash-chip*`）同样要复刻一份（P-127 的口径，改一边必须改另一边）。
2. **画框要装回前台的基础排版**：后台字号是 14px，不挡掉会让预览里所有继承字号的模块都比前台小一号；`rem` 按 `html` 算，别去改根字号（P-163）。
3. **Banner 的视口高度走 `--vh-unit`**：`:root` 里是 `1vh`，画框里换成「设计视口高 ÷ 100」，否则 `100vh` 用的是后台窗口高，预览比前台高一截。

画布另有两处**只影响编辑**、不影响几何的约定：画框里关掉 `position: sticky`（否则冻结的落点模型会跟着滚动漂，P-165），后台自己的组件规则要排除画框（P-161）。

**侧面栏目与手机**：`.home-grid__area.is-sticky`（钉住跟随滚动）在走手机套时一律 `position: static` —— 手机屏太窄，钉住只会和下面的内容挤在一起；后台手机画框同款（`[data-vp="mobile"]`）。哪一格允许钉由 `lib/home/grid-model.ts` 的 `resolvePinnable()` 按列判定（P-168）。

首页格点：`HomePlacement` 桌面 `col/colSpan/row/hPct` + 手机 `mobileCol/mobileColSpan/mobileRow/mobileHPct`。桌面继续 `toAreas()` 同格堆叠；手机 area `display: contents`，格子用 `--m-cell-*` 定位。格子必须自己 `position: relative; z-index`（P-054），不写 inline `grid-column`。

内页无独立格点：`.layout` 走手机套时侧栏下沉到正文下方，不再 1200px 隐藏。瞬间页单张 `contain`，高度上限走 `--h-unit`（**注意**：那是瞬间二级页自己的图片高度上限，与首页模块高度无关）。

## 3. 影响面分析

- 涉及模块：`lib/layout/*`、`lib/home/*`、`HomeGrid`、`HomeLayoutEditor`、`globals.css`、`SiteShell`/文章详情、`MomentGrid`、Prisma `HomePlacement`
- 新增配置：无 Setting KV
- 不破坏红线：存储/SQL/评论/vendor/单实例不变；不引重型拖拽库
- 不新增依赖

## 4. 输入输出边界

`PUT /api/admin/home/layout` items 增加 `hPct` 与四套 `mobile*`。`rowSpan` 仍恒为 1。

## 5. 实施步骤

1. `lib/layout` + 单测 + 本 Spec
2. schema 迁移与读写
3. 前台格点 CSS 与模块内部
4. 后台设备框
5. 内页与瞬间页
6. 文档同步与浏览器验收

## 6. 验收标准

见计划稿：390 / 1440 / 横屏矮视口；后台两套几何独立；侧栏下沉；瞬间单张不超过约半屏。

## 7. 审批

- [x] 用户已批准（计划稿）
- [x] 实施完成
- [x] 文档已同步
