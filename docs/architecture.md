# architecture.md — 架构与数据流

## 动机

AI 长对话会退化（上下文污染、隐性知识缺失、自由发挥）。本体系用分层文档立规矩、工作流锁质量，把 AI 约束成受工程规范约束的研发者。

## 总体架构

```
浏览器
  │  Next.js 16 App Router（前后端一体，单进程）
  ├── 前台页面（RSC 服务端渲染）：主页/文章/瞬间/搜索/留言板
  ├── 后台 /admin（client 组件为主，session 守卫）
  └── /api 路由（REST，zod 校验，requireAdmin + CSRF）
        │
        ├── Prisma 6 ──→ SQLite（main/data/blog.db，WAL 模式，better-sqlite3 adapter）
        ├── lib/storage StorageDriver ──→ main/data/uploads/（本地，后续可切腾讯云 OSS）
        └── scheduler（instrumentation 注册，进程内 setInterval）
              ├── 定时发布：扫描 scheduled → published（前台查询双保险：status=published AND publishedAt<=now）
              └── 自动备份：better-sqlite3 .backup() + archiver → data/backups/*.tar.gz
```

## 硬性资源约束（用户钦定，不可违反）

1. **开发调试在 Windows**（Win11）：路径一律 `node:path`；存储 key 统一 posix 风格；原生依赖（sharp/better-sqlite3）必须 Windows prebuilt 可装；`.gitattributes` 强制 LF；`forceConsistentCasingInFileNames` 防大小写漂移。
2. **运行时 ≤1GB RAM**：pm2 fork 单实例（禁 cluster）；不引入 Redis/MQ/重型监控；内存缓存（settings、限速表、浏览量去重）须有上限与淘汰；sharp 处理并发限 1~2。
3. **Node.js ≥22**：`better-sqlite3@13` 的最低版本要求；开发基线为 Node 24。Prisma adapter 的传递依赖由 `pnpm-workspace.yaml` override 到同一 v13，避免 Windows Node 24 加载无 binding 的 v11。

## 技术选型与理由（已定，勿复议）

| 选型 | 理由 |
|---|---|
| Prisma 6 + @prisma/adapter-better-sqlite3 | 迁移工具链成熟；免 Rust 引擎（Windows 友好）；拿到 better-sqlite3 句柄执行 .backup() 与 WAL pragma。退路：切回默认 engine 只改 lib/db.ts |
| 上传经 /api/uploads/[...path] 路由 serve | public/ 是构建期语义，运行时写入不受保证；StorageDriver 统一 put/get/getUrl/delete/stat，路由支持流式与 Range，hash 文件 immutable |
| iron-session v8 | 加密 cookie、无 session 表、HttpOnly/Secure/SameSite 全控；Lucia 已停维护、自写 JWT 撤销坑多 |
| next-mdx-remote/rsc | 运行时渲染数据库 MDX；blockJS；Video JSX→安全 HAST→sanitize→slug/autolink→TOC→Shiki |
| sharp 同步缩略图 | 上传即生成 thumb(480px)/content(最长边 1600px) WebP + 原图；SHA-256 命名去重；并发与 libvips 线程均限 1 |
| mdx-editor v4.2.3 源码 vendor | MIT；v4 用 Gurx 插件架构，imagePlugin({imageUploadHandler}) 覆盖粘贴/拖拽；工具栏多图/多视频走应用层 InsertImages/InsertVideo；视频用 jsxPlugin 注册 <Video> 且编辑器内可更换/删除；必须 client-only（React 19 下 dynamic ssr:false 只能在 client 组件） |
| archiver 打包备份 | 纯 JS，规避 Windows/Linux 系统 tar 差异 |

## M1 请求与认证链路

- Next 16 使用 `main/src/proxy.ts`（不是已弃用的 `middleware.ts`）：统一安全头、所有非安全方法的 CSRF 校验、`/admin` cookie 乐观拦截、登录 5 次/15 分/IP 限速。
- `/admin/(protected)` 服务端 layout 解密 iron-session 做真实鉴权；Proxy 中仅检查 cookie 是否存在，不作为最终权限边界。
- `GET /api/auth/csrf` 创建匿名 session 并签发 double-submit token；登录成功后轮换 session 内 CSRF secret，登录响应返回新 token。
- Setting 缓存 TTL 60 秒、最多 64 项；限速表最多 2000 个桶，符合 1GB 约束。
- `instrumentation.ts` 只在 Node runtime 动态加载数据库初始化与 scheduler；globalThis Promise 防开发热重载重复初始化。

## 已证伪/否决路线（禁止复活）

Lucia（停止维护）、自写 JWT、Drizzle、public 目录运行时写文件、系统 tar/直接拷 db 文件备份、pm2 cluster、重量级动画库（动画以 CSS 为主）。

## 目录结构

见 [AGENTS.md §3](../AGENTS.md) 导航表。关键不变量：

- 应用代码只在 `main/`，文档在 `docs/`，`reference/` 只读
- `main/src/editor/` 为 vendor 冻结子树（内部别名已从 `@/` 改为 `@/editor/`）
- `main/data/` 运行时生成，gitignore
- `next.config.ts` 关闭 Next 16 `agentRules` 自动生成，防止在 `main/` 内产生第二套 AGENTS/CLAUDE 规则文件

## 设计体系（theme-hao/Heo 风格，token 与玻璃 UI 已落地于 globals.css）

- CSS 变量 token：`--heo-*` 前缀，light/dark 双主题（`[data-theme]` 切换）；浅色主色 `#4db8e8`（天蓝），深色主色 `#ffc848`（深浅不同色相是 Heo 标志）
- 玻璃：导航/侧栏/仪表盘/卡片使用 `backdrop-filter: saturate(180%) blur(20px)` + 半透明底；**不要**把 `reference/theme-hao` 的 `zhheoblog.css`（约 1.8 万行）整包拷进项目
- 卡片：圆角 12px、细边框 + 轻阴影；文章大卡 hover 轻微上移 + 灰色扩散阴影（不再改蓝边框）；整卡可点进文章，点击处灰色涟漪；分类条目 hover 淡灰底而不是主题蓝铺满
- 动效：slide-in 上移淡入入场（错峰）、首页 Banner 入场 blur-to-clear + scale、海浪 SVG；导航切换顶栏 2px 天蓝 `scaleX` 进度条；主导航活动底色 `translateX` 滑到目标项。CSS transition 为主，禁止重量级动画库
- 布局：容器 1200px，侧栏 300px（<1200px 隐藏侧栏，<900px 仪表盘纵向，<768px 移动端抽屉）
- 主页 Banner：Setting.banner 优先；为空时请求 Bing zh-CN 日图（3 秒超时、同日缓存、失败 5 分钟负缓存、Map 最多 2 项），最终回退 `/banner-fallback.svg`。滚动时底图 `position:fixed` 不上移，`--home-blur`/`--home-veil` 跟 scrollY（幕布最大透明度 0.28，顶部 mask 渐隐，避免在欢迎卡里画出 100vh 接缝）；卡片再叠一层更透明的玻璃。首页顶栏主题按钮在滚动超过 72px 后才挤出
- 文章页：顶 Banner 可选封面图 / 纯色 / 双色渐变；sanitize 后 MDX、TOC（h1–h6 层级 + 点击平滑滚动）、双主题 Shiki、Video、原生 dialog 灯箱、阅读进度均已接入
- 查询红线：前台一律走 `lib/posts/query.ts` 的 `publishedWhere()`；元信息查询不取 content/excerpt，公开摘要用 `passwordHash:null` 的第二查询补齐；密码正文只在 HMAC cookie 验证后读取
- 搜索：唯一原生 SQL 在 `lib/search`，LIKE 通配符经 `escapeLike` 转义；密码文只匹配标题
- 定时发布双保险：scheduler 只做状态翻转；前台所有查询条件含 `publishedAt<=now`

## 数据流要点

- 文章渲染：DB(MDX 字符串) → next-mdx-remote v6 `blockJS` → Video 字面量白名单转 HAST → rehype-sanitize → slug/autolink/TOC（`lib/markdown/toc.ts` 收集 h1–h6）→ Shiki → RSC 输出。未知 JSX、事件属性、script 与危险协议不进入输出。编辑器「标题 1」落成 `#` / `h1`，必须进目录，不能只收 h2–h4。
- 后台编辑：vendor `src/editor/`（mdx-editor v4.2.3）只经 `EditorLoader`（client + `dynamic ssr:false`）加载，禁止平行重写编辑器。Tailwind preflight 会把 h1–h6 收成同号字，必须用 `.admin-mdx-prose h*` 单独定字号。写文章顶栏「可视化 / 预览」走 `POST /api/admin/preview`（sanitize 后的 HTML）。图片/视频插入是 portal 到 `document.body` 的弹窗（上传或外链），避免被编辑器 overflow 挡住。块顶部「拖动」条用 Lexical 命令换位。工具栏中文走 `editor-i18n.ts` 的 `translation`，不改 vendor。外链视频在 `Video` 组件下方标域名。深色模式不改 vendor：由 `globals.css` 覆盖 `--base*`。上传仍按单文件打 `POST /api/upload`。打开/保存时 `normalizePostContent()` 把 HTML `<video>` 与视频图片语法收成 `<Video />`。首页推荐位由 Post.recommend 控制。tsc 排除 vendor；`@myblog/mdx-editor` 指向 `src/editor/index.ts`。
- 密码文章：安全 meta → 读取 slug 专属 HttpOnly cookie → HMAC/2h 到期校验 → 才查 content/excerpt。锁定页调用 `noStore()` 并由 Next 动态响应产生 `private, no-store`，原始正文不进入 client props。
- 上传：管理员 + CSRF → 单文件/大小前置检查 → file-type 魔数与扩展双校验 → SHA-256 去重 → sharp 顺序生成三档 → StorageDriver 写入 → Upload 元数据。LocalDriver 是唯一知道 `data/uploads` 物理路径的模块。
- 文件读取：URL POSIX key → canonical/越界校验 → StorageDriver stat/get；视频 Range 返回 206；hash 资源缓存一年 immutable。正文 content 图通过 hash 原图别名进入灯箱。
- 浏览量：详情 client 获取 CSRF 后 POST；服务端 `publishedWhere()` 校验，IP+slug 60 秒有界去重，Prisma 原子 increment。
- 定时发布双保险：scheduler 只做状态翻转；前台所有查询条件含 `publishedAt<=now`
- 搜索：`GET /api/search` 与结果页共用 `searchPosts()`；密码文正文命中不入结果
- 瞬间点赞：IP+UA fingerprint HMAC；`MomentLike(momentId, fingerprint)` 联合唯一，POST 翻转；图片 URL 经 StorageDriver.getUrl
- 评论：游客 POST（CSRF + 1/60s/IP + 蜜罐）→ pending；公开只渲染 approved 纯文本（React 转义）；管理员回复直接 approved。文章/瞬间/留言板三处接入，按 `targetType+targetId` 隔离。
- 备份：`getSqliteHandle().backup()` 得到一致快照 → archiver 打 tar.gz（`blog.db` + `uploads/` 经 StorageDriver 列举/流式读入）→ `data/backups/myblog-YYYYMMDD-HHMMSS.tar.gz`；`lastBackupAt` 写入 Setting；超过 `backupKeep` 滚动删除。进程内互斥；OSS 上传仍为预留。
- 后台写文章：左侧栏目竖栏 + 可收起设置分组，右侧编辑器占大部分面积；折叠动画只用 CSS `grid-template-rows` / width transition。
