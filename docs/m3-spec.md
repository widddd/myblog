# Spec：M3 编辑器 vendor + 后台管理

- 日期：2026-08-29
- 提案人：AI
- 状态：已实施（2026-08-29）

### 1. 目标

让管理员能在 `/admin` 用冻结的 mdx-editor v4.2.3 写文章：插图（对话框/粘贴/拖拽）、插视频、存草稿、发布后前台立刻可见；并补齐媒体库、瞬间发布、设置页与仪表盘。

**本里程碑不做**：评论审核 UI（M4）、搜索/点赞/定时发布扫描（M5）、备份（M6）、OssDriver、公开 REST。不重写 M2 的存储、sanitize、解锁与前台 CSS。

### 2. 设计方案

#### 2.1 边界（遵守既定决策）

| 项 | 做法 |
|---|---|
| 编辑器 | GitHub tag `v4.2.3` 源码进入 `main/src/editor/`，视为冻结子树 |
| 唯一入口 | `components/admin/EditorLoader.tsx`：`'use client'` + `dynamic(..., { ssr: false })`（P-003） |
| 上传 | 复用 `POST /api/upload` + CSRF；不新写上传通道 |
| 正文安全 | 管理员保存的 MDX 仍走 `lib/markdown/sanitize.ts`（红线 4） |
| 前台查询 | 继续只走 `lib/posts/query.ts` 的 `publishedWhere()`；后台另开 admin 查询，禁止混用（P-012） |
| 存储 | 只经 `lib/storage`；不改 LocalDriver |
| schema | 现有 Post/Category/Tag/Moment/Upload/Setting 足够，**不迁移** |

#### 2.2 Phase A — vendor 最小渲染（首日，R1 兜底）

1. 从 `https://github.com/mdx-editor/editor` tag `v4.2.3` 拷 `src/` 到 `main/src/editor/`。
   - **纳入**：插件、样式、jsx-editors、directive-editors、工具与类型。
   - **不纳入**：`examples/`、`test/`、Ladle、Playwright、上游 AGENTS/CLAUDE（P-017）、mermaid（dev 依赖，sanitize 未放行）。
   - 保留上游 MIT `LICENSE`。
2. 一次性 codemod：import 中的 `@/` → `@/editor/`。完成后 vendor 内禁止再出现非 `@/editor` 的 `@/`（P-005）。
3. 运行时依赖按上游 `package.json` **精确钉死**（去掉 `^`），Lexical 全家桶同一 `0.48.x`。不引入 ladle/vite/playwright。不把 `@mdxeditor/editor` npm 包当运行时依赖。
4. Next 16 适配（一次性，完成后冻结）：
   - **SVG**：不引入 `@svgr/webpack` / 不改 Turbopack 全局规则。把 vendor 内 SVG 一次性转成 TSX 组件（`black` → `currentColor`），避免 dev/prod 打包分叉。
   - **CSS**：不把 `postcss-mixins` / `postcss-nesting` 塞进项目全局 PostCSS（会与 Tailwind 4 抢 nesting）。优先让 Next 消化 CSS Modules + 原生 nesting；若 mixins 编译失败，用上游工具**一次性**打出 `src/editor/style.css` 并改为只 import 该文件。此产物随 vendor 冻结，不算升级。
5. `EditorLoader` 渲染空编辑器（标题/列表/链接/图片插件可先不接上传）。挂在受保护的 `/admin/posts/new`（或临时探针对页）。**禁止**在 `admin/layout` 里静态 import 编辑器。
6. Windows 上 `pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm build` 通过后才进入 Phase B。

**Phase A 失败回退**（须当场再批，不自动执行）：改用 npm `@mdxeditor/editor@4.2.3` 的 dist 跑通，源码仍放 `src/editor/` 作对照。这偏离「源码二次开发」，默认不走。

#### 2.3 Phase B — 图片/视频对接

在 **EditorLoader 外包一层**配置插件，尽量不改 vendor 内部（P-005）。仅当公开 API 不够时，才改 `plugins/image` / jsx descriptor，并先说明理由。

- `imagePlugin({ imageUploadHandler })`：三条路径（对话框/粘贴/拖拽）共用一个 handler → `POST /api/upload`（`kind=image`）+ `x-csrf-token`。正文插入 **content** 档 URL（最长边 1600px WebP），与 M2 灯箱原图别名约定一致。
- `jsxPlugin` 注册 `<Video>` descriptor：属性与前台 `components/post/Video.tsx` / sanitize 白名单对齐（`src` / `poster` / `title` / `controls` / `width` / `height` 等）。视频走 `kind=video`，只插入 original URL。
- 不启用 mermaid、任意 JSX、admonition（sanitize 未放行；用户已砍花哨功能）。
- 启用插件：headings、lists、quote、thematicBreak、link + linkDialog、table、image、jsx(Video)、markdownShortcut、codeblock/codemirror、toolbar（含插入图/视频）。diff-source 可选，不阻塞验收。

#### 2.4 Phase C — 文章 CRUD

新模块，复用现有工具：

| 新路径 | 职责 |
|---|---|
| `lib/posts/admin.ts` | 后台列表/读写；**不用** `publishedWhere()` |
| `lib/validation/post.ts` | zod：title/slug/content/excerpt/cover/status/publishedAt/pinned/password/categoryId/tagIds |
| `app/api/admin/posts/route.ts` | GET 列表（含 draft/scheduled）+ POST 新建 |
| `app/api/admin/posts/[id]/route.ts` | GET/PATCH/DELETE |
| `app/api/admin/categories`、`tags` | 列表 + 新建；编辑页下拉用 |
| `app/admin/(protected)/posts/` | 列表 / 新建 / 编辑 |

规则：

- slug 空则 `slugify(title)`；冲突 400。
- `password`：空字符串=公开（`passwordHash=null`）；非空=`hashPassword()`（现有 bcrypt cost 12）。详情 API 只回 `hasPassword: boolean`，不回 hash。
- `status`：`draft` / `scheduled` / `published`。`published` 且无 `publishedAt` 则写 `now`。`scheduled` 必须带未来 `publishedAt`。M5 之前 scheduler 不翻转状态；前台仍靠 `publishedWhere()`，未到点的定时文继续 404。
- 写成功后 `revalidatePath` 前台相关路由（`/`、`/posts`、`/posts/[slug]`、分类/标签/归档）。M2 未做 `unstable_cache`/`revalidateTag`，本里程碑不新引入缓存层。
- 删除走 Prisma，级联 PostTag；Comment 按现有 schema 不会因删文自动清（`targetType` 无 FK）。M3 删除文章时**显式**删 `targetType=post AND targetId=id` 的评论，避免孤儿。不实现评论审核页。

#### 2.5 Phase D — 媒体库 / 瞬间 / 设置 / 仪表盘

- **仪表盘**（替换占位页）：文章数（按 status）、瞬间数、待审评论数（`Comment.status=pending` 的 count，M4 前为 0）。侧栏导航：仪表盘 / 文章 / 瞬间 / 媒体库 / 设置。
- **媒体库**：`GET /api/admin/uploads` 分页；`DELETE /api/admin/uploads/[id]` 前做引用检查（Post.cover、Post.content 子串、Moment.images JSON）。命中则 409，不删存储对象。删除经 StorageDriver。
- **瞬间**：列表 + 发布/编辑/删除。`images` 为既有 JSON `[{key,thumb,width,height}]`。瀑布流/点赞留 M5。
- **设置页**：读写现有 KV（`siteName`、`announcement`、`banner`、`pageSize`、`backupPeriodDays`、`backupKeep`、`uploadMaxSizeMB`）。`lastBackupAt` 只读展示。三处同步：`DEFAULT_SETTINGS`、表单、`getSetting` 读取（P-004）。不新字段。
- **后台 UI**：复用 `--heo-*` token 与现有 `admin-shell`，功能优先。不搬 theme-hao 管理端、不整包 CSS（P-019）。

#### 2.6 后台壳

扩展 `(protected)/layout.tsx`：导航 + 当前用户。登录守卫已有，不改 session/CSRF/proxy。所有写 API 第一句 `requireAdmin()`。

### 3. 影响面分析

- **涉及模块**：新建 editor vendor、EditorLoader、admin 页面/API、`lib/posts/admin.ts`、`lib/validation/*`、`lib/moments/admin.ts`（或同等路径）、settings 读写复用。复用：`requireAdmin`、`fetchCsrfToken`、`handleUpload`、`hashPassword`、`slugify`、`getSetting`/`setSetting`、StorageDriver、`Video`、sanitize。
- **新增/变更配置字段**：无。
- **是否破坏红线**：否。不升级 vendor 依赖；不直拼 `data/uploads`；SQL 走 Prisma；评论链路本里程碑不渲染 HTML；不引入 Redis；编辑器仅 client+dynamic。
- **是否新增依赖**：mdx-editor 上游运行时依赖（Lexical 0.48、Gurx、Radix、CodeMirror 6、mdast/micromark 系、react-hook-form 等，约 50+ 包）。**仅随后台编辑页动态加载**，前台 RSC 不打包编辑器。内存：服务端不常驻 Lexical；sharp 并发仍为 1。须满足 1GB；Phase A `pnpm build` 作为硬门禁。
- **数据模型**：不改 schema、不执行 migrate。

### 4. 输入输出边界

管理端（全部 `requireAdmin` + 非 GET 须 CSRF），状态由 📋 → ✅：

| 方法 | 路径 | 行为摘要 |
|---|---|---|
| GET | `/api/admin/session` | `{ data: { username } }` |
| GET | `/api/admin/stats` | 文章分状态计数、瞬间数、pending 评论数 |
| GET/POST | `/api/admin/posts` | 列表（query: status/page/q）；新建 |
| GET/PATCH/DELETE | `/api/admin/posts/[id]` | 详情（含 content，`hasPassword`）；更新；删除 |
| GET/POST | `/api/admin/categories`、`/api/admin/tags` | 列表/新建（slug 唯一） |
| GET/POST | `/api/admin/moments` | 列表/发布 |
| PATCH/DELETE | `/api/admin/moments/[id]` | 编辑/删除 |
| GET | `/api/admin/uploads` | 媒体分页 |
| DELETE | `/api/admin/uploads/[id]` | 删除；引用中则 409 |
| GET/PUT | `/api/admin/settings` | 全量 KV；PUT 只接受已知 key |

**明确不做的契约**：`/api/admin/comments*`、`/api/admin/backup*`。

错误格式仍为 `{ code, message }`。分页 `{ data, total, page, pageSize }`。

### 5. 实施步骤

1. 用户批准本 Spec。
2. **Phase A**：vendor 入库 + 别名 codemod + 钉依赖 + SVG/CSS 适配 + EditorLoader 空渲染 + Windows `tsc`/`lint`/`build`。
3. **Phase B**：imageUploadHandler + Video jsx；三种插图路径与视频冒烟。
4. **Phase C**：validation + admin posts/categories/tags API + 文章列表/编辑页；草稿→发布→前台可见。
5. **Phase D**：仪表盘、媒体库、瞬间、设置。
6. 对照 `docs/agents-maintenance.md` 同步文档；PLAN.md 勾选 M3；AGENTS §6 改为下一里程碑 M4。

每 Phase 可独立验收；A 不过不开始 B。

### 6. 验收标准

**Phase A**

- `/admin/posts/new` 登录后编辑器可见，无 SSR/hydration 报错。
- `src/editor/` 内 import 无 `@/`（非 `@/editor`）。
- `pnpm why lexical` 仅一条 0.48.x 线。
- Windows：`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm build` 通过。

**Phase B～D（M3 整体）**

- 新建文章：对话框插图、粘贴插图、拖拽插图均写入 `/api/uploads/...` 的 content URL；插 `<Video>` 后前台详情能播（sanitize-probe 级规则仍有效：script/onerror 不出现）。
- 存草稿：前台 404；改为 published 后首页与 `/posts/[slug]` **立即**可见（无需等 scheduler）。
- 密码文：后台可设/清密码；前台仍走 M2 解锁，列表无 excerpt。
- 媒体库删除被正文引用的图返回 409；未引用可删，之后 GET 原 URL 为 404。
- 设置改 `siteName`/`announcement` 后前台在 Setting 缓存 TTL（60s）内或保存后 `revalidatePath` 可见。
- 仪表盘数字与 Prisma count 一致。
- 未登录访问 `/admin/posts` 仍 307 到登录；无 CSRF 的 POST 403。

### 7. 审批

- [x] 用户已批准
- [x] 实施完成
- [x] 文档已同步：AGENTS、PLAN、README、docs/README、architecture、api-contracts、data-models、ai/module、pitfalls、m3-spec

---

### 请用户确认的两点

1. **缓存失效**用 `revalidatePath`，不新增 `revalidateTag`（M2 无缓存层）。
2. **评论**：仪表盘只显示 pending 计数；审核页归 M4。删文章时级联清该文评论，避免孤儿。
