# Spec：瞬间首页模块、二级缩略图与宫格展开

- 日期：2026-08-30
- 提案人：AI
- 状态：已实施
- 相关红线：复用优先、首页只走模块（P-035）、存储可插拔、面板优先、二级图不上 COS（P-049 / P-051）
- 后续追加 1：**瞬间可见范围**（全局可见期 + 可见范围组，2026-09）——规则见 [moment-visibility-spec.md](moment-visibility-spec.md)，踩坑见 P-094 / P-095 / P-096
- 后续追加 2：**文章流里的瞬间穿插卡 + 手机档版式修正**（2026-10）——见 §2.6，踩坑见 P-127 / P-128 / P-130 / P-132

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

### 2.5 瞬间可见范围（2026-09 追加，详见 [moment-visibility-spec.md](moment-visibility-spec.md)）

- 首页瞬间模块**只显示未过期的瞬间**：`listHomeMoments()` 与瞬间页、点赞、评论写入共用同一个可见期 where（`lib/moments/visibility.ts` 的 `buildMomentVisibilityFilter()`）。
- 生效天数 = **min(Setting `momentVisibleDays`, 该瞬间所用可见范围组的天数)**，0 = 不限制；全局是天花板，分组只能更短。
- 默认 `momentVisibleDays = 0`：即"全局永久公开 + 无分组"→ 该函数返回 `undefined`（不带条件），首页瞬间输出与本功能之前完全一致。
- 本模块的其它行为（打字机、二级缩略图瀑布、高度由 `hPct` 锁死）不变；过期瞬间不会进图池，也不会留下占位格。

### 2.6 文章流里的瞬间穿插卡（2026-10 追加）

**目标**：首页文章大卡之间每隔 N 篇插一张瞬间卡，一张卡展示一条瞬间；点多张图的那张卡直接去瞬间页并高亮那一条。

- **模块归属**：配置挂在「文章卡片」（`posts`）模块上，不新建内置模块 —— 它改的就是文章卡片自己那条列表。可配置项：`momentLimit`（0–8，一页最多穿插几个瞬间；0 = 不插，默认 3）。
- **取数**：与瞬间模块共用同一份 `listHomeMoments()` 结果（见 `lib/home/data.ts` 的 `collectSources()`）—— 只要开启穿插就按首页瞬间池上限（12 条）取，不按「最多几条」取，见下面的排序口径。
- **排序与穿插规则**（`lib/home/interleave.ts` 的 `interleaveByDate()`，纯函数 + 单测）：
  - 瞬间与文章**按时间混排**：发布时刻更早的排在前面（不再用「每 N 篇插一条」的固定间隔）；
  - **比本页最后一篇文章还早的瞬间不属于本页**（它该出现在后面的分页里），所以 `momentLimit` 只是上限，本页放得下几条就几条；瞬间池按上限取 12 条，正好够第 2、3 页用上更早的瞬间；
  - 同一时刻（极少见）先文章后瞬间，顺序稳定；缺时间/坏时间按最早处理，不会挤到最前。
- **卡片内容**（`components/home/modules/MomentCard.tsx`）：贴「瞬间」小标 + 相对时间（与文章卡同口径 `formatRelativeDate()`）+ 正文（最多 3 行，手机 2 行）。
  - **宽度**：电脑端先占**文章卡的一半**（实测 896 宽的列里 = 448），内容顶得开才长到满宽；手机档一律满宽。用 `width: fit-content; min-width: 50%; max-width: 100%; justify-self: start`（**不能写 `min(50%, max-content)`**，见 P-131）。
  - **尺寸口径：图片跟着自己的比例走，卡片不预设大画框**。
    - 多图：一行排开、**每张占满固定的行高**（`--home-moment-media-h`，桌面 132px / 手机 118px），宽度按原图比例算（`aspect-ratio: var(--moment-w)/var(--moment-h)`），
      单张宽度上限 55%（手机 62%）—— 极宽的手机截屏（2:1 以上）用 `object-fit: cover` 从中间裁，不裁的话宽度会顶满整行、卡片立刻变成一张巨幅横幅；图之间不换行、不裁成统一的方框。
    - 单图：`contain` 整图看得见（不裁），宽度也按比例从高度上限推（`max-width: calc(--home-moment-cover-h * 比例)`），桌面高 168px / 手机 156px。
    - 没有存宽高的图按 4:3 兜底，避免出现一列细高条。
  - 图片全部走**二级缩略图**（`image.thumb2Src`；缺文件时 query 层已回退一级，404 由 `Thumb2Image` 再回退一次）。
  - 超过 3 张的部分不做展开：容器底部渐隐 + 第三张右下角「+N」。
  - 整卡可点 → `/moments#moment-{id}`；落地后由 `components/moment/MomentHighlight.tsx` 平滑滚到那条并高亮约 3 秒（`moment-flash` 关键帧，2.4 秒淡出）。`prefers-reduced-motion` 下动效被压成 0.01ms，高亮改为静态描边，不会点了没反馈。
  - 高亮不能只靠 `hashchange`：hash 没变时它根本不触发，重复点同一张卡就没反馈 —— 额外挂一层锚点 click 委托。
  - 二图/三图的显示尺寸都在 L2 缩略图（默认 `thumb2MaxPx = 320`）之内或仅约 5% 放大，不会出现"小图硬撑大格"的糊；要更锐就把 Setting `thumb2MaxPx` 提到 480 再到媒体库点一次「重新生成二级缩略图」。

### 2.7 手机档版式修正（2026-10 追加）

原有的两处手机档问题，一起修掉：

- **瞬间模块（首页 `moments`）**：版式原来只由 `@container home-mod (max-width: 360px)` 决定，而手机格子宽度随设备与用户设的列跨度浮动（390px 设备实测约 340–355px，命中不了），结果多数手机上仍是「左文右图各挤一半」——文案被裁成一行半、右侧瀑布只剩一列。
  改成与「走手机套」同一个断点（`max-width: 959px` + `hover:none + max-height:540px`）钉死，选择器同时覆盖真机（`.home-grid:not([data-vp])`）与后台手机画框（`.home-grid[data-vp="mobile"]`）；容器查询整块删除，避免被「按视口」和「按格子宽度」两套几何打架（P-126）。
  文案区另给 `min-height: calc(var(--dash-line-height) * 3)`：格子高度只有 32–36vh，不给底线就只显示一行半。
- **瞬间宫格（瞬间页）**：`.moment-grid` 的列数来自内联 `--moment-cols`，手机档 400px 宽的卡片里三列方图每张只剩 ~80px。手机档改为两列（`repeat(2, minmax(0, 1fr))`，`4/5` 竖图），单张仍走原比例；展开态 `.is-expanded` 不受影响（P-127）。

### 2.8 视频与「不发文字」（2026-10 追加，详见 [moment-video-spec.md](moment-video-spec.md)）

- **媒体可以只有一种**：`content` 允许空串，规则是「文字或媒体至少有一个」（`lib/moments/compose-rules.ts` 的 `momentContentError()`，POST / PATCH / 发布区共用）。
- **媒体项加 `kind`**：`images` JSON 里多 `kind: "image" | "video"`（缺省 = 图片，旧行零改动）、视频带 `mime`/`duration`、**没有 `thumb`**。判定唯一走 `lib/moments/types.ts` 的 `momentMediaKind()`。
- **一条瞬间最多 1 个视频**（用户决策 2026-10-11）。
- **渲染**：`/moments`、首页瞬间卡、首页瞬间模块统一用 `MomentVideoPlayer` —— **首帧预览 + 自绘播放器**（播放/暂停、进度、音量，按钮与滑杆触控高度 ≥44px，不进图片灯箱）；几何仍按 `width/height`，没存就按 4:3。**手机竖屏视频播放入口铺满当前视口，横屏仍居中卡片；播放器右上角有全屏按钮，Fullscreen API 不可用时退化为视口铺满。** 站点**不装 ffmpeg、不生成视频封面文件**（首帧由浏览器 seek 显示）——压缩只在 Android 客户端做（见 Spec §2.5 / §10）。
- 通知文案：只发媒体时 `lib/feed/updates.ts` 的 `momentNotifyText()` 给「分享了一张图片 / 一个视频 / 发了一段语音」，不留空行。

### 2.9 语音（2026-10-11 追加，详见 [moment-audio-spec.md](moment-audio-spec.md)）

- **媒体项加第三种 `kind`**：`kind: "image" | "video" | "audio"`（缺省仍是图片，旧行零改动）；语音带 `mime`（`audio/webm` / `audio/mp4`…）、`duration`，外加可选的 `peaks`（0–100 的整数数组，最多 48 个；`lib/moments/peaks.ts` 归一化，拿不到就用按媒体 key 的**确定性图案**兜底，保证 RSC 与浏览器水合一致）。判定仍只走 `momentMediaKind()`。
- **一条瞬间最多 5 条语音、单条 ≤ 5 分钟**（语音**不占**图片/视频那 9 个名额；`Moment.images` 数组的 zod 上限因此是 14）。
- **两边都能录**：网页点麦克风弹**置顶长条卡片**（实时波形 / 计时 / 停止即上传，`MediaRecorder` 编码成 WebM/Opus）；App 里改成宿主**原生录音小窗**（弹入动画 / 停止后拖两端裁剪 + 试听，产物 MPEG_4/AAC）。站点不转码、不装 ffmpeg。
- **展示分区**：`splitMomentMedia()` 把媒体分成「图片/视频（九宫格）」与「语音（独立播放行）」两块 —— 语音是"听"的媒体，塞进按比例排的格子里没有意义；首页瞬间卡上语音只画**不可点**的「波形 + 时长」小标（整卡是链接）。首页瞬间瀑布模块**跳过**语音（那是一面图墙）。
- **媒体库**：语音和图片/视频一样进出媒体库，但**分开放** —— 媒体库多一个类型分区 `?kind=image|video|audio`，音频卡片可直接播。
- 通知文案：只发媒体（或混排里有语音）时说「发了一段语音」。

## 3. 影响面分析

- 涉及模块：`lib/storage/media-keys`、`lib/upload/handle`、`lib/uploads/thumbs`、`lib/settings`、`lib/home/*`、`lib/moments/*`、`components/home/modules`、`components/moment`、`Lightbox`、后台设置/媒体库。
- 新增配置：`thumb2MaxPx`（默认值 / zod / SettingsForm / 生成与重生读取）。
- 不破坏红线：不改 `page.tsx`；不进 COS；不新增依赖；SQL 仍走 Prisma。
- 无 Prisma 表迁移。`Upload.variants.thumb2` 为 JSON 增量。
- 后续追加（瞬间可见范围）：新增表 `MomentVisibilityGroup` 与 `Moment.visibilityGroupId`（迁移 `20260927160000_moment_visibility_group`），并给 Setting 加 `momentVisibleDays`；首页瞬间模块的取数多了一层可见期 where，见 §2.5。
- 后续追加（穿插卡，2026-10）：`HomeModuleConfig` 加 `momentLimit` / `momentEvery`（zod 同步，未知键仍会被丢）；`HomeMoment` 增 `createdAt` 字段（卡片要显示相对时间）；新增 `lib/home/interleave.ts`、`components/home/modules/MomentCard.tsx`、`components/common/Thumb2Image.tsx`、`components/moment/MomentHighlight.tsx`。**无迁移、无新依赖**。

## 4. 输入输出边界

- `POST /api/admin/uploads/thumbs2/regenerate`：删全部 `images/thumbs2/` 后按当前 `thumb2MaxPx` 重建。
- 瞬间 JSON 仍为 `{key, thumb, width, height}`。
- （2026-10 追加）穿插卡不产生任何新接口：卡片直接读 `listHomeMoments()` 的结果，链接是 `/moments#moment-{id}`（瞬间页已有 `id="moment-{id}"` 锚点 + `scroll-margin-top`）。

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
- （2026-09 追加）全局可见期设 N 天后，首页瞬间模块与瞬间页都只剩 N 天内的瞬间；过期瞬间不进图池、不占格；默认 0 时输出与本功能之前一致 —— 详见 [moment-visibility-spec.md](moment-visibility-spec.md) §6。
- （2026-10 追加，穿插卡）开启后首页文章流里每隔 N 篇出现一张瞬间卡：三张二级缩略图 + 多的部分渐隐与「+N」；点卡片进 `/moments/#moment-N` 并把那一条高亮约 3 秒；`momentLimit=0` 时输出与之前完全一致。
- （2026-10 追加，穿插卡**尺寸与排序**）电脑端卡片占文章列的一半（实测 896 的列里 **448**），手机档满宽（472）；瞬间与文章按时间混排，实测顺序 `M(9/30) → P(置顶) → M(9/29) → P(混色封面) → ……`，比本页最后一篇还早的瞬间不出现在本页。
- （2026-10 追加，穿插卡**尺寸**）五张比例很杂的图（2:1 宽截屏 / 3:4 竖屏 / 1:1 / 16:9 / 2.4:1 超宽）实测：图片条 858×168 时三格分别 `336×168`（2:1，360−24 裁切）、`126×168`（3:4）、`168×168`（1:1）—— 每格宽高比与 `naturalWidth/naturalHeight` **一致**，没有被拉成统一方框或细高条；手机档三格 `236/89/118 × 118`。单图实测：3:4 竖屏 `156×208`（桌面）/ `117×156`（手机），`object-fit: contain` 整图不裁。
- （2026-10 追加，穿插卡）点击链路实测：真实鼠标事件点卡片 → `location.pathname + hash` = `/moments#moment-10`，目标卡进视口且拿到 `moment-card--flash`，2.4 秒内高亮透明度从 0.86 线性衰减到 0，3.2 秒后 class 自动移除。
- （2026-10 追加，手机档）瞬间模块手机档为竖排：文案区高度 126px、可见 3 行（26px/行），瀑布区 130px 且能装下 2 张图，两区不再重叠（实测 `copy.bottom - falls.top` = −10px）；瞬间页 `.moment-grid` 手机档 `grid-template-columns` 实测为两列（215px ×2），页面无横向溢出。
- （2026-10 追加，穿插卡）图片多于 3 张时底部有渐隐层、第三张右下角有「+2」；`thumb2Src` 404 时由 `Thumb2Image` 回退到一级缩略图（一级/L2 都从 `/api/uploads` 直出，实测均 200）。

## 7. 审批

- [x] 用户已批准（计划稿）
- [x] 实施完成
- [x] 文档已同步
