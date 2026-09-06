# Spec：瞬间首页模块、二级缩略图与宫格展开

- 日期：2026-08-30
- 提案人：AI
- 状态：已实施
- 相关红线：复用优先、首页只走模块（P-035）、存储可插拔、面板优先、二级图不上 COS（P-049 / P-051）

## 1. 目标

- 首页用内置「瞬间」模块替换原推荐文章格点；推荐模块保留在目录里，默认关闭。
- 模块左侧是可见瞬间的开头文案（打字机入场 + 轻漂浮 + 悬停高亮）；右侧是二级缩略图瀑布预览。
- 每张图在一级 WebP 之外再生成**仅本地**的二级 WebP（默认长边 320px），媒体库可一键重生且不改文件名。
- 瞬间页按朋友圈规则：单张完整显示；多张方图；先展开挤开再点原图。灯箱按图片自适应居中。

## 2. 设计方案

### 2.1 二级缩略图

- 路径：`images/thumbs2/{hh}/{hash}.webp`，hash 仍是原图 SHA-256，重生只覆盖字节。
- 只写 `LocalDriver`，禁止 COS。访客 URL 永远 `/api/uploads/images/thumbs2/...?px={thumb2MaxPx}`。
- **不写入** `Moment.images` JSON。按原图 key 解析 hash 后拼路径；本地没有文件则回退一级 thumb。
- Setting `thumb2MaxPx`：默认 320，范围 128–640。后台设置 + 媒体库「重新生成二级缩略图」。

### 2.2 首页模块

- 第 10 个 builtin（当时）：`moments`。默认格点 `row2 / col7 / span6`（原 recommend）。后续又补了第 11 个 `uptime`。
- `ensureHomeModules` 首次补建 `moments` 时把 `recommend.enabled` 置 false（只一次）。
- 新装：`recommend.defaultEnabled = false`。
- 数据：`listHomeMoments(limit)`，无点赞/评论。左侧能放下几行展示几行；右侧从图池随机抽取并装箱。
- 高度由当前视口 `hPct` 锁死（桌面默认 37，手机 36），内部按容器重排。宽格子左文约 2/3、右瀑布约 1/3；窄格子（`@container home-mod (max-width: 360px)`）上下约 45%+55%。缺二级图时当场补生成，不回退成一级大图除非原图也找不到。
- 动效只在前台首页播放；`prefers-reduced-motion` 与后台画布预览保持静态。

### 2.3 瀑布装箱

- 全横：一排一张。
- 全竖：两列交错。
- 混合：横图通栏，竖图成对两列，落单占一列。
- 只取能填满右侧 1/3 可视高度的张数；不够则循环；没有图则只留左侧。

### 2.4 瞬间宫格

- 1 张：原比例 `contain`，高度上限 `min(50dvh, calc(var(--h-unit) * 50))`，单击进灯箱。
- 2–9 张：方图 `cover`（4 张 2×2，2 张两列，其余三列）。单击展开（其余挤到侧栏），再点已展开的那张进灯箱。
- 后台排序格：多张仍方图可拖；单张改为原比例。
- 灯箱全屏透明底；舞台按原图像素，transform 缩放到视口；滚轮 / 双指捏合放大，放大后拖动，缩回适配倍率回正中。同一页内原图 blob 缓存，关闭后再开不重新下载。
- 瞬间页评论栏默认收起，点「评论 n」展开；不改文章页 / 留言板。

## 3. 影响面分析

- 涉及模块：`lib/storage/media-keys`、`lib/upload/handle`、`lib/uploads/thumbs`、`lib/settings`、`lib/home/*`、`lib/moments/*`、`components/home/modules`、`components/moment`、`Lightbox`、后台设置/媒体库。
- 新增配置：`thumb2MaxPx`（默认值 / zod / SettingsForm / 生成与重生读取）。
- 不破坏红线：不改 `page.tsx`；不进 COS；不新增依赖；SQL 仍走 Prisma。
- 无 Prisma 表迁移。`Upload.variants.thumb2` 为 JSON 增量。

## 4. 输入输出边界

- `POST /api/admin/uploads/thumbs2/regenerate`：删全部 `images/thumbs2/` 后按当前 `thumb2MaxPx` 重建。
- 瞬间 JSON 仍为 `{key, thumb, width, height}`。

## 5. 实施步骤

1. media-keys / 上传生成 / Setting。
2. 重生 API + 媒体库按钮 + 删除/限额。
3. builtin moments + 默认关 recommend + MomentsModule。
4. MomentGrid 展开 + Lightbox 居中 + 后台单张完整。
5. 文档同步与 Windows 浏览器验收。

## 6. 验收标准

- 首页瞬间在欢迎卡右侧；`/admin/home` 里推荐为关闭。
- 打字机只播一次；悬停右移 + 淡蓝描边；瀑布下移且横竖混排整齐。
- 改 `thumb2MaxPx` 后重生：首页/瞬间不因文件名 404。
- [x] 1 张竖图完整但不超过约半屏；多张先方面再展开；原图在视口正中。
- COS 桶内不应出现 `images/thumbs2/`。

## 7. 审批

- [x] 用户已批准（计划稿）
- [x] 实施完成
- [x] 文档已同步
