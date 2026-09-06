# Spec：双视口自适应布局（容器决定内容）

- 日期：2026-08-30
- 提案人：AI
- 状态：已实施
- 相关红线：复用优先、首页只走模块（P-035）、格点 CSS 变量（P-036）、禁止行跨越（P-037）、布局不进 Setting KV（P-004）

## 1. 目标

模块盒子先定宽高，内部按容器重排；电脑/手机两套几何、其它配置共用。同一套断点接到内页侧栏与瞬间二级页。横屏手机仍走手机套。

## 2. 设计方案

标准视口：电脑 1440×900（16:10）、手机 390×844（约 9:19.5）。高度 `hPct` 为该视口设计高度的百分数，`0` 表示 hug。真机 `--h-unit: clamp(7px, 1dvh, 11px)`。后台画框用 `1cqh`。

走手机套：`(max-width: 959px), ((hover: none) and (max-height: 540px))`。实现见 `lib/layout/viewport.ts`，CSS 必须与此条件一致。

首页格点：`HomePlacement` 桌面 `col/colSpan/row/hPct` + 手机 `mobileCol/mobileColSpan/mobileRow/mobileHPct`。桌面继续 `toAreas()` 同格堆叠；手机 area `display: contents`，格子用 `--m-cell-*` 定位。格子必须自己 `position: relative; z-index`（P-054），不写 inline `grid-column`。

内页无独立格点：`.layout` 走手机套时侧栏下沉到正文下方，不再 1200px 隐藏。瞬间页单张 `contain` 但高度上限走 `--h-unit`。

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
