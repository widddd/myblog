# Spec：相册板块、文章图片折叠组、首页相册模块

- 日期：2026-10-03
- 提案人：AI
- 状态：**已实施**（2026-10-03；**相册页版式仍待 demo 定稿**，见 §8；开发库迁移按规矩未执行，命令见 §6 M1）；**2026-10-03 补充口径**：卷组头显示**卷名**（自由文本、日期可写进名字、不强制）；**空卷名 = 这一卷不作为独立分组**，它的照片与散图合成同一个「不属于任何卷」的组、该组**排在最前且组头只显示张数**（见 §3.5）
- 相关红线：复用优先、首页只走模块（P-035）、存储可插拔、面板优先、二级缩略图不上 COS（P-049 / P-051）
- 关联文档：[home-modules-spec.md](home-modules-spec.md)、[moments-home-spec.md](moments-home-spec.md)、[media-layout-spec.md](media-layout-spec.md)、[module-html-guide.md](module-html-guide.md)

## 1. 目标

1. **媒体库能按相册分类**照片：媒体库里给图片归册，也能按相册筛选。
2. **文章正文里的一批图能折叠成一组**：作者显式决定哪几张成组（**组与相册无关**，同一个相册的图在这篇成组、在那篇不成组）。
3. **从文章大图能一步跳到它所属的相册**（不是所有图都有相册）。
4. **相册对外公开**：导航「文章」右侧新增「相册」入口，`/albums` 列表 + `/albums/{slug}` 详情。
5. **首页新增相册模块**：把部分相册照片做成缓慢滚动预览，点图进对应相册。

## 2. 已确认决策（用户答复落地）

| # | 决策 | 落地位置 |
|---|---|---|
| D1 | 相册是**独立顶层页面**，不是首页格点里的板块：`/albums`（列表）+ `/albums/{slug}`（详情）；**`app/page.tsx` 一行不改**（红线 1b）。首页与相册的交集只有两处：导航栏入口、新增的相册模块 | §3.1 / §3.5 / §3.6 |
| D2 | **一张图只能属于一个相册**（`Upload.albumId` 单归属、可空；空 = 未分类） | §3.2 |
| D3 | 图片顺序**走默认**：上传时间倒序（新的在前），不引入排序字段 | §3.2 |
| D4 | 折叠组摘要**显示张数**：「花期 · 2 张」 | §3.4 |
| D5 | 折叠组**默认收起**（不给 `open` 这一类作者开关） | §3.4 |
| D6 | **接受极简版相册页**先上线（能跑、能跳、不难看），版式定稿后单独一轮换皮 | §3.5 / §6 |
| D7 | 相册页版式**接下来写 demo 确定**（demo 不在本轮做） | §8 |
| D8 | 相册里的照片走**三级档位**：网格/滚动预览 = **二级**缩略图 → 展开 = **一级**缩略图 → 点开 = **大图** | §3.3 |
| D9 | 相册只收**图片**（`image/*`）：视频/音频不进相册，归册 UI 与相册页都只对图片开放 | §3.2 |

## 3. 设计方案

### 3.1 对外路由与导航

| 项 | 内容 |
|---|---|
| 导航 | `components/layout/nav-links.ts` 在 `{href:"/posts"}` 之后插 `{ href:"/albums", label:"相册" }`。该数组同时驱动桌面导航与手机抽屉，一处改两处生效 |
| 列表页 | `app/albums/page.tsx`：相册卡网格（封面 + 标题 + N 张）+ `EmptyState`；`publicMetadata({title:"相册", path:"/albums"})` |
| 详情页 | `app/albums/[slug]/page.tsx`：标题/说明 + 图片网格 + 灯箱 + `Pagination`（每页 60）；`enabled=false` 或不存在 → `notFound()`；`dynamic = "force-dynamic"`（与 `/moments` 同口径） |
| 地址冲突 | `lib/pages/directories.ts` 的 `RESERVED_SEGMENTS` 加 `{segment:"albums", decision:"block", reason:"相册页 /albums"}`。**不加 `directories.test.ts` 直接红** —— 这是刻意设计的守卫（框架路由永远优先于静态页 `[dir]/[slug]`） |
| SEO | `app/sitemap.ts` 的 `staticRoutes` 加 `/albums`，并附上每个 `enabled` 相册的 `/albums/{slug}` |

### 3.2 数据模型

```prisma
model Album {
  id          Int      @id @default(autoincrement())
  slug        String   @unique          // /albums/{slug}
  title       String
  description String   @default("")
  coverId     Int?                       // 封面 = 本相册任意一张图
  cover       Upload?  @relation("AlbumCover", fields: [coverId], references: [id], onDelete: SetNull)
  enabled     Boolean  @default(true)    // 关掉：列表不出现、详情 404、灯箱按钮消失
  sort        Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  uploads     Upload[] @relation("AlbumUploads")
}

model Upload {
  // …既有字段不动，追加：
  albumId Int?
  album   Album?  @relation("AlbumUploads", fields: [albumId], references: [id], onDelete: SetNull)
  coverOf Album[] @relation("AlbumCover")
  @@index([albumId])
}
```

- 迁移 `prisma/migrations/<时间戳>_album/migration.sql`：建表 + 唯一索引，`ALTER TABLE "Upload" ADD COLUMN "albumId" INTEGER REFERENCES "Album"("id") ON DELETE SET NULL ON UPDATE CASCADE`。**外键必须内联在 `ADD COLUMN` 上**（SQLite 不支持 `ALTER TABLE … ADD CONSTRAINT`），口径照抄 `20260927160000_moment_visibility_group/migration.sql` 的注释。
- 删除相册**只解绑不删图**（`SetNull`）；删除媒体时它若在当封面，`coverId` 自动置空、相册页回落到第一张。
- 图片顺序：`createdAt desc`（D3）。**不引入排序字段**；将来要导演排序时再加 `AlbumItem(albumId, uploadId, sort)` 并做一次数据迁移。
- 只收图片（D9）：归册写入、相册页查询、首页图池一律限定 `mime.startsWith("image/")`。

### 3.3 三级图片档位（D8）

| 档位 | 物理路径 | 默认最长边 | 存储位置 | 用在哪 |
|---|---|---|---|---|
| **L2 二级** | `images/thumbs2/{hh}/{hash}.webp` | `thumb2MaxPx` = 320（128–640） | **只本地**，禁止上 COS（P-051） | 首页相册模块的滚动预览、相册详情页的网格（未展开） |
| **L1 一级** | `images/thumbs/{hh}/{hash}.webp` | `thumbMaxPx` = 480（128–1280） | 本地 + COS | 相册里「展开」的那一张（放大态）、灯箱加载原图前的占位 |
| **原图** | `images/original/{hh}/{hash}.{ext}` | — | 本地 + COS | 灯箱大图（COS 直连优先，P-119 三级降级） |

- **不需要新的生成流程**：一/二级缩略图是 `Upload` 级别的派生物，与「在不在相册里」无关。L2 是按需生成的（`resolveThumb2Src()` 缺文件当场补，失败回退 L1），前端 `Thumb2Image` 再兜一次 404 回退；媒体库现成的「重新生成缩略图 / 重新生成二级缩略图」两个按钮已覆盖批量重建。
- 相册查询层复用瞬间那套现成口径：`resolvePublicImageUrl()`（原图 / L1）+ `resolveThumb2Src()`（L2，缺文件当场生成、回退 L1），**不新写一套 URL 规则**。
- 硬要求：相册页与首页模块的**渲染路径不得出现原图直链**，原图只在灯箱里按需取。
- 口径提醒：显示尺寸要落在对应档位之内，否则是「小图硬撑大格」的糊（瞬间模块 §2.6 已立过这条判据）。相册展开态用 L1（480）正是为此。

### 3.4 文章内的折叠组（D4 / D5）

**语法**：`<ImageGroup title="花期">` … `</ImageGroup>`（flow JSX、`hasChildren: true`）。无 `title` 时用「图片组」。

**两条链路**：

| 阶段 | 实现 | 说明 |
|---|---|---|
| 转换（sanitize 之前） | `lib/markdown/image-group.ts` 的 `rehypeImageGroups` | `mdxJsxFlowElement name="ImageGroup"` → 一个 **`tagName = "ImageGroup"`**（大写）的元素，`className = post-image-group`，首个子节点是写成文本的 `summary`（`标题 · N 张`）；随后**继续递归**子节点让组内 `<Video />` 也被后续插件处理 |
| 前台渲染 | `components/post/ImageGroupView.tsx`（client） | 由 `compileMDX` 的 **`components.ImageGroup`** 接住；`splitGroup()`（`image-group-split.ts`，配单测）把图片一张一张抽成卡片 |

> ⚠️ **标签名必须大写，别改回 `details`**（P-146）：MDX 只把**大写开头**的名字当组件（查 `components`）；小写标签只有 markdown 自己产出的才查，**由显式 JSX 转出来的会被特意跳过**（`recma-jsx-rewrite` 的 `_mdxExplicitJsx` 分支）。转成小写 `details` 的结果是前台渲染成**原生标签**、组件完全不生效，而且**没有任何报错**。`sanitizeSchema` 相应地放行元素名 `ImageGroup` 与它的 `className`（`details`/`summary` 只留给"组件没接住"的兜底路径）。`image-group.test.ts` 有守卫断言这三件事。

**收起态**：一叠照片——顶张完整显示（按牌堆高度等比缩放），其余各层**往右扇开 22px**、逐层缩 2%、并**正负交替转动 1.5°/3°/4.5°**（`rotate * depth * (depth % 2 ? -1 : 1)`，与 `demo/fold-image` 同款）；每张照片一圈底色描边（`box-shadow`，不改盒模型），叠放时每层的边才读得出来；牌堆坐在视口的平色底上（`--heo-secondbg`，**不放模糊放大背景**——2026-10-03 按用户反馈去掉，`.ig__backdrop` 与配套的 `srcOf`/`activeSrc` 已删除）；**左右滑动**换上面那张（pointer 手势 + `setPointerCapture`，`|dx| ≥ 36px` 才翻页）、**点一下**或键盘 Enter/Space 展开；左侧浮一个「展开 N」胶囊（键盘 ←/→ 也能翻）。
> 扇开量不能省：只做旋转时，底下的卡片与顶张几乎同宽，转出来的角只有几像素、还被 `overflow: hidden` 裁掉，**看上去还是"一张图"**（实测 14px 扇开时右侧只露 18~35px，灰调照片在模糊底色上几乎不可见）。22px + 每张一圈底色描边之后，每层右侧露出 28/41/61px，边界清晰。

**展开态**：**所有照片同时向下滑到自己那一格**（同一时长、无错峰；demo 的结论：错峰会让"一起滑下去"变成"排队往下钻"）。几何模型照搬 `demo/fold-image`——**卡片全部绝对定位，两个状态都用 `top` 表达**，差异交给 CSS 过渡补间（不用 FLIP、不做运行时翻转测量，那套正是 demo 里反复算出"行程 0"的根源）：收起 `top = (牌堆高 - 图高)/2`（视觉居中），展开 `top = Σ前几张高 + i×10px`。时长 `--ig-expand-ms: 340ms` / `--ig-collapse-ms: 280ms`、缓动 `--ig-ease: cubic-bezier(0.33, 0, 0.67, 1)`（三次方），容器高度与每张的 `top`/`transform` 共用同一组值。展开后再点某张进灯箱看原图（灯箱照旧靠 `.post-content` 上的事件委托，展开态**不拦截**点击、收起态 `stopPropagation` 免得误开）。列尾是「收起」按钮，收起后把牌堆滚回视野。

**图片档位**：收起与展开**都是正文图的一级缩略图**（`MdxImage` 的 `displaySrc`），点开才取原图——正文链路里没有二级缩略图，也不需要"展开时换档"。

**交互验收（必须真点，截图看不出来）**：`applyLayout` 是唯一的几何入口，**它的 `useCallback` 依赖必须同时含 `active` 与 `expanded`**——漏了 `expanded` 时点展开只会换 className 与按钮文案，视口内联 `height` 停在牌堆高度、卡片 `top`/`transform` 没重算，看着完全没反应（2026-10-03 实测踩过）。验收口径（CDP 真点，见 pitfalls P-086 的补充）：
1. 收起态：`.ig__viewport` = 牌堆高度；**每层要用 `getBoundingClientRect()` 量出"相对顶张露出的宽度"**（只量 top/transform 不算数——实测每层必须真有可见条带，否则就是"看着还是一张图"）；
2. 点 `.ig__viewport`（牌堆本体）→ 视口高变成整列高度、各张 `top` 变成累加行位、`transform` 清空、按钮文案变「收起」；
3. **逐帧采样（40ms）读视觉位置**：各张 `getBoundingClientRect().top` 必须单调插值（不能一帧到位），容器高度同步增长；**只读内联 `style.top` 会骗人**——它在点击瞬间就跳到终点，过渡补的是计算值；
4. 点 `.ig__pill`（收起）→ 回到 1 的状态，且每张回到叠放位置；
5. 两个入口都要能用：牌堆本体与左侧胶囊。

**插件顺序**：`rehypeImageGroups` → `rehypeAllowVideo` → `rehypeSanitize`。**为什么必须有转换这一步**：`rehype-sanitize` 对未知节点类型返回 `undefined`，未转换的 JSX 会**整棵静默消失、无报错**（P-144）。`sanitizeSchema` 只给 `details`/`summary` 多放行 `className`（与既有 `figure`/`figcaption` 同一先例）。

**其它**：`collectTocItems()` 不再下潜进 `details.post-image-group`（折叠块里的标题进了目录会「点了滚到看不见的地方」）。空组 / 组里没有图片时组件退回原生 `<details open>`，作者至少看得到自己写的标题；用户自己写的普通 `<details>` 也原样放行。样式见 `globals.css` 的 `.ig*` 区块（`SSR 兜底高度 320px`，JS 量好后用内联 height 覆盖）。

**编辑器**（`components/admin/`）：

- `MdxEditorClient.tsx`：注册 `IMAGE_GROUP_DESCRIPTOR = { name:"ImageGroup", kind:"flow", props:[{name:"title",type:"string"}], hasChildren:true, Editor: ImageGroupJsxEditor }`；工具栏在「图片」与「视频」之间插 `InsertImageGroup`。
- `ImageGroupJsxEditor.tsx`（约 60 行，仿 `editor/jsx-editors/GenericJsxEditor`）：外壳「折叠组」+ 行内标题输入 + 嵌套编辑区（`NestedLexicalEditor`）+「删除整组」。需要在 `src/types/mdx-editor.d.ts`（**项目自己的**声明文件，`src/editor/` vendor 树不动）补声明 `NestedLexicalEditor` / `useLexicalNodeRemove`。**降级方案**：直接用已导出的 `GenericJsxEditor`（弹层里填 title），零新增代码但体验差一档。
- `InsertImageGroup.tsx`：对话 = 组标题 + 「从媒体库选图（多选，复用 `MediaLibraryPicker`）/ 本地上传」+「先插入空组」。确认后 `insertJsx$` 发 `{kind:"flow", name:"ImageGroup", props:{title}, children}`，children 为每张图一个 `paragraph → image`；URL 一律走 `editorImageUrl()`（与现有插入路径同一口径，避免 P-118 分叉）；空组给一个空 `paragraph`。
- 媒体库选择器支持**按相册筛选**：让「这次就按相册成组」和「跟相册无关地挑图」两条路都走得通 —— **筛选只是筛选，不会自动成组**。

### 3.5 对外相册页（极简版，D6）

- **列表页**：相册卡 = 封面（L2）+ 标题 + N 张 + 说明；按 `sort`、`createdAt` 排。封面是这本相册的**「一叠照片」**：最多 4 张 L2 整齐叠在**同一个左缘**、第一张在最上面（尺寸从首帧起就是终值），进页面约 1s 后由 `lib/albums/use-pile-spread.ts` 写 `left` / `transform` 触发过渡，后面几张按 `PILE_STAGGER_MS`（70ms）**依次向右抽出**。几何与不变量只在 `lib/albums/pile.ts`（纯函数，配 `pile.test.ts` + `components/album/album-card.test.tsx`）写一遍，**首帧的叠放态由组件按 `pileSpread()` 渲染**（服务端首帧不能出现抽出后的位置）；执行器与首页「相册卡片」模块共用同一个 hook（见 §3.6b）。
- **详情页**：标题 / 说明 + 按卷分组的一叠叠照片（分页 60，`PhotoPile` 是动画引擎）。
- **每一叠的两个方向（2026-10-07 用户口径定稿）**：几何只在 `lib/albums/photo-pile.ts`（纯函数，配 `photo-pile.test.ts`），组件只负责量尺寸 + 写内联样式。

| 视口 | 折叠态 | 点一下 |
|---|---|---|
| **竖屏（`orientation: portrait`）或 ≤720px** | **横向那一套动作的镜像**：往下错 22px/档 + 正负交替转角（**减半**）+ 逐层缩 2%，再叠**确定性打散**（转角 ±0.9°、横移 ±1.2% 宽、微缩 ±0.6%，由照片 `key` 哈希派生）；**竖图限高** `aspect-ratio: 1`（图片 `object-fit: cover`，见 [P-175](../pitfalls.md)） | **一行一张、自上而下**展开 |
| 横屏 / 宽屏 | 同心叠放：顶张 + 往右扇 22px + 逐层缩 2% + 正负交替转角 | **整叠向左滑到最左，各张相对中心向右滑出** → 等高一行（宽按原始比例、行比容器宽就横向滚动、滚轮左右翻阅） |

  方向**只看视口**：与照片是横是竖无关、与这一叠在哪一卷（乃至"不属于任何卷"那一组）无关 —— 竖屏一律竖着堆、竖着展开（2026-10-06 试过"有横图就横版式"，用户当场驳回）。
  **竖图限高原因此**：同一叠里每张按宽铺满，竖图自然高会是横图的 2 倍多（366 宽下 549 vs 244），高低差一倍多加转角就显得"乱七八糟"。
  **打散必须确定性**（照片 key 哈希）：随机数会让 SSR 与客户端不一致、每次重排都跳。
- **分组顺序与组头**（2026-10-03 用户口径，后一条为追加）：**「不属于任何卷」的照片排在最前**，组头**只显示张数**（`N 张`，页面里**不出现「未分类」字样**，只有那个小圆点 + 张数）；有名字的卷按 `sort → id` 跟在后面，组头显示 `volume.title`（**自由文本，日期不强制** —— 想标日期就把日期写进名字，例如「2026-03-28 · 樱花季」）。**空卷名（`title` trim 后为空）= 这一卷不作为独立分组**：读层 `getPublicAlbum()` 不生成 `volumes` 条目，它的照片与散图**合成同一个「不属于任何卷」的组**（所以页面上永远只有一组无名的，不会出现两个同名组、也不会渲染空组头）。**没有自动日期这回事**：卷组头与那一组的组头都不再按照片时间实时算日期（`PublicAlbumVolume.dateText` 与 `volumeDateText()` 已随之删除），`album.dateText`（整册区间）只给相册头图元信息用。**正常路径下空卷名是用户主动造成的**：新建留空仍自动「第 N 卷」（改名清空才等于「并入那一组」）——校验收 `title` 空串（`albumVolumePatchSchema` 只 trim + 限长 60 字，见 §3.9）。
- **验收口径**：`node scripts/pile-detail-check.mjs`（真浏览器、逐叠量）：折叠态按**视觉盒**判档位与"装得下最深那层"，展开动画**按帧判位移**（≥120px 才算"看得见"），横屏那支另判同心叠放不回归。
- **表现层隔离（硬约束，为了 demo 定稿后只换皮不重做）**：

| 层 | 文件 | demo 定稿后允许改吗 |
|---|---|---|
| 取数与 URL 解析 | `lib/albums/query.ts`、`types.ts`、`path.ts`、`slug.ts` | ❌ 不改 |
| 路由与分页壳 | `app/albums/page.tsx`、`app/albums/[slug]/page.tsx` | ⚠️ 只调整布局骨架 |
| 纯表现 | `components/album/*`、`globals.css` 的 `.album-*` 区块 | ✅ 随便改 |

- 提示文案：相册详情页写一句「**相册是对外公开的**：放进相册的图片在公开相册页可见，即使它只在密码文章里用过。」（不阻断，只告知——这是真实且容易被忽略的隐私后果。）
- 缓存：`/albums` 与 `/albums/{slug}` 走 `cachedPublic` + 新增的 `PUBLIC_CACHE_TAGS.albums`；**写入侧必须 `revalidateTag(albums, { expire: 0 })` 立即过期**（相册页依赖跨表的 `Upload.albumId`，`revalidateTag(tag,"max")` 是 SWR、第一次请求仍是旧值，见 P-089）。写入侧共三处：相册 CRUD、媒体归册、删除媒体。

### 3.6 首页相册模块（缓慢滚动预览）

**第 14 个内置模块**：`key/slug = "albums"`、名字「相册」。

| 项 | 内容 |
|---|---|
| 默认状态 | `defaultEnabled: false` —— 老站的首页排版不该被升级悄悄改掉（与 `recommend` / `popup` / `app-promo` 同规格）。`ensureHomeModules()` 会在下次启动/初始化时幂等补建这条记录，你在 `/admin/home` 打开它、拖到想要的位置 |
| 默认格点 | 桌面 `row 4 / col 1 / colSpan 12 / hPct 260`；手机 `mobileRow 11 / colSpan 12 / mobileHPct 200`（`hPct` 现口径是**像素**、0 = 自适应，见 P-139） |
| 取数 | `lib/albums/query.ts` 的 `listHomeAlbumImages({ albumSlugs, limit })`：只取 `enabled` 相册 → 只取 `image/*` → **多个相册轮流取（round-robin）、每册最多 4 张**，总数不超过 `limit`，保证「部分相册照片」是混排的；每张带 `albumSlug` / `albumTitle`。**不套缓存**（与 `listHomeMoments()` 同一口径：每次渲染一查，新增/删除相册立刻反映，少一类失效 bug） |
| 渲染 | 单行横向轨道：图片高度 = 容器高度（`height: 100%`），宽度按各自原始比例（`aspect-ratio: var(--album-w)/var(--album-h)`，缺宽高按 4:3 兜底）；内容**复制两份 + `translateX(-50%)` 无缝循环**（与瞬间模块的 `moment-falls`、欢迎卡 `rowup-scroll` 同一套手法） |
| 动效 | 纯 `transform` 动画；`prefers-reduced-motion` 与后台画布预览一律静态（关掉 `is-rolling`，与 `MomentsModule` 的 `staticMotion` 同口径） |
| 点击 | 每张图 → `/albums/{albumSlug}`；标题 → `/albums` |
| 空池 | 前台返回 `null`（不占格）；后台预览显示「还没有相册图片」占位（与 `uptime` 模块的 preview 占位同口径） |
| 配置项 | `heading`（标题，默认「相册」）、`albumSlugs`（多行文本，每行一个相册地址名，**留空 = 全部启用相册**）、`limit`（最多几张，6–24，默认 12）、`speedSeconds`（滚动一轮秒数，20–180，默认 60） |

**配套同步点（漏一处就是「配了不生效」，P-004）**：

1. `lib/home/types.ts`：`BUILTIN_MODULE_KEYS` 加 `"albums"`；`HomeModuleConfig` 加 `albumSlugs?: string[]`、`speedSeconds?: number`
2. `lib/home/builtins.ts`：`BUILTIN_DEFINITIONS` 加定义（含 `fields`：`heading` / `albumSlugs`(lines) / `limit` / `speedSeconds`）
3. `lib/validation/home.ts` 的 `configSchema`：加 `albumSlugs: z.array(z.string().max(60)).max(20)`、`speedSeconds: z.number().int().min(20).max(180)` —— 该 schema 是 `.partial()` 白名单，**没登记的键会被静默丢掉**
4. `lib/home/data.ts`：`HomeData` 加 `albumImages: HomeAlbumImage[]`；`collectSources()` 加 `case "albums"`（关掉的模块不打数据库）
5. `components/home/HomeModuleRenderer.tsx`：`ModuleBody` 的 switch 加 `case "albums"`
6. `components/home/modules/AlbumsModule.tsx`（新）+ `app/globals.css` 的 `.home-albums*` 区块

### 3.6b 首页「相册卡片」模块（第 15 个内置模块）

`key/slug = "album-cards"`、名字「相册卡片」。与 §3.6 的滚动照片条**是两件事**：
那一条回答「相册里有什么照片」，这一块回答「有哪几本相册」。

| 项 | 内容 |
|---|---|
| 默认状态 | `defaultEnabled: false`（同 §3.6：老站排版不被升级改动）。`ensureHomeModules()` 幂等补建这条记录，在 `/admin/home` 打开即可 |
| 默认格点 | **与瞬间模块同出厂规格**：桌面 `row 4 / col 7 / colSpan 6 / hPct 380`；手机 `mobileRow 13 / colSpan 12 / mobileHPct 340`（用户口径「默认就和瞬间模块一样大」；这两个数字要与 `moments` 的定义保持一致） |
| 取数 | `lib/albums/query.ts` 的 `listHomeAlbumCards({ albumSlugs, limit })`：直接裁 `listPublicAlbums()` 的前 N 本（筛选与截断都在内存里做）—— 吃的是**同一份 `cachedPublic` 缓存**，写入侧本来就会 `revalidateTag(albums, { expire: 0 })` 立即过期，不新增失效路径 |
| 渲染 | 横向滑动的一行卡片（`scroll-snap` 对齐）：卡片宽 = 行高 × 卡片宽高比；封面是这本相册的「一叠」（最多 4 张二级缩略图）+ 标题 + `N 张（· M 卷）· 日期区间`，整卡进 `/albums/{slug}` |
| 抽出动作 | **与 `/albums` 列表卡同一个动作、同一个执行器**：几何在 `lib/albums/pile.ts` 写一遍（`pileSpread()` 给出首帧/终帧/层次/错峰），执行在 `lib/albums/use-pile-spread.ts` 写一遍（两处共用同一个 hook）。第 0 张是**整叠那一张**（`left 0`、`width = pileStackWidth()`、不倾斜、不延迟），第 i 张 `left = i × step`、`width = 整叠宽 × shrink^i`（首页这版 `shrink = 0.86`：卡片窄，后面几张一起收窄收矮）。⚠️ **整叠宽必须 < 100%**：第 0 张铺满画框就会把后面几张整张盖住，"抽"成了看不见的动作（2026-10-05 逐帧实测过）。约 1s 后依次向右抽出，时长/缓动与列表卡同值；`prefers-reduced-motion` 与后台画布预览直接给终态（不补间，位置取自组件写的 `--pile-left` / `--pile-rotate`） |
| 动画验证口径 | 只能用 `getBoundingClientRect()` **逐帧采样**（读内联 `style.left` 是声明值、触发瞬间就跳到终点）：① 首帧四层的相对左缘相同（叠放态，不是抽出态）；② 第 0 张全程只有一个位置；③ 其余各张的位置是**多段插值**（不是一帧到位）；④ 各张开始时间按 70ms 递增、终态按 `step` 递增；⑤ `prefers-reduced-motion` 下首帧即终态、无补间。脚本 `main/scripts/pile-frames.mjs`（`pnpm pile:frames`，见 [pitfalls P-160](pitfalls.md)） |
| 叠高怎么来 | 照片按各自长宽比铺开 → **叠高 = 封面区宽度 ÷ 宽高比**。封面区宽度来自 flex（卡片宽 = 行高 × 卡片宽高比），CSS 里推不出来 → 按既有做法在 layout effect 里**量一次**封面区宽度，直写 `--album-vh`（P-152 同款）。⚠️ 踩过的两个坑：`height: calc(100% / var(--ar))` 一类公式会把整叠压小或溢出；给叠加 `max-height: 100%` 会参与尺寸解析、再压一次 |
| 空集 | 前台只留标题入口（与滚动条那版同口径），后台画布给「还没有相册……」占位 |
| 配置项 | `heading`（默认「相册」）、`albumSlugs`（多行，留空 = 全部启用相册；与 §3.6 共用同一套语义与同步点）、`limit`（最多摆几本，2–8，默认 4；`lib/home/albums.ts` 的 `normalizeAlbumCardLimit()` 夹取） |

**同步点**（全是既有键，`lib/validation/home.ts` 的 `configSchema` 不需要加字段）：
`lib/home/types.ts`（`BUILTIN_MODULE_KEYS`）、`lib/home/builtins.ts`（定义 + `fields`）、
`lib/home/data.ts`（`needs.albumCards` / `albumCardLimit` + `loadHomeData` 取数）、
`components/home/HomeModuleRenderer.tsx`（`case "album-cards"`）、
`lib/albums/query.ts`（`listHomeAlbumCards()`）、`components/home/modules/AlbumCardsModule.tsx`、
`app/globals.css` 的 `.home-album-cards*` 区块。

### 3.7 后台：相册管理 + 媒体库分类

| 层 | 文件 | 内容 |
|---|---|---|
| 纯逻辑 | `lib/albums/path.ts` | `albumHref(slug)`、`ALBUMS_PATH`（无 prisma，client 可引） |
| 纯逻辑 | `lib/albums/slug.ts` | `albumSlugFromTitle()`（`slugify` + 形态校验，复用 `pages/directories.ts` 导出的单段地址正则，避免第二套地址规则）、`uniqueAlbumSlug()`（撞名加 `-2` / `-3`）；**不查保留段**（`/albums/{slug}` 与顶层路由不同命名空间） |
| 类型 | `lib/albums/types.ts` | `PublicAlbum`、`AlbumImage`、`HomeAlbumImage`、`AdminAlbumView` |
| 写入 | `lib/albums/admin.ts` | `listAdminAlbums / getAdminAlbum / createAlbum / updateAlbum / deleteAlbum / assignUploads / removeUploads / setAlbumCover`；slug 冲突 409 |
| 读取 | `lib/albums/query.ts` | `listPublicAlbums()`、`getPublicAlbum(slug)`（`cachedPublic` + albums tag；**只有卷名非空的卷进 `volumes`，其余照片（含空卷名的卷）都进 `loose` 那一组**）、`listHomeAlbumImages()`（不缓存） |
| 校验 | `lib/validation/album.ts` | `albumWriteSchema`、`albumAssignSchema`（`uploadIds` 上限 500）、`uploadAlbumPatchSchema`（`albumId: number \| null`，`null` = 显式移出） |
| API | `api/admin/albums/route.ts`（GET/POST）、`api/admin/albums/[id]/route.ts`（PATCH/DELETE）、`api/admin/albums/[id]/uploads/route.ts`（POST 加入 / DELETE 移出）、`api/admin/uploads/[id]` 加 **PATCH**（改相册归属） | 全走 `requireAdmin()` + zod + `jsonData` / `handleAdminError` + `runtime="nodejs"`；`api/admin/uploads` 加 `?album=<id\|none>` 筛选 |
| 媒体库 | `lib/uploads/admin.ts`（`listAdminUploads` 加 album 筛选、`setUploadAlbum`）、`toUploadResult()` 带出 `album`、`lib/client/upload.ts` 的 `AdminUploadResult` 加 `album?: {id,title,slug} \| null` | 只对 `kind === "image"` 开放归册（D9）。**2026-10 追加**：`?kind=` 支持逗号分隔多值（`mimePrefixesForKinds()`），给瞬间配图的媒体库选择器同时选图片+视频用；`MediaLibraryPicker` 的 `kind` 扩成 `kinds: AdminUploadKind[]`。**App 里的上传入口**（`UploadsToolbar` 的 `appMode`）多两项下拉：相册视图（`accept` = 图片+视频，走 App 自有相册、视频按 [moment-video-spec.md](moment-video-spec.md) §2.5 自动压缩）/ 文件视图（含音频，走系统选择器）；浏览器里保持原样 |
| 后台 UI | `app/admin/(protected)/albums/page.tsx`、`albums/[id]/page.tsx`、`components/admin/AlbumManager.tsx`、`AlbumMediaPanel.tsx`、`UploadAlbumSelect.tsx` | 列表 + 新建/改名/开关/删除；详情页 = 基本信息 + 封面选择 + 「从媒体库添加」（复用 `MediaLibraryPicker` 多选）+ 已入册网格（移出 / 设为封面）；媒体库卡片加相册下拉与筛选 |
| 侧栏 | `components/admin/AdminNav.tsx` | 「资源」组在「媒体库」后加 `{href:"/admin/albums", label:"相册", icon: CameraIcon}`（已确认 `@radix-ui/react-icons` 有 `CameraIcon`）+ `MORE` 数组；手机底栏 `TABS` 保持 4 项不动 |
| 样式 | `app/admin/admin.css` | 新类名只进这里（P-070），写完跑 `node scripts/check-admin-classes.mjs` |

### 3.8 灯箱跳相册

| 改动点 | 内容 |
|---|---|
| `lib/markdown/mdx.tsx` | `loadMediaUrls()` 的 `prisma.upload.findMany` 加 `album: { select: { slug, title, enabled } }`；`createMdxImage` 在 `<img>` 上输出 `data-lightbox-album="/albums/{slug}"`、`data-lightbox-album-title`（仅 `enabled` 时输出） |
| `components/common/Lightbox.tsx` | `SelectedImage` 加 `album?: {href,title}`；`selectedFromImage()` 读 `dataset.lightboxAlbum / lightboxAlbumTitle`；controlled 模式加 `openAlbumHref` / `openAlbumTitle`（给瞬间以后复用）；`<dialog>` 里新增 `<Link className="lightbox__album">` 放在关闭按钮左侧，点击先 `close()` 再交给 next 导航，带 `aria-label` |
| `app/globals.css` | `.lightbox__album` 放在 `.lightbox__close` 旁边（约 3159 行区块），沿用同一套毛玻璃/描边 token，手机档不与关闭按钮重叠 |

数据来源说明：服务端 MDX 渲染那次 Upload 查询**顺带**带出相册（零额外请求），且 `data-*` 只由 React 组件在 sanitize **之后**注入 —— 正文源码里手写的同名属性会被剥掉，不对作者开这个口子。

### 3.9 上传与逐张编辑里的分卷

| 改动点 | 内容 |
|---|---|
| 选项形状 | `lib/albums/types.ts` 的 `AlbumOption = { id, title, volumes: { id, title }[] }`（+ `AlbumVolumeOption`）：媒体库页用 `listAdminAlbums()` + **每个相册一次** `listAlbumVolumes()` 拼好，服务端只查一次，上传弹窗与每张卡片共用同一个形状 |
| 上传预览 | `UploadPreviewDialog` 的相册下拉（`AdminSelect`）下面挂**卷下拉**（`components/admin/UploadVolumeSelect.tsx`，弹窗与媒体库卡片共用同一个组件，一样不用原生 `<select>`）：选项 =「暂不分类」（默认，= `volumeId: null`）+ 所选相册的卷；**只在选中相册后出现**；**换相册 = 卷重置为「暂不分类」**；选「不加入相册」时卷必为 null。相册还没建卷时退化成只有「暂不分类」一项——不报错、不挡上传 |
| 请求链路 | `UploadAdminOptions.volumeId` → multipart `volumeId` → `handleUpload()` 在**写盘之前**用 `resolveUploadVolume()` 校验（没带相册 400 `VOLUME_WITHOUT_ALBUM` / 卷不存在 404 / 不属于该相册 400 `VOLUME_ALBUM_MISMATCH`），写库时与 `albumId` 一起落；**同内容去重命中已有记录时也一起套用**（没带卷写 null，不会把旧相册的卷留在图上） |
| 逐张编辑 | 媒体库卡片的 `UploadAlbumSelect` 两个下拉（`相册` / `卷`，**仅图片、选完相册才显示卷**）都走 `components/admin/AdminSelect.tsx`；`PATCH /api/admin/uploads/[id]` 收 `{albumId?, volumeId?}`（至少一个）：`setUploadAlbum()` **换相册（含移出）时把卷一并清零**，`setUploadVolume()` 守「卷属于该相册」，响应是改完的 `UploadResult`。批量入卷（相册详情页的「放入卷」）与媒体库的「按相册看」筛选也走同一个组件 |
| 回归守卫 | `src/lib/validation/album.test.ts`：`uploadAlbumPatchSchema` 的契约（单独改卷 / 一起改 / 空 PATCH 与非法 id 一律拒） |

**为什么这些下拉是自绘的**：站点在 Android 客户端里跑（`<select>` 走系统选择器，观感割裂），后台这一族一律用 `components/admin/AdminSelect.tsx`（`<button aria-haspopup="listbox">` + `role="listbox"` 面板），**一个原生 `<select>` 都不留**。

**卷名是自由文本**（2026-10-03 口径确认）：不强制日期、不拆成「日期 + 名字」两个字段 —— 想标日期就把日期写进卷名（`title`，上限 60 字），组头原样显示（见 §3.5）。后台新建卷的输入框占位就写着「自由填写，日期也可以写进去」；**新建时留空**服务端仍给「第 N 卷」兜底（`createAlbumVolume()`，友好默认：空着不填 = 我懒得起名），而**改名可以清空**（`albumVolumePatchSchema` 的 `title` 只 trim + 限长，不再有 `.min(1)`，空串 400 那套已取消）—— 清空 = **这一卷不作为独立分组**，读层把它的照片并入「不属于任何卷」那一组（排在最前、组头只显示张数，见 §3.5）；卷本身与照片的 `volumeId` 归属都不动，想恢复成独立分组再填个名字即可。后台卷列表里空名显示成灰色「未命名（= 未分类）」，不留白。

**面板是浮层而不是内联展开**（2026-10 改）：早先是「`<button>` + 内联展开列表」，理由是它生在 `AdminDialog` 面板（`.admin-dialog__panel` 是 `overflow: auto`）里；代价是展开时把下面的内容顶下去。现在面板 `createPortal` 到 `document.body`、`position: fixed` 按触发按钮的 rect 定位（下方不够就向上翻、按可用空间夹 `max-height`），**不受任何祖先 overflow 与层叠上下文影响，也不挤压布局**。Esc 的收口从「React 合成事件里 stopPropagation」搬到 **document 的 capture 阶段**：弹窗的 Esc 监听也挂在 document 的冒泡上，谁先注册不定，冒泡里拦不住（实测会连弹窗一起关掉）。

### 3.10 后台相册编辑页：按卷分组 + 拖拽换卷

- 相册详情页（`/admin/albums/{id}`）的照片**按卷分组**：每一卷一个组标头 + 该卷照片；**卷名为空（= 不属于任何卷）的与散图合并成最前那一组**，顺序与前台一致。分组标头与空态在网格里整行铺开（`grid-column: 1 / -1`）。
- **拖拽换卷（触屏 + 鼠标）**：鼠标拖整张卡；触屏抓卡片右上角把手（`touch-action: none`，否则会被页面滚动吃掉）。Pointer Events + `setPointerCapture`，落点用 `elementFromPoint().closest('[data-volume-drop]')` 判定，拖动中有跟手气泡与目标组高亮。
- **两条路共用一个写入函数**：拖拽与批量条都走 `AlbumEditor.tsx` 的 `moveToVolume(ids, volumeId | null)` → `POST/DELETE /api/admin/albums/{id}/volume-uploads`（`volumeId = null` 即「移出卷」）→ `router.refresh()`。批量条的「勾选 → 选卷 → 放入卷 / 移出卷」**保留不变**。
- 两个必须记住的坑：卡片里是 `<img>`，要 `draggable={false}`（**浏览器原生图片拖拽会打断 pointer 事件流**，`pointercancel` 会让整次拖拽静默失效）；把手是绝对定位，卡片必须 `position: relative`。

## 4. 影响面分析

- **涉及模块**（`docs/ai/module.md` 路径）：`lib/albums/*`(新)、`lib/markdown/{mdx,image-group,sanitize,toc}`、`lib/home/{types,builtins,data,layout}`、`lib/uploads/admin`、`lib/upload/handle`、`lib/client/upload`、`lib/storage/*`（只读复用）、`lib/cache/public`、`lib/admin/{revalidate,data-clear}`、`lib/data-clear/coverage`、`lib/pages/directories`、`lib/validation/{album,home,upload}`、`components/{layout,common,home,admin,album}`、`app/{albums,admin,api,sitemap}`。
- **新增配置字段（三处同步清单）**：`HomeModuleConfig.albumSlugs` / `speedSeconds` →（1）`lib/home/types.ts`、（2）`lib/validation/home.ts` 的 `configSchema`、（3）`lib/home/builtins.ts` 的 `fields`。**不新增任何 Setting**（复用现成的 `thumbMaxPx` / `thumb2MaxPx`）。
- **是否破坏红线（AGENTS §2）**：无。评论链路不动；正文仍过 sanitize（只是多放行 `details` / `summary` 的 `className`，与既有 `figure` / `figcaption` 同规格）；SQL 全走 Prisma；文件读写仍只经 `StorageDriver`；`src/editor/` vendor 树不动（只加项目自己的 `src/types/mdx-editor.d.ts` 声明）；`app/page.tsx` 不动（首页只走模块）。
- **是否新增依赖**：**无**。`<details>` 是原生标签，滚动用纯 CSS `transform` 动画，两个转换函数是项目内纯函数。内存与包体积零增量。
- **新增 Prisma 表 1 张**（`Album`）+ 1 列（`Upload.albumId`）→ 迁移 1 个；同步 `docs/data-models.md`。
- **数据清理三方一致性**（P-103）：`lib/data-clear/coverage.ts` 的 `DATA_CLEAR_DELETE_ORDER` 加 `"Album"`（放 `StaticPage` 与 `Upload` 之间），`lib/admin/data-clear.ts` 补 `tx.album.deleteMany()` + `DataClearResult.deleted.albums` + 日志 payload。`coverage.test.ts` 逐项比对，漏一处 `pnpm test` 就红。
- **生产迁移**：`scripts/boot.cjs` 会自动 `migrate deploy`；**带新模型的版本上机后必须补跑一次 `pnpm prisma generate`**（P-124），否则报「模型不存在」。

## 5. 输入输出边界

**API 契约变化**（同步 `docs/api-contracts.md`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/albums` | 相册列表（含每个相册的图片数与封面） |
| POST | `/api/admin/albums` | 建相册；slug 冲突 409 `SLUG_TAKEN` |
| PATCH | `/api/admin/albums/[id]` | 改标题 / slug / 说明 / 开关 / 排序 / 封面 |
| DELETE | `/api/admin/albums/[id]` | 删相册（图片解绑保留） |
| POST | `/api/admin/albums/[id]/uploads` | `{uploadIds: number[]}` 批量归册（只接受图片） |
| DELETE | `/api/admin/albums/[id]/uploads` | `{uploadIds: number[]}` 批量移出 |
| PATCH | `/api/admin/uploads/[id]` | `{albumId?: number \| null, volumeId?: number \| null}` 单张改归属（至少给一个；`null` = 移出相册 / 放回未分类；**换相册时卷清零**，见 §3.9） |
| GET | `/api/admin/uploads?album=<id\|none>` | 媒体库按相册筛选（`none` = 未分类） |

**数据模型变化**：见 §3.2。**公开面只增不减**：`/albums`、`/albums/{slug}` 是新增公开路由；相册详情页新增图片网格；文章页 `<img>` 多两个 `data-lightbox-album*` 属性。

## 6. 实施步骤

| 步 | 内容 | 依赖 / 验收信号 |
|---|---|---|
| **M0（先做，30 分钟）** | 在开发库手写一段含 `<ImageGroup title="花期">` + 2 张图的文章，验四件事：① 编辑器能打开、不报 `No JSX descriptor found for ImageGroup`；② 富文本 ↔ 源码切换、存盘重开，组与组内图片不丢；③ 前台渲染出 `<details>` 且摘要带张数；④ 光标点进组内，工具栏「图片」插进的是组里 | 四条全过才按本 Spec 继续；任一条不过 → 只保留「源码模式写组」的降级路径，**先停下来找用户确认**，并把发现写进 `docs/pitfalls.md` |
| **M1** | schema + 迁移 + coverage/data-clear + `lib/albums/*` + validation + API + 后台相册页 + 媒体库归册与筛选 | `/admin/albums` 能建相册；媒体库能归册并按相册筛选；`pnpm test` 绿 |
| **M2** | 对外相册页（极简版）+ 导航 + 保留段 + sitemap | 导航第 2 项是「相册」；列表/详情可访问；关掉的相册 404；`directories.test.ts` 绿 |
| **M3** | 首页相册模块（内置定义 + 图池查询 + `AlbumsModule` + CSS + `collectSources` + configSchema 三处同步） | 打开模块后首页出现缓慢横向滚动的相册预览，点图进对应相册；关掉时首页输出与之前完全一致 |
| **M4** | 文章折叠组（`rehypeImageGroups` + sanitize 白名单 + TOC 规则 + 组样式 + 描述符 / 编辑器 / 工具栏） | M0 四条 + `image-group.test.ts` 通过 |
| **M5** | 灯箱跳相册（带出 album + `data-*` + Lightbox 按钮 + CSS） | 有相册的图出现按钮并跳对页面；无相册的图没有按钮 |
| **M6** | 文档同步 + `pnpm lint` + `pnpm shot` + `changelog/pending/` | §7 逐项打勾 |
| **demo 轮**（独立，可与 M2–M6 并行） | 在 `/albums` 路由上**直接迭代**版式，每轮 `pnpm shot` 出桌面/手机图并量尺寸，用户挑选 | 定稿 |
| **M7** | 按 demo 定稿替换表现层（只动 `components/album/*` + `globals.css`） | 数据层 / 路由 / API 零改动 |

**demo 不在 `main/` 里新增原型文件**：仓库的 `demo/` 是后台参照稿、AGENTS 定为只读不动；且任何落在 `main/` 的本机产物都必须同时进 `.gitignore` 和 `DENIED_ROOTS`，否则会被打进更新包（P-120 实测过 2.51MB 垃圾随包发走）。在真路由上迭代还能顺带验证真实长宽比的图片排布。

## 7. 验收标准

**自动化**

- [ ] `pnpm test` 全绿，含新增/修改：`lib/markdown/image-group.test.ts`（组 → `details` + 摘要文本与张数、无 title 的默认文案、组内 `<Video />` 仍被处理、非 ImageGroup 的 JSX 不受影响）、`lib/albums/slug.test.ts`（中英文标题、非法字符、撞名加后缀）、`lib/markdown/sanitize.test.tsx` 与 `lib/markdown/toc.test.ts` 各补一条、`lib/validation/album.test.ts`（**卷改名收空串 / 纯空白 trim 成空串 / 限长与空 PATCH 仍拒**）。
- [ ] **新测试文件必须加进 `package.json` 的 `test` 脚本**——那是一条手写的文件列表，不加进去等于没写。
- [ ] `pnpm lint` 无新增错误；`node scripts/check-admin-classes.mjs` 无缺失类名。

**手工（`pnpm dev`）**

- [ ] `/admin/albums` 建「2026 樱花」；媒体库上传 3 张，2 张归入该相册、1 张留「未分类」；按相册筛选能过滤。
- [ ] 新建文章 → 工具栏「折叠组」→ 标题「花期」+ 选 2 张图 → 正文出现 `<ImageGroup title="花期">`；保存。
- [ ] 前台文章页：摘要「花期 · 2 张」，**默认收起**；展开后图片正常；点大图 → 灯箱出现「相册 · 2026 樱花」→ 点击进 `/albums/sakura`；未归册的图**没有**这个按钮。
- [ ] 导航「文章」右边是「相册」→ `/albums` 列表 → 进详情。
- [ ] **空卷名口径**：后台把某一卷改名**清空**并保存（**不再 400**）→ 前台 `/albums/{slug}` 里它的照片出现在**最前那一组**（组头只有 `N 张`，整页**不出现「未分类」字样**）、页面上**只有一组**无名的、有名字的卷按 `sort → id` 在其后；再改回名字 → 恢复成独立分组。
- [ ] 相册 `enabled` 关掉 → 列表不出现、详情 404、灯箱按钮消失。
- [ ] 首页相册模块：打开后出现缓慢横向滚动预览，图按各自比例、**无缝循环不跳帧**；点图进对应相册；`speedSeconds` 改了生效；`albumSlugs` 留空 = 全部启用相册；`prefers-reduced-motion` 下静态、后台画布预览静态。
- [ ] **三档位核对**（D8）：首页模块与相册网格的 `img` 指向 `/api/uploads/images/thumbs2/…`（L2，缺文件时 `Thumb2Image` 回退 L1）；展开态切到 `images/thumbs/…`（L1）；灯箱取原图（COS 直连优先）。**渲染路径不得出现原图直链**。
- [ ] COS 桶里不应出现 `images/thumbs2/`（P-051）。
- [ ] 编辑器往返：富文本 ↔ 源码切换、保存后重开，组与图不丢；组内点「图片」插进的是组里。
- [ ] 数据清理（勾「内容」）→ 清完 `Album` 0 行、`Upload` 0 行。
- [ ] `pnpm shot` 量 1280 / 1024 / 768 / 390 四个宽度：导航 7 项不横向溢出；相册网格与灯箱按钮不重叠；首页模块滚动轨道不漏底。
- [ ] 生产流程：更新包 → `migrate deploy`（自动）→ **`pnpm prisma generate`**（P-124）。

## 8. 待定项（demo 轮要定的，写在合同里）

| # | 待定 | 目前已落地的默认 |
|---|---|---|
| O1 | 相册列表 / 详情页的**版式**（宫格 / 瀑布 / 大图流、是否显示说明与张数、首图大小） | 宫格 + L2 + 灯箱（§3.5） |
| O2 | 首页相册模块的**轨道观感**：一行还是两行、横滚还是上滚、速度与图片间距 | 单行横向、60s 一轮、按图比例定宽（§3.6） |
| O3 | 相册详情页「展开」的**交互细节**（点缩略图先放大 vs 直接进灯箱） | 点一次撑大（L2→L1），再点进灯箱 |
| O4 | 封面规则除了「手动选一张」还要不要自动策略 | 手动可选；不选 = 第一张 |

## 9. 明确不做

- 一图多册（D2 已定单归属）；相册内显式排序；相册标签；EXIF / 拍摄时间 / 地图。
- 视频 / 音频进相册（D9）。
- 瞬间页与首页瞬间卡的图片显示相册按钮（`Lightbox` 的 controlled props 已留口子，接数据即可，属后续可选项）。
- 相册模块做成「可编辑内置模块」（`editable` + 出厂 HTML）—— 只做 React 版。
- Android 客户端改动（导航是网页导航，客户端无需改）。

## 10. 已知风险与回退

| 风险 | 回退 / 处理 |
|---|---|
| M0 的四条不成立（编辑器对 `<ImageGroup>` 往返有损） | 只保留「源码模式写组」；工具栏插入仍可用；**先停下来找用户确认**，不硬撑 |
| 未转换的 JSX 被 sanitize 整棵丢掉（症状：正文里组整段消失、无报错） | `image-group.test.ts` 直接断言转换结果 |
| 折叠块里的标题进目录 → 点了滚到看不见的地方 | `collectTocItems` 不下潜进组（配单测） |
| 相册是对外公开的：只在密码文章里用过的图，放进相册后会公开可用 | 详情页写一句提示；不阻断（用户显式动作） |
| 跨表数据进 `cachedPublic` 后不刷新 | 写入侧统一 `revalidateTag(albums, { expire: 0 })`（P-089） |
| 首页模块把图池做大（带宽 / 首屏） | 只取 L2（本地、单张 ~20KB 量级）；`limit` 默认 12、上限 24 |
| 老站首页排版被升级悄悄改掉 | 模块 `defaultEnabled: false`，由用户在 `/admin/home` 打开 |
| 手写嵌套组（源码里 `<ImageGroup>` 套 `<ImageGroup>`）往返可能有损 | 不支持嵌套（编辑器插不出嵌套）；登记为已知限制 |
| 生产库缺 `Album` 表 / 客户端不认识模型 | 迁移由 boot 自动跑；上机后补 `pnpm prisma generate`（P-124） |

## 11. 审批

- [x] 用户已批准（2026-10-03：确认相册为独立页面、5 条待定项定稿、新增首页相册模块与三档图片口径、接受极简版相册页）
- [x] 实施完成（代码 + 自检：`tsc` 0 error、`pnpm test` 293/293、后台类名缺失 0；**开发库迁移待用户执行**）
- [x] 文档已同步（`docs/ai/module.md`、`docs/architecture.md` 无需改、`docs/api-contracts.md`、`docs/data-models.md`、`docs/README.md`、`docs/home-modules-spec.md`、`docs/pitfalls.md`（P-141~P-144）、`README.md`、`AGENTS.md` §3 / §6、`changelog/pending/ALBUMS-AND-IMAGE-GROUPS-CHANGELOG.md`）
- [ ] 相册页版式定稿（demo 轮，见 §8 O1–O4）
