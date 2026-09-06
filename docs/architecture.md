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
        ├── lib/storage StorageDriver ──→ 本地媒体缓存（data/uploads，有限额，含 thumbs2）+ 腾讯云 COS（原图/音视频/一级 thumb/备份）
        └── scheduler（instrumentation 注册，进程内 setInterval）
              ├── 定时发布：扫描 scheduled → published（前台查询双保险：status=published AND publishedAt<=now）
              ├── 自动备份 / 预约恢复：.backup() + archiver；未到 restartAt 启动不覆盖；到点或立刻重启后 applyPendingRestore
              └── 程序更新：后台只写 data/update-pending.json；boot.cjs 在拉起 Next 之前覆盖程序文件
```

**面板优先（用户钦定）**：普通用户有能力调整的措施都做到后台面板里，留给用户充足的自定义空间。CLI / 环境变量只留给投产初始化、停服换机恢复、部署等面板做不到或不该做的事。

## 硬性资源约束（用户钦定，不可违反）

1. **开发调试在 Windows**（Win11）：路径一律 `node:path`；存储 key 统一 posix 风格；原生依赖（sharp/better-sqlite3）必须 Windows prebuilt 可装；`.gitattributes` 强制 LF；`forceConsistentCasingInFileNames` 防大小写漂移。
2. **运行时 ≤1GB RAM**：pm2 fork 单实例（禁 cluster）；不引入 Redis/MQ/重型监控；内存缓存（settings、限速表、浏览量去重）须有上限与淘汰；sharp 处理并发限 1~2。
3. **Node.js ≥22**：`better-sqlite3@13` 的最低版本要求；开发基线为 Node 24。Prisma adapter 的传递依赖由 `pnpm-workspace.yaml` override 到同一 v13，避免 Windows Node 24 加载无 binding 的 v11。

## 技术选型与理由（已定，勿复议）

| 选型 | 理由 |
|---|---|
| Prisma 6 + @prisma/adapter-better-sqlite3 | 迁移工具链成熟；免 Rust 引擎（Windows 友好）；拿到 better-sqlite3 句柄执行 .backup() 与 WAL pragma。退路：切回默认 engine 只改 lib/db.ts |
| 上传经 /api/uploads/[...path] 路由 serve | public/ 是构建期语义，运行时写入不受保证；StorageDriver 统一 put/get/getUrl/delete/stat；访客 thumb/封面走 COS HTTPS，本地路由给缓存与旧链 |
| iron-session v8 | 加密 cookie、无 session 表、HttpOnly/Secure/SameSite 全控；Lucia 已停维护、自写 JWT 撤销坑多 |
| next-mdx-remote/rsc | 运行时渲染数据库 MDX；blockJS；Video/Audio JSX→安全 HAST→sanitize→slug/autolink→TOC→Shiki |
| sharp 同步缩略图 | 一级 WebP 边长 `thumbMaxPx`（默认 480，本地+COS）；二级 WebP 边长 `thumb2MaxPx`（默认 320，**只本地** `images/thumbs2/`）；原图保持原格式；按 `localMediaMaxMB` 清本地；SHA-256 分片目录；并发与 libvips 线程均限 1 |
| mdx-editor v4.2.3 源码 vendor | MIT；v4 用 Gurx 插件架构，imagePlugin({imageUploadHandler}) 覆盖粘贴/拖拽；工具栏多图/多视频走应用层 InsertImages/InsertVideo；视频用 jsxPlugin 注册 <Video> 且编辑器内可更换/删除；必须 client-only（React 19 下 dynamic ssr:false 只能在 client 组件） |
| archiver 打包备份 | 纯 JS，规避 Windows/Linux 系统 tar 差异 |

## M1 请求与认证链路

- Next 16 使用 `main/src/proxy.ts`（不是已弃用的 `middleware.ts`）：统一安全头（`object-src 'none'`；`/admin` 与认证 API `Cache-Control: private, no-store`；HTTPS 时 HSTS）、所有非安全方法的 CSRF 校验、`/admin` cookie 乐观拦截、登录与创建站点 5 次/15 分/IP 限速。无管理员时放行 `/admin/setup` 与 `POST /api/auth/setup`。
- 无管理员时根 layout 把前台与 `/admin` 转到 `/admin/setup`；已有管理员则创建页 409 回登录。
- `requireAdmin()` 会拒绝 `mustChangeCredentials=true` 的会话（403），只有改账号接口放行。客户端 IP 优先 `X-Real-IP`，不信 `X-Forwarded-For` 第一跳。
- 公开列表/meta/首页格点走 `unstable_cache`（60 秒，`PUBLIC_CACHE_TAGS`）；写成功 `revalidateTag`。`getPublishedPostContent` 与密码文页禁止进共享缓存。
- `/admin/(protected)` 服务端 layout 解密 iron-session 做真实鉴权；Proxy 中仅检查 cookie 是否存在，不作为最终权限边界。
- `GET /api/auth/csrf` 创建匿名 session 并签发 double-submit token；登录成功后轮换 session 内 CSRF secret，登录响应返回新 token。
- Setting 缓存 TTL 60 秒、最多 64 项；限速表最多 2000 个桶，符合 1GB 约束。
- `instrumentation.ts` 只在 Node runtime 动态加载数据库初始化与 scheduler；globalThis Promise 防开发热重载重复初始化。预约恢复在这里 `applyPendingRestore()`。预约程序更新不在这里做：必须在加载 `src/` 之前覆盖文件，由 `scripts/boot.cjs` 先跑 `apply-pending-update.ts` 再 `require` Next CLI（同一 PID，便于 pm2 内存线）。

## 已证伪/否决路线（禁止复活）

Lucia（停止维护）、自写 JWT、Drizzle、public 目录运行时写文件、系统 tar/直接拷 db 文件备份、pm2 cluster、重量级动画库（动画以 CSS 为主）。

## 目录结构

见 [AGENTS.md §3](../AGENTS.md) 导航表。关键不变量：

- 应用代码只在 `main/`，文档在 `docs/`，`reference/` 只读
- `main/src/editor/` 为 vendor 冻结子树（内部别名已从 `@/` 改为 `@/editor/`）
- `main/data/` 运行时生成，gitignore（含 `blog.db`、`uploads/`、`backups/`、`updates/`、`update-pending.json`、`backup-host-secret.json`）
- `next.config.ts` 关闭 Next 16 `agentRules` 自动生成，防止在 `main/` 内产生第二套 AGENTS/CLAUDE 规则文件

## 设计体系（theme-hao/Heo 风格，token 与玻璃 UI 已落地于 globals.css）

- CSS 变量 token：`--heo-*` 前缀，light/dark 双主题（`[data-theme]` 切换）；浅色主色 `#4db8e8`（天蓝），深色主色 `#ffc848`（深浅不同色相是 Heo 标志）。首屏防闪烁由 `ThemeInit` 经 `useServerInsertedHTML` 注入 head（P-040），不要在 `layout.tsx` 写 `<script>`
- 玻璃：导航/侧栏/仪表盘/卡片使用 `backdrop-filter: saturate(180%) blur(20px)` + 半透明底；**不要**把 `reference/theme-hao` 的 `zhheoblog.css`（约 1.8 万行）整包拷进项目
- 卡片：圆角 12px、细边框 + 轻阴影；文章大卡 hover 只播左→右光泽，移开立即收回、不回放；整卡可点进文章，点击处灰色涟漪；分类条目 hover 淡灰底而不是主题蓝铺满
- 动效：slide-in 上移淡入入场（错峰）、首页 Banner 入场 blur-to-clear + scale、海浪 SVG；导航切换顶栏 2px 天蓝 `scaleX` 进度条；主导航活动底色 `translateX` 滑到目标项。CSS transition 为主，禁止重量级动画库
- 布局：容器 1200px，侧栏 300px。走手机套时侧栏下沉到正文下方（不再 1200px 隐藏）。首页 12 列格点：桌面两侧 `1fr` 留白；电脑/手机两套几何（`hPct` 相对视口高度）；走手机套条件见 [responsive-layout-spec.md](responsive-layout-spec.md)。详见 [home-modules-spec.md](home-modules-spec.md)
- 主页 Banner：Setting.banner 优先；为空时请求 Bing zh-CN 日图（3 秒超时、同日缓存、失败 5 分钟负缓存、Map 最多 2 项），最终回退 `/banner-fallback.svg`。底图未完全解码前不显示，就绪后再播 blur-to-clear / scale 入场；解码超过 2 秒才用顶栏 `TransferHud` 显示加载进度（与上传同一条，满格后自动关掉）。滚动时底图 `position:fixed` 不上移，`--home-blur`/`--home-veil` 跟 scrollY（幕布最大透明度 0.28，顶部 mask 渐隐，避免在欢迎卡里画出 100vh 接缝）；卡片再叠一层更透明的玻璃。首页顶栏主题按钮在滚动超过 72px 后才挤出
- 文章页：顶 Banner 可选封面图 / 纯色 / 双色渐变；sanitize 后 MDX、TOC（h1–h6 层级 + 点击平滑滚动）、双主题 Shiki、Video、原生 dialog 灯箱、阅读进度均已接入。阅读页右侧默认只显示目录，其它 widget 收起，点侧栏右上角按钮展开
- 查询红线：前台一律走 `lib/posts/query.ts` 的 `publishedWhere()`；元信息查询不取 content/excerpt，公开摘要用 `passwordHash:null` 的第二查询补齐；密码正文只在 HMAC cookie 验证后读取
- 搜索：唯一原生 SQL 在 `lib/search`，LIKE 通配符经 `escapeLike` 转义；密码文只匹配标题
- 定时发布双保险：scheduler 只做状态翻转；前台所有查询条件含 `publishedAt<=now`

## 数据流要点

- 文章渲染：DB(MDX 字符串) → next-mdx-remote v6 `blockJS` → Video 字面量白名单转 HAST → rehype-sanitize → slug/autolink/TOC（`lib/markdown/toc.ts` 收集 h1–h6）→ Shiki → RSC 输出。未知 JSX、事件属性、script 与危险协议不进入输出。编辑器「标题 1」落成 `#` / `h1`，必须进目录，不能只收 h2–h4。
- 后台编辑：vendor `src/editor/`（mdx-editor v4.2.3）只经 `EditorLoader`（client + `dynamic ssr:false`）加载，禁止平行重写编辑器。Tailwind preflight 会把 h1–h6 收成同号字，必须用 `.admin-mdx-prose h*` 单独定字号。写文章顶栏「可视化 / 预览」走 `POST /api/admin/preview`（sanitize 后的 HTML）。图片/视频插入是 portal 到 `document.body` 的弹窗（上传或外链），避免被编辑器 overflow 挡住。块顶部「拖动」条用 Lexical 命令换位。工具栏中文走 `editor-i18n.ts` 的 `translation`，不改 vendor。外链视频在 `Video` 组件下方标域名。深色模式不改 vendor：由 `globals.css` 覆盖 `--base*`。上传仍按单文件打 `POST /api/upload`。打开/保存时 `normalizePostContent()` 把 HTML `<video>` 与视频图片语法收成 `<Video />`。首页推荐位由 Post.recommend 控制。tsc 排除 vendor；`@myblog/mdx-editor` 指向 `src/editor/index.ts`。
- 密码文章：安全 meta → 读取 publicId 专属 HttpOnly cookie → HMAC/2h 到期校验 → 才查 content/excerpt。锁定页调用 `noStore()` 并由 Next 动态响应产生 `private, no-store`，原始正文不进入 client props。
- 文章地址：规范路径 `/posts/{8 位 base62}/{slug 或 article}`（`postHref()`）。旧 `/posts/{slug}` 与缺 name 的 `/posts/{publicId}` **301** 到规范地址。后台编辑仍走数字 `id`。
- 上传：管理员 + CSRF → 单文件魔数/扩展校验 → SHA-256 去重 → **原图只写本地**。图片超过 10MB 先警告再按原格式压到限额内，压缩结果即原图（进站最大 50MB）；视频/音频仍受 `uploadMaxSizeMB` 限制。写文章/瞬间 `defer`，点发布后 `finalize` 才生成 WebP thumb 并上传 COS。媒体库上传当场 ingest+finalize。未配 COS 时仍可入库，发布/上云才 503。上传后按 `localMediaMaxMB` 只删本地（无 COS 副本不删）。媒体库按 `createdAt` 倒序；查看接口 stat 本地与 COS 已知 key。删除默认清本地原图+一级/二级 thumb+COS；`keepCos` 只删本地。关联文章由面板警告，不再 409 拦截。任意上传走顶栏 `TransferHud`。LocalDriver 仍是唯一知道 `data/uploads` 物理路径的模块。详见 [media-layout-spec.md](media-layout-spec.md)、[cos-storage-spec.md](cos-storage-spec.md)。
- 文件读取：访客 thumb / 封面 / 灯箱小图走 COS HTTPS；灯箱大图先用缩略图做模糊底，经 `/api/uploads?proxy=1` 拉原图（可显示进度，本地没有则回源 COS），加载完约 1s 变清晰。舞台按原图像素排版，用 transform 缩放到视口，放大才能看到原图像素。同一页内原图 blob 最多缓存 6 张，关闭灯箱不释放，再点同一张直接用缓存、不重新下载。滚轮、触控板捏合、触屏双指可放大（最大为适配倍率的 8 倍），放大后拖动平移，缩回适配倍率回正中。`<video>`/`<audio>` 仍走原格式。重生成缩略图按 Upload 元数据先找本地原图，没有再拉 COS。旧 `/api/uploads` 仍可读本地缓存。
- 浏览量：详情 client 获取 CSRF 后 POST；服务端 `publishedWhere()` 校验，IP+publicId 60 秒有界去重，Prisma 原子 increment。
- 定时发布双保险：scheduler 只做状态翻转；前台所有查询条件含 `publishedAt<=now`
- 搜索：`GET /api/search` 与结果页共用 `searchPosts()`；密码文正文命中不入结果
- 瞬间点赞：IP+UA fingerprint HMAC；`MomentLike(momentId, fingerprint)` 联合唯一，POST 翻转；九宫格 thumb 与点开原图都走 COS URL（未配 COS 时回退本地）
- 评论：游客 POST（CSRF + 1/60s/IP + 蜜罐）→ pending；公开只渲染 approved 纯文本（React 转义）；管理员回复直接 approved。文章/瞬间/留言板三处接入，按 `targetType+targetId` 隔离。评论栏默认收起，点「评论 n」才展开。密码文未解锁时公开评论 API 不回内容。
- SEO：`/sitemap.xml`、`/robots.txt`、`/rss.xml`。RSS 排除密码文；sitemap 可含密码文 URL（标题本就公开）但不带正文。站点源来自设置 `siteUrl` 或 `SITE_URL`。
- 备份：`getSqliteHandle().backup()` 得到一致快照 → 内层 tar.gz（`blog.db` + 本地 uploads 经 LocalDriver；明文包另含 `meta.json` 频道/版本）。加密开启时：主机半钥 XOR 包内半钥得到 DEK → AES-256-GCM → 外层 tar.gz 含 `meta.json` + `half` + `payload.enc`。明文与加密包落盘后若 COS 已配齐则 `putFile` 到 `backups/`（失败不回滚本地）。本地同时受 `backupKeep` 与 `backupLocalMaxMB` 约束，滚动只删本机生成包、不删上传包。加密开关在后台备份页；COS 访问为 HTTPS 且用户未手设时默认关加密。无主机半钥则拒绝**加密**备份，非加密备份照常。版本角标与包内频道来自 `lib/release.ts`（现为 0.1.0）。详见 [backup-encryption-spec.md](backup-encryption-spec.md)、[cos-storage-spec.md](cos-storage-spec.md)。
- 恢复：禁止在 Prisma 仍连着库时覆盖 `blog.db`。列表或上传只写入预约，站点照常使用。到 `restartAt` 或点「立刻重启」才退出进程。启动时仅当预约已到期才 `applyPendingRestore()`。Linux 生产用 pm2 / systemd 拉起 `scripts/boot.cjs`。Windows 开发无监护时用 wscript 隐藏拉起 `boot.cjs`，禁止 detached node（会弹 cmd）。与预约程序更新互斥。详见 [backup-restore-spec.md](backup-restore-spec.md)。
- 程序更新：更新包是明文 `tar.gz`（`kind:app-update`），拒绝 `data/`、`.env`、`node_modules/`、`.next/` 等，`main/` 下其余文件进包。后台「更新」或 `pnpm apply-update --file` 只写预约；到点或立刻重启后由 boot.cjs 覆盖。可 `pnpm pack:update --git <ref>`。GitHub 检查只在后台点一次。Linux 空机首装走 `scripts/install.sh`（只一次）；以后发版只换包。详见 [app-update-spec.md](app-update-spec.md)、[linux-deploy-spec.md](linux-deploy-spec.md)、[user-manual.md](user-manual.md)。
- 后台写文章：左侧栏目竖栏 + 可收起设置分组，右侧编辑器占大部分面积；折叠动画只用 CSS `grid-template-rows` / width transition。设置分组收起后只留标题行，左栏 Grid 不得 stretch 把收起块撑高（P-063）。分类/标签可在「分类与标签」分组当场 POST 新建并选用。收起按钮在各自栏目右上角，用 chevron 图标（`.admin-pane-toggle`），不要用「收起栏目 / 收起设置」文字。桌面后台锁视口高度，各栏 `overflow` + `overscroll-behavior: contain` 独立滚动，禁止整页带着其它栏一起滚。
- 后台壳：`AdminWorkspace` = 左侧栏 + `.admin-main`（非编辑页顶栏当前页标题 18px + 你好用户名 14px，内容区 `.admin-stage`）。编辑页（写文章 / 首页画布 / 模块编辑）无顶栏、stage 铺满（P-033）。切页时顶栏固定、标题只做透明度渐变；右侧卡片先 160ms 向下跳出淡出，再换内容 220ms 从下方浮现。同一路径刷新不播切换。动效与字号只走 `--admin-*`：`--admin-fast/mid/slow` 为 160/220/280ms，`--admin-ease` 为 ease-out；标题 18px、分组 16px、正文 14px。危险提示用 `.admin-danger`（`#D93025` 加粗）。后台卡片 hover 不加位移。禁止再写 300ms 以上的后台动画（P-044）。
- 首页渲染：`HomePlacement` 桌面/手机两套几何 → 桌面 `toAreas()` 分格（同 `(row, col, colSpan)` 的模块纵向堆叠，同行重叠则整体下移一行）→ `HomeGrid` 输出 `--cell-*` 与 `--m-cell-*` CSS 变量，走手机套时 area `display: contents`。断点与 `hPct` 换算见 `lib/layout/viewport.ts`。`HomeModuleRenderer` 按 `builtinKey` 或 custom 分派（含 `uptime`）。`lib/home/data.ts` 按启用的模块与积木决定查哪些数据，查询仍只走 `lib/posts/query.ts`。`page.tsx` 只取布局 + 渲染 `HomeGrid`，禁止再堆一次性 JSX（P-035）。侧栏五块与首页 widget 共用 `components/widgets/*` 同一份实现。文章阅读页默认只显示目录。首页 Banner 解码超过 2 秒才用 `TransferHud` 报进度，满格后关掉。`siteStartedAt` 为空时运行时间模块前台不占格。
- 后台首页管理：`/admin/home` 是 RSC 页面，把每个模块的真实预览节点作为 props 交给 client 画布 `HomeLayoutEditor`（不用 iframe，站点 `X-Frame-Options: DENY`）。拖动用指针事件 + 12 条隐藏标尺读真实列边界，悬空时用预览格点让位并用蓝框标落点，放回原格不写 dirty；不引入 `react-grid-layout` 等重库。首页模块/背景不透明度走 Setting KV（`homeModuleOpacity` 默认 32、`homeBackdropOpacity` 默认 100），由 CSS 变量 `--home-module-fill` / `--home-backdrop-opacity` 接到前台。欢迎模块漂浮色块文字走模块 `config.chips`。站点运行时间开始时刻走 Setting `siteStartedAt`。
- 自定义模块代码：`HomeModule.html/css/js` 只有管理员可写，按用户决策直接注入前台页面，**不过** sanitize；CSS 默认用模块唯一 class 包一层，JS 由 `CustomModuleRuntime` 建 script 节点执行并包 `try/catch`。这条路不得扩散到评论或正文管线（P-034）。
