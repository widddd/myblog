# Spec：首页管理重写（落点模型 / 像素高度 / 预览保真）

- 日期：2026-10-06
- 提案人：AI
- 状态：已实施（见 §7 审批；本文是施工依据，落地证据见 `changelog/pending/HOME-LAYOUT-EDITOR-CHANGELOG.md`）
- 相关红线：AGENTS §2.1 复用优先、§2.1b 首页只走模块、P-035 改首页只走模块、P-036 格点只输出 CSS 变量、P-037 `rowSpan` 恒为 1、P-054 手机拆格叠层、P-070 后台 CSS 只进 `admin.css`、现有模块体系与双视口几何不变
- 关联：`docs/home-modules-spec.md`（两层模型 / §9 后台 UI）、`docs/responsive-layout-spec.md`（双视口几何 / P-139 像素高度）

## 1. 背景与复现

后台 `/admin/home` 的首页管理页报出四组互相牵连的问题：

1. **拖到两个模块中间会「附着 + 重叠」**：落点判断以整格（area）为单位，只区分
   「整格并入（adopt）」与「按指针列号另落一格」两种，无法表达「插到这两个模块之间」；
   预览里被拖模块直接套在某个格子上，位置与最终保存结果不一致。
2. **固定高度与自适应互相打架**：后台画布还在用旧口径 `calc(var(--cell-h) * var(--h-unit))`
   （`--cell-h` 已是 CSS 长度、`--h-unit: 1cqh`），`calc()` 里两个长度相乘是非法值，
   整条声明被丢弃 —— 后台里「固定高度」根本没落到盒子上，更没送到模块内容。
3. **拖动会改高度**：松开时读 `moved.hPct`（桌面高度）写回**当前视口**，
   手机档一次拖动就把手机高度改成了电脑高度。
4. **预览不是前台**：画布把 `--grid-max` 改成 1080px、给模块套了 8px 内边距的
   `.home-editor__preview`、用 `--h-unit` 另算高度；手机画框里 area **没有**
   `display: contents`（媒体查询只覆盖 `.home-grid:not([data-vp])`），
   覆盖层模块（弹出模块 / 推荐应用）与页脚「运行时间」还被当普通格子排进格点流
   —— 预览的几何与前台不是同一套。

## 2. 目标（本次交付的四项）

1. **自定义宽高与自适应不再冲突**：`0 = 自适应`、其余 = 像素高度（口径不变）；
   固定高度一路送到模块内容；自适应模块的真实高度参与行带高度；电脑/手机各存各的高度，
   拖动只改位置不改高度；改宽度、切高度模式、重置大小后布局都正确。
2. **重做拖拽排序与插入**：可以插到两个模块之间、插到开头/末尾、跨行、以及同格堆叠的任意位置；
   `插入前后` 与 `并入同格` 是两种明确落点，有清楚的指示；预览 = 松手结果 = 保存刷新结果；
   占位尺寸用目标位置的真实内容尺寸；取消拖动还原原布局；鼠标与触屏都可用。
3. **拖动时边缘自动滚动**：贴近预览可见区上/下沿持续滚动，指针不动也继续；
   滚动后重新算落点；用真实滚动容器；松手/取消/离开边缘立即停止；pointer capture 留在画布上（P-043）。
4. **预览真实反映前台**：与前台共用同一套模块渲染与布局计算；电脑/手机各用各自的设计视口；
   内容宽度、间距、固定/自适应高度、同格堆叠、Banner 特殊规则全部对齐；
   编辑辅助层不占模块内容尺寸；配置改完预览及时更新；覆盖层与页脚运行时间不进格点流。

## 3. 方案

### 3.1 共用格点模型（唯一事实源）

新增 `main/src/lib/home/grid-model.ts`（纯函数，client 可用）：

- `homeGridItems(items, { appMode, preview })`：**唯一**的「谁进格点流」过滤器 ——
  一次摘掉 `uptime`（页脚画）、`isFloatingModule()`（`HomeFloat` 画）、`isModuleHidden()`（App 里不渲染）。
  前台与后台画布都必须过它，避免再出现「覆盖层/运行时间被当普通格子」。
- `buildHomeAreas(items, { bleedOf })`：输出 area/cell 的**类名与 CSS 变量**（`toAreas` 分组 +
  `areaStyle` + `moduleBoxStyle` + `is-hfixed` / `is-m-hfixed` / `is-stack` / `is-sticky` / `is-bleed`），
  并为每个格子输出测量用的 `data-cell`（`row:col:span`）/ `data-cell-module`。
  前台 `HomeGrid` 与后台画布都渲染这份模型 ⇒ 几何必然一致。

### 3.2 落点模型（`main/src/lib/home/drop.ts`）

**不再以整格为落点单位**，落点是三选一的显式结构：

| kind | 含义 | 结果 |
|---|---|---|
| `stack` | 并入某个已有格子的堆叠，落在第 `index` 位（`index` 由指针与各格子中线的相对位置决定） | 采用该格的 `col` / `colSpan`，插入其后 `sort` |
| `column` | 放进某一行的空列区段（指针在格子左右空档里） | 保留自己的 `colSpan`，`col` 收进 12 列 |
| `row` | 新起一行带，插到第 `row` 行之前 | 该行及以后整段下移一行 |

判定顺序（`resolveDropTarget(model, pointer, dragged)`，`model` 是**按下时冻结**的几何快照）：

1. 指针同时命中某格的横纵范围 → `stack`，`index` 由「有多少个格子的中线在指针上方」得出
   （同格中间插入 = 两个邻居之间）；
2. 没命中格子但在某一行带的纵向范围内 → 该行空列区段 `column`；若与同行其它格冲突，
   退成**横向最近**那一格的 `stack`（不再让 `toAreas` 把谁整体推下去）；
3. 在行与行之间、最上或最下 → `row`（插到下一行带之前；低于全部则追加到最后）。

`planDrop(entries, moduleId, target)` 输出**落定后的 entries**：
行插入先整体下移 → 放好被拖模块 → 重排该格堆叠顺序 → 按文档序重新编号 `sort` →
`normalizeRows()` 收紧行号（消掉空洞，避免 CSS Grid 空轨道把间距撑成两倍）。
预览、落定、保存、刷新都吃同一份 entries ⇒ 三者一致。

**手机档是「纵向插入」**：手机里 `area` 是 `display: contents`、同格 = 同一 grid 区域 = 互相压住，
所以手机落点只产出 `row`（新起一行），不产出 `stack`/`column`；`listMode` 走「按格子中线找插入位」。

### 3.3 后台画布 = 前台格点 + 编辑覆盖层

- 画布渲染 `.home-grid[data-vp="desktop|mobile"]` + §3.1 的**同一份** area/cell 模型，
  内容仍是服务端预渲染的 `HomeModuleRenderer`（`preview`）ReactNode。
- 画框是**设计视口真尺寸**（电脑 1440×900 / 手机 390×844），用 CSS `zoom` 缩放适配窗口
  （`适应 / 100% / 75% / 50%`），不再改 `--grid-max`、不再加内边距、不再另算高度。
- 编辑辅助（名称手柄、选中描边、宽高手柄、落点指示）是格子内 `position: absolute; inset: 0`
  的 `.home-editor__chrome`（`pointer-events: none`，只有手柄本身可点）——**不占模块内容尺寸**。
- 覆盖层模块在画布里画成画框内的覆盖层（`.home-editor__floats`），
  页脚运行时间画在画框底部的 `.home-editor__footer-band`，两者都**不进格点流**。
- Banner 在画框里按设计视口取高度（`--canvas-vh` = 设计视口高度）：
  `100vh` 在画框里是后台窗口高，必须换成设计视口高，否则预览比前台高一截。

### 3.4 拖动过程

- 按下：`setPointerCapture` 在**画布**（P-043），冻结落点几何快照（area / cell / 12 列轨道，
  坐标换算到滚动容器内容系），记录被拖模块与其自身高度。
- 移动：只用**冻结快照**算落点（不随预览位移而抖动）；预览 = `planDrop` 的结果；
  被拖模块在预览里按目标盒子渲染真实内容（占位尺寸准确）；
  跟随指针的是轻量「拖动中」小卡（不是整块模块的副本，避免看成"附着"）。
- 边缘自动滚动：指针进入画布的 `EDGE = 64px` 带内时按距离比例 `requestAnimationFrame` 滚动，
  每帧用最后一次指针位置重算落点；指针移出边缘带立即停。
- 松手：把结果 `patchEntry` 到 entries（**只写当前视口的 box**，高度原样保留）；取消（Esc / `pointercancel`）直接丢弃。

### 3.5 保存链路

- PUT `/api/admin/home/layout` 的 items **新增 `sort`**（可选，整数）；
  服务端按 `(row, col, sort, payloadOrder)` 归一后写 `sort`（不传时退回旧的 payload 顺序口径）。
- 保存成功后用返回的格点**回写本地 entries**（`saveLayout` 的响应），保证本地与库一致、
  刷新前后同一个布局。

## 4. 影响面分析

- 涉及模块（查 `docs/ai/module.md`）：
  - 新增：`lib/home/grid-model.ts`、`lib/home/drop.ts`、`components/admin/HomeLayoutCanvas.tsx`
  - 改：`components/home/HomeGrid.tsx`、`components/admin/HomeLayoutEditor.tsx`、
    `lib/home/types.ts`、`lib/home/grid.ts`、`lib/home/layout.ts`、`lib/validation/home.ts`、
    `lib/layout/viewport.ts`、`app/admin/admin.css`、`app/globals.css`
  - 测试：新增 `lib/home/drop.test.ts`、`lib/home/grid-model.test.ts`；
    更新 `lib/home/layout-model.test.ts`、`lib/layout/viewport.test.ts`；`package.json` 的 `test` 清单登记
  - 脚本：新增 `scripts/home-layout-check.mjs`（交互式浏览器验证）
- 新增配置/接口字段：`PUT /api/admin/home/layout` 的 item 增加可选 `sort`（同一写入路径，无新 Setting KV）
- 是否破坏红线：不引依赖、不动 vendor、不碰存储/SQL/评论链路；`rowSpan` 仍恒为 1；格点仍只输出 CSS 变量
- 是否新增数据模型：否（无迁移）
- 需更新的文档：本文件、`home-modules-spec.md`、`responsive-layout-spec.md`、`pitfalls.md`（新坑）、
  `ai/module.md`（新文件）、`api-contracts.md`（`sort` 字段）、`README.md`（用户可见）、`AGENTS.md`（§3/§6）
- 高成本操作：无（无迁移 / 无部署 / 无批量删除；浏览器验证在开发库上做，前后快照格点表并还原）

## 5. 实施步骤

1. 纯模型层（`grid-model.ts` / `drop.ts`）+ 单测
2. `HomeGrid` 切到共用模型
3. 后台画布重写（真格点 + 覆盖层 + 手柄 + 边缘滚动 + 取消）
4. CSS（`admin.css` 编辑层、`globals.css` 的 `data-vp="mobile"` 覆盖与画布视口高度）
5. 保存链路（`sort` + 回写）
6. `tsc --noEmit` / `pnpm test` / `check-admin-classes` / 浏览器实测 / 文档同步

## 6. 验收标准

见任务书四条 + 现场验证清单：相册模块插到两模块之间不重叠；同格中间插入 / 跨行 / 首尾移动准确；
固定高度与自适应混排、改宽后不重叠；电脑与手机高度互不影响；拖住边缘不动预览持续滚动且落点正确；
保存刷新后位置与顺序一致；相同视口下后台预览与前台对应模块几何一致。

## 7. 审批

- [x] 用户已批准（任务书即为验收口径）
- [x] 实施完成
- [x] 文档已同步
