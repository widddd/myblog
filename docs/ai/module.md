# module.md — 模块注册表（防重复造轮子）

> **写代码前必读本文件**。新增功能先查这里：已存在则复用或扩展，严禁平行重写。
> 维护规则：新增/删除/重命名源码文件时必须同步本表（见 agents-maintenance.md 触发表）。

**项目当前阶段**：M6 备份系统已完成；下一里程碑为 M7 打磨与部署。下表按实际导出 API 标注状态（✅ 已实现 / 🚧 进行中 / 📋 规划）。

## 模块分组

### lib/（服务端核心）

| 模块路径 | 核心 API | 用途 | 状态 |
|---|---|---|---|
| `src/lib/db.ts` | `prisma`、`DATABASE_PATH`、`getSqliteHandle()` | Prisma Client 单例；Windows 安全路径；WAL/busy_timeout；备份专用句柄 | ✅ |
| `src/lib/bootstrap.ts` | `initializeApplication()` | 首启管理员与默认 Setting 幂等初始化，instrumentation/seed 共用 | ✅ |
| `src/lib/settings.ts` | `getSetting()`、`setSetting()`、`getPublicSettings()`、`ensureDefaultSettings()` | Setting KV + TTL 60 秒/最多 64 项缓存 + 公开子集 | ✅ |
| `src/lib/auth/session.ts` | `getSession()`、`createSession()`、`destroySession()` | iron-session 7 天会话；HttpOnly/Secure/Lax cookie | ✅ |
| `src/lib/auth/password.ts` | `hashPassword()`、`verifyPassword()` | bcryptjs cost 12 | ✅ |
| `src/lib/auth/guard.ts` | `requireAdmin()`、`UnauthorizedError` | API 守卫，未登录抛 401 | ✅ |
| `src/lib/auth/csrf.ts` | `issueCsrfToken()`、`verifyCsrfToken()`、`verifyCsrfRequest()` | double-submit，HMAC 绑定加密 session | ✅ |
| `src/lib/auth/rateLimit.ts` | `rateLimit()`、`clearRateLimit()` | 内存滑动窗口，最多 2000 个桶 | ✅ |
| `src/lib/client/csrf.ts` | `fetchCsrfToken()` | client 组件统一获取 double-submit token | ✅ |
| `src/lib/storage/types.ts` | `StorageDriver`、`normalizeStorageKey()` | put/get/getUrl/delete/stat/listKeys/openReadStream；POSIX key 与路径校验 | ✅ |
| `src/lib/storage/local.ts` | `LocalDriver` | data/uploads 原子写入、流式/Range 读取 | ✅ |
| `src/lib/storage/oss.ts` | `OssDriver`（stub） | 腾讯云 OSS 驱动，用户给 key 后实现 | ✅ stub |
| `src/lib/storage/index.ts` | `getDriver()` | 本地/OSS 驱动唯一工厂 | ✅ |
| `src/lib/markdown/mdx.tsx` | `renderMdx(source)`、`extractToc(source)` | 安全 RSC MDX + TOC + 有界 Shiki 语言/主题 | ✅ |
| `src/lib/markdown/toc.ts` | `collectTocItems()`、`createTocCollector()`、`TocItem` | 目录收集 h1–h6；缺 id 时回填；供 TOC UI 引用（无 RSC） | ✅ |
| `src/lib/markdown/preview.ts` | `renderMdxHtml()`、`MAX_PREVIEW_CHARS` | 后台预览：sanitize 后 `renderToStaticMarkup` | ✅ |
| `src/lib/media/url.ts` | `isSafeMediaUrl()`、`mediaSourceHost()` | 本地上传与 https 外链校验 | ✅ |
| `src/lib/markdown/sanitize.ts` | `sanitizeSchema`、`rehypeAllowVideo()` | rehype-sanitize 白名单；Video JSX 先转安全 HAST | ✅ |
| `src/lib/comments/service.ts` | `submitGuestComment()`、`listApprovedComments()`、`listAdminComments()`、`replyAsAdmin()`、`moderateComment()`、`deleteComment()` | 评论提交/树形列表/审核 | ✅ |
| `src/lib/comments/tree.ts` | `buildCommentTree()`、`isHoneypotFilled()` | 两级树纯函数；蜜罐判定 | ✅ |
| `src/lib/comments/types.ts` | `PublicComment`、`AdminCommentView` | 评论 DTO（无 prisma） | ✅ |
| `src/lib/search/escape.ts` | `escapeLike()`、`likePattern()` | SQLite LIKE 通配符转义 | ✅ |
| `src/lib/search/types.ts` | `SearchHit` | 搜索结果 DTO（无 content） | ✅ |
| `src/lib/search/service.ts` | `searchPosts(q, page)` | 唯一原生 SQL；`ESCAPE char(92)`；密码文仅标题 | ✅ |
| `src/lib/scheduler/index.ts` | `registerScheduler()` | instrumentation 入口（globalThis 幂等；启动补偿 + 60s 发布扫描 + 3600s 备份检查） | ✅ |
| `src/lib/scheduler/publish.ts` | `scanScheduledPosts()` | `scheduled AND publishedAt<=now` → `published`；try/catch 刷新缓存 | ✅ |
| `src/lib/scheduler/backup.ts` | `checkBackupDue()` | `lastBackupAt + backupPeriodDays` 到期则 `runBackup()` | ✅ |
| `src/lib/backup/filename.ts` | `isBackupFileName()`、`backupFileName()` | 备份文件名白名单 `^myblog-\d{8}-\d{6}\.tar\.gz$` | ✅ |
| `src/lib/backup/backup.ts` | `runBackup()`、`listBackups()`、`deleteBackup()` | `.backup()` 快照 + archiver 打包 + 滚动清理 + 互斥锁 | ✅ |
| `src/lib/upload/handle.ts` | `handleUpload(request)` | 单文件 multipart、魔数/扩展校验、SHA-256 去重、sharp 三档图 | ✅ |
| `src/lib/client/upload.ts` | `uploadAdminFile()`、`uploadAdminFiles()`、`editorImageUrl()` | 后台 CSRF 上传（客户端可连传多文件）；正文插图用 content URL | ✅ |
| `src/lib/client/admin.ts` | `adminJson()` | 后台 JSON 请求附带 CSRF | ✅ |
| `src/lib/admin/http.ts` | `AdminHttpError`、`jsonData`、`jsonPage`、`handleAdminError` | 管理 API 统一错误/响应 | ✅ |
| `src/lib/admin/revalidate.ts` | `revalidatePublicContent()` | 写成功后刷新前台路径 | ✅ |
| `src/lib/validation/post.ts` | `postWriteSchema`、`momentWriteSchema`、`taxonomyWriteSchema` | 文章/瞬间/分类标签 zod | ✅ |
| `src/lib/validation/comment.ts` | `guestCommentSchema`、`adminCommentReplySchema`、`adminCommentPatchSchema` | 评论 zod | ✅ |
| `src/lib/validation/settings.ts` | `settingsPutSchema`、`WRITABLE_SETTING_KEYS` | 设置 PUT 白名单（不含 lastBackupAt） | ✅ |
| `src/lib/posts/admin.ts` | `listAdminPosts()`、`createAdminPost()`、`updateAdminPost()`、`deleteAdminPost()` | 后台文章 CRUD（含 `recommend`）；写库前归一正文视频语法；不用 `publishedWhere()` | ✅ |
| `src/lib/posts/admin-types.ts` | `AdminPostView` | 后台文章投影（client 可引用，无 prisma） | ✅ |
| `src/lib/taxonomy/admin.ts` | `listCategories()`、`createCategory()`、`listTags()`、`createTag()` | 分类/标签 | ✅ |
| `src/lib/moments/admin.ts` | `listAdminMoments()`、`createAdminMoment()`、`deleteAdminMoment()` | 后台瞬间 | ✅ |
| `src/lib/posts/banner.ts` | `bannerFill()`、`BANNER_STYLES` | 文章顶 Banner：封面 / 纯色 / 双色渐变 | ✅ |
| `src/lib/posts/import-markdown.ts` | `parseMarkdownImport()` | 发文导入 md/mdx（可选 YAML frontmatter） | ✅ |
| `src/lib/posts/normalize-content.ts` | `normalizePostContent()` | 保存/打开时把 HTML `<video>` 与视频图片语法归一成 `<Video />` | ✅ |
| `src/lib/moments/query.ts` | `listPublicMoments()`、`toggleMomentLike()` | 前台瞬间列表（点赞数/已赞）与 fingerprint 翻转点赞 | ✅ |
| `src/lib/moments/media.ts` | `resolvePublicImageUrl()` | 瞬间图片 key/URL → StorageDriver.getUrl | ✅ |
| `src/lib/moments/types.ts` | `MomentImage`、`PublicMoment` | 瞬间图片 JSON 与前台投影 | ✅ |
| `src/lib/uploads/admin.ts` | `listAdminUploads()`、`deleteAdminUpload()` | 媒体库；删除前引用检查 | ✅ |
| `src/lib/posts/query.ts` | `publishedWhere()`、`listPublishedPosts()`、`listRecommendPosts()`、`getPublishedPostMeta()`、`getPublishedPostContent()`、分类/标签查询 | 前台唯一查询入口；首页推荐优先 `recommend=true`，一篇都没有时回退最新已发布 | ✅ |
| `src/lib/posts/unlock.ts` | `issuePostUnlockCookie()`、`isPostUnlocked()`、token 签验 | slug 绑定的 2h HMAC 解锁 cookie | ✅ |
| `src/lib/posts/types.ts` | `PostCardModel`、`PostDetailModel`（含 `id`） | 前台投影类型（无 passwordHash/content） | ✅ |
| `src/lib/banner/resolve.ts` | `resolveHomeBanner()`、`FALLBACK_BANNER_SRC` | Setting 优先；Bing 日图 3s 超时/最多 2 项缓存/失败回退 | ✅ |
| `src/lib/utils/` | `logger`、`slugify()`、`fingerprint()`、`getClientIp()`、`cn()`、`formatPostDate()`、`parsePage()`、`parsePageSize()` | 有界依赖的通用工具；中文 slug fallback | ✅ |

### components/（UI）

| 模块路径 | 用途 | 状态 |
|---|---|---|
| `src/components/layout/` | `SiteHeader`、`Navbar`（滑动活动底色 + 首页延后主题按钮）、`Footer`、`ThemeToggle`、`SiteShell`、`Sidebar`、`AppChrome`、`NavigationProgress`（顶栏 2px 天蓝进度条） | ✅ |
| `src/components/layout/nav-links.ts` | 前台主导航链接表 | ✅ |
| `src/components/home/` | `HomeBanner`（固定底图 + 滚动模糊/半透明幕布）、`HomeDashboard`、`PostCard`/`PostList`、`ScrollDown` | ✅ |
| `src/components/post/` | `WaveDivider`、`PasswordGate`、`PostBody`、`PostHero`（封面/纯色/混色）、`Toc`（h1–h6 层级 + 点击平滑滚动）、`Video`、`ReadingProgress`、`ViewTracker` | ✅ |
| `src/components/moment/` | `MomentList` 瀑布流、`MomentGrid` 九宫格、`LikeButton` | ✅ |
| `src/components/comment/` | `CommentSection`、`CommentForm`、`CommentItem`（纯文本；蜜罐字段） | ✅ |
| `src/components/common/` | `CoverMedia`、`Pagination`、`EmptyState`、原生 dialog `Lightbox`、`SearchDialog`（⌘K） | ✅ |
| `src/components/admin/EditorLoader.tsx` | **vendor 编辑器唯一入口**（client + dynamic ssr:false）；实现见 `MdxEditorClient.tsx` | ✅ |
| `src/components/admin/InsertImages.tsx`、`InsertVideo.tsx`、`MediaInsertMenu.tsx`、`VideoJsxEditor.tsx`、`AdminImageToolbar.tsx`、`EditorPreview.tsx`、`SortableImageGrid.tsx`、`media-drag.ts`、`editor-i18n.ts` | 图片/视频插入弹窗（portal 到 body）；顶部拖动换位；后台预览；瞬间宫格拖拽；编辑器中文 | ✅ |
| `src/components/admin/PostEditorForm.tsx`、`MomentForm.tsx`、`SettingsForm.tsx`、`AdminNav.tsx`、`AdminWorkspace.tsx`、`BackupPanel.tsx`、`DeleteButton.tsx`、`CommentRowActions.tsx`、`AdminCommentCompose.tsx` | 后台表单、左侧竖栏导航、写文章分栏（含首页推荐）、备份面板、评论审核操作 | ✅ |
| `src/components/admin/LoginForm.tsx`、`LogoutButton.tsx` | CSRF 登录/退出交互 | ✅ |
| `src/types/mdx-editor.d.ts` | `@myblog/mdx-editor` 的 tsc 门面类型（不检查 vendor 源码） | ✅ |

### M1 入口与路由

| 模块路径 | 用途 | 状态 |
|---|---|---|
| `src/instrumentation.ts` | Node runtime 首启初始化 + scheduler 幂等注册 | ✅ |
| `src/proxy.ts` | Next 16 安全头、CSRF、后台乐观拦截、登录 5 次/15 分/IP 限速 | ✅ |
| `src/app/api/auth/{csrf,login,logout}/route.ts` | 认证公开 API | ✅ |
| `src/app/api/upload/route.ts`、`api/uploads/[...path]/route.ts` | 管理员上传；公开流式/Range 文件读取 | ✅ |
| `src/app/api/posts/[slug]/{unlock,view}/route.ts` | 密码解锁；IP+slug 60s 浏览量去重 | ✅ |
| `src/app/api/comments/route.ts` | 公开 GET approved 树 / POST 游客 pending（CSRF+频控+蜜罐） | ✅ |
| `src/app/api/search/route.ts` | 公开搜索（LIKE 转义；60 次/分/IP） | ✅ |
| `src/app/api/moments/route.ts`、`api/moments/[id]/like/route.ts` | 瞬间流；点赞翻转（20 次/分/IP） | ✅ |
| `src/app/admin/login/page.tsx` | 管理员登录页 | ✅ |
| `src/app/api/admin/**/route.ts` | session/stats/posts/preview/categories/tags/moments/comments/uploads/settings/backup | ✅ |
| `src/app/admin/(protected)/layout.tsx`、`page.tsx` | 服务端 session 守卫 + 左侧竖栏工作区 + 仪表盘统计 | ✅ |
| `src/app/admin/(protected)/posts/` | 文章列表 / 新建（左设置右编辑器） / 编辑 | ✅ |
| `src/app/admin/(protected)/moments/page.tsx` | 瞬间发布与列表 | ✅ |
| `src/app/admin/(protected)/comments/page.tsx` | 评论审核（通过/拒绝/删除/回复） | ✅ |
| `src/app/admin/(protected)/uploads/page.tsx` | 媒体库 | ✅ |
| `src/app/admin/(protected)/backups/page.tsx` | 备份列表 / 手动触发 / 下载 / 删除 | ✅ |
| `src/app/admin/(protected)/settings/page.tsx` | 站点设置 KV 表单 | ✅ |
| `src/app/layout.tsx`、`globals.css`、`page.tsx` | 中文根布局、Heo 双主题+玻璃 token、防闪烁脚本、首页 Banner+仪表盘+列表 | ✅ |
| `src/app/posts/`、`categories/`、`tags/`、`archives/`、`moments/`、`messages/`、`search/`、`not-found.tsx` | 前台路由壳 | ✅ |
| `src/app/admin/layout.tsx` | 后台共用 site-offset 外壳 | ✅ |
| `prisma/seed.ts` | bootstrap + 幂等演示 10 篇文章 / 分类标签 / 2 条瞬间 | ✅ |

### editor/（vendor 冻结子树）

| 路径 | 说明 |
|---|---|
| `src/editor/` | mdx-editor v4.2.3 源码（MIT，排除 examples/test）。内部 `@/` 已改为 `@/editor/`。CSS mixins 已一次性展开。**禁止升级依赖、禁止用 `@/`（非 @/editor）引项目代码**。运行时由 `next.config.ts` 将 `@myblog/mdx-editor` 指到 `index.ts`；`globals.css` 由后台 layout 引入（Next 禁止组件内 import 全局 CSS） |

### 入口命令一览

| 命令（main/ 下） | 说明 |
|---|---|
| `pnpm dev` | 开发（Windows 调试） |
| `pnpm build` / `pnpm start` | 构建 / 生产启动 |
| `pnpm prisma migrate dev` / `studio` | 迁移 / 数据库 GUI |
| `pnpm db:seed` | 幂等演示数据（已有文章则跳过） |
| `pm2 start ecosystem.config.cjs` | 生产进程（fork 单实例） |

## 不存在、禁止自造清单

- **没有**独立后端服务/单独 API 服务器（一切在 Next.js 内）
- **没有** Redis/MQ/外部缓存（内存实现，须有上限）
- **没有**多管理员/角色权限体系（单管理员）
- **没有**邮件通知系统（仅后台待审提醒）
- **没有**第三方评论系统（自建）
- **没有** PJAX/音乐播放器/评论弹幕/简繁转换（用户已砍）
- **没有**测试框架（M0~M7 以手动验收为主；仅 sanitize 渲染写最小单测）
