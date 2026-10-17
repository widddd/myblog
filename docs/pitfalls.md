# pitfalls.md — 已知陷阱（活文档）

> 发现 AI 重复犯错或首次犯且可能再犯的显著错误 → **立即追加**，P-0XX 递增，不删旧条。
> 格式：❌ 错误 / ✅ 规则 / 📎 案例（可选）

### P-001 重复造轮子 / 平行模块
- ❌ 不查 `docs/ai/module.md` 就新写一个已存在的工具/组件（如再写一个日期格式化）
- ✅ 规则：写代码前必读模块注册表；已存在则复用或扩展

### P-002 运行路径与构建配置漂移
- ❌ dev 下能跑、`pnpm build` 报错（如 client 组件引了服务端模块）
- ✅ 规则：交付前 Windows 上同时过 `pnpm dev` 和（M3 起）`pnpm build`

### P-003 编辑器 SSR 报错
- ❌ 在 Server Component 中直接 import vendor 编辑器 → hydration/SSR 崩溃
- ✅ 规则：编辑器只经 `components/admin/EditorLoader.tsx` 引入（client 组件内 `dynamic(ssr:false)`）

### P-004 配置多源不同步
- ❌ Setting KV 新增字段（如 backupPeriodDays）只改了后台表单，漏了 service 读取和默认值回填
- ✅ 规则：新增配置字段同步三处——schema/默认值定义、后台设置表单、service 读取逻辑

### P-005 vendor 目录漂移
- ❌ 升级 `src/editor/` 内依赖版本，或在 editor 内用 `@/`（非 `@/editor`）引项目代码
- ✅ 规则：vendor 子树冻结；改动须先向用户说明理由获批

### P-006 Windows/Linux 路径混用
- ❌ 路径字符串拼 `\`、`split('\\')`、依赖系统 tar——Windows 开发正常、Linux 部署炸
- ✅ 规则：一律 `node:path`；存储 key posix 风格；打包用 archiver 纯 JS

### P-007 高成本操作未经授权
- ❌ 私自跑生产部署、批量删数据、大文件操作
- ✅ 规则：只给命令由用户执行；smoke test 须标注「smoke test，非正式运行」

### P-008 效果宣称无数据
- ❌ 说「性能提升了」「差不多了」而不给具体数值/验证步骤
- ✅ 规则：结论必须带可复现的验证方式或具体数字

### P-009 证伪路线复活
- ❌ 重新引入已否决方案（Lucia、自写 JWT、Drizzle、public 运行时写、cluster、系统 tar）
- ✅ 规则：见 architecture.md「已证伪路线」，复活须用户明确要求

### P-010 定时任务静默挂掉
- ❌ scheduler 回调抛异常导致 setInterval 停摆，定时发布/备份失效无感知
- ✅ 规则：任务回调 try/catch 全包 + 计日志；register 幂等（globalThis 标记 + NEXT_RUNTIME 守卫）

### P-011 SQLite 并发误用
- ❌ pm2 cluster 多进程写同一 db；备份时直接 cp blog.db（WAL 下不一致）
- ✅ 规则：fork 单实例红线；备份只用 better-sqlite3 `.backup()` API

### P-012 密码文章内容泄露
- ❌ 列表/搜索/RSS/相关推荐的查询投影把密码文 content/excerpt 也查出来了
- ✅ 规则：所有对外查询投影显式排除；搜索只回标题；详情页未解锁前不返回正文

### P-013 模糊措辞
- ❌ 报告/回复用「大概」「应该没问题」「较高的」
- ✅ 规则：给具体数值、文件路径、验证步骤

### P-014 计划外更改不留档
- ❌ 实施中临时改方案（换库、加字段）不落档直接继续
- ✅ 规则：先写入 PLAN.md 变更记录或在回复中说明并获确认，再实施

### P-015 改代码未同步文档
- ❌ 交付前没走 agents-maintenance 触发表，module.md/AGENTS 索引与代码脱节
- ✅ 规则：每次交付前对照触发表逐项更新，回复中列出已同步文档路径

### P-016 Prisma adapter 带入旧版 better-sqlite3
- ❌ 只验证项目直接依赖的 `better-sqlite3@13` 可加载，却漏掉 `@prisma/adapter-better-sqlite3@6.19.3` 自带的 v11；Windows Node 24 构建收集页面时找不到 ABI 137 binding
- ✅ 规则：`main/pnpm-workspace.yaml` 必须保留 adapter 子依赖到 `better-sqlite3@13.0.3` 的 override；安装后用 `pnpm why better-sqlite3` 确认全树只有一个版本，再跑 `pnpm build`
- 📎 案例：M1（2026-08-29），覆盖后 `pnpm why` 仅 v13.0.3，生产构建无 binding 错误

### P-017 Next 16 入口约定与规则文件自动生成
- ❌ 按 Next 15 计划继续创建 `middleware.ts`，或首次 `next dev` 后保留框架自动生成在 `main/` 内的第二套 AGENTS.md/CLAUDE.md
- ✅ 规则：Next 16 统一使用 `src/proxy.ts` 导出 `proxy`；`next.config.ts` 保留 `agentRules:false`，项目规则只认根目录 AGENTS.md/CLAUDE.md
- 📎 案例：M1（2026-08-29）

### P-018 未消毒前渲染 MDX 正文
- ❌ 把数据库里的 MDX/`content` 直接当 HTML 输出，或用 `dangerouslySetInnerHTML` 渲染未过 `lib/markdown/sanitize.ts` 的内容
- ✅ 规则：正文必须走 remark-gfm → rehype-slug → rehype-sanitize → shiki；当前 `PostBody` 只展示 excerpt 占位。密码文任何投影不得带 content/excerpt（P-012）
- 📎 案例：M2 骨架（2026-08-29）有意不渲染正文；探针文 slug=`sanitize-probe`

### P-019 整包拷贝 theme-hao CSS
- ❌ 把 `reference/theme-hao/templates/assets/zhheo/zhheoblog.css`（约 1.8 万行，含 PJAX/弹幕/播放器）拷进 `globals.css`
- ✅ 规则：只抽 `--heo-*` token 与需要的玻璃/卡片/波浪规则，写进 `main/src/app/globals.css`；`reference/` 只读

### P-020 rehype-sanitize 不会自动安全放行 MDX JSX
- ❌ 只在 sanitize schema 写入 `Video`，或把 `<Video {...props}>` 直接映射到 DOM；MDX JSX 节点可能被静默删除，也可能让未审计属性绕过普通 HAST 白名单
- ✅ 规则：`lib/markdown/sanitize.ts` 只把字面量、属性白名单内的 `<Video>` 转成标准 `video` HAST，再过 rehype-sanitize；组件禁止展开未知 props；next-mdx-remote 保持 `blockJS:true`
- 📎 案例：M2（2026-08-29），`sanitize-probe` 同时覆盖 script、onerror、javascript:、Video

### P-021 vendor 源码不要交给应用 tsc 严查
- ❌ 把 mdx-editor vendor 的 `.ts/.tsx` 纳入项目 `tsc --noEmit`，mdast/MDX 类型与上游 Vite 配置不一致会炸出上百条错误；或给每个文件加 `// @ts-nocheck`
- ✅ 规则：`tsconfig.json` `exclude` `src/editor`；应用只从 `@myblog/mdx-editor` 导入，类型在 `src/types/mdx-editor.d.ts`。`next.config.ts` 的 Turbopack `resolveAlias` 必须用**项目相对路径**（Windows 上绝对路径 `D:\...` 会报 `windows imports are not implemented yet`）
- 📎 案例：M3（2026-08-29）

### P-022 Next 不允许从组件树 import 全局 CSS
- ❌ 保留 vendor `index.ts` 里的 `import './styles/globals.css'` → Next build 拒绝非 layout 的 global CSS
- ✅ 规则：删掉 vendor 入口的全局 CSS import，改由 `app/admin/(protected)/layout.tsx` 引入 `@/editor/styles/globals.css`。ui.module.css 的 postcss-mixins 在入库时一次性展开，不要塞进 Tailwind 4 的全局 PostCSS
- 📎 案例：M3（2026-08-29）

### P-023 评论蜜罐与 pending 隔离
- ❌ 蜜罐字段非空时返回 400 暴露字段；或游客评论直接 `approved`；或用 `dangerouslySetInnerHTML` 渲染评论/昵称
- ✅ 规则：蜜罐非空仍 200 且不落库；游客一律 `pending`；管理员回复才直接 `approved`；评论链路只走 React 文本节点（`lib/comments/service.ts` + `components/comment/`）
- 📎 案例：M4（2026-08-29）

### P-024 搜索 LIKE 必须转义通配符
- ❌ 把用户输入直接塞进 `LIKE %q%` 或 Prisma `contains`，`%`/`_`/`\` 会扩大命中面；或把原生 SQL 写在 `lib/search` 以外
- ✅ 规则：只在 `lib/search/service.ts` 用 Prisma.sql；先 `escapeLike()` 再 `LIKE ${pattern} ESCAPE char(92)`；密码文只匹配 `title`，结果不含 content
- 📎 案例：M5（2026-08-29）

### P-025 首页 Banner 滚动不要带动背景图
- ❌ 给 Banner 图 `transform: translateY(-scroll)` 或让它随文档流一起上移；或用不透明 `--heo-background` 盖死底图
- ✅ 规则：底图 `position:fixed`；模糊与幕布只用 `--home-blur` / `--home-veil`（幕布颜色跟主题 `--heo-background`，JS 最大透明度 0.28，CSS mask 让视口上部更透）；欢迎卡单独 `isolation`，Banner 遮罩底部淡出，避免 100vh 接缝穿玻璃卡。滚动模糊加在包装层上，不要写在入场 animation 的 `filter` 上（fill-mode:both 会盖掉 CSS 变量）
- 📎 案例：M5（2026-08-29）；M6 把幕布上限从 0.62 调到 0.28 并修欢迎卡接缝

### P-026 备份只用 .backup() 且文件名白名单
- ❌ 直接 `copyFile(blog.db)` / 打包 WAL；或把用户传入的文件名拼进 `data/backups` 路径；或绕过 StorageDriver 扫 `data/uploads`
- ✅ 规则：快照走 `getSqliteHandle().backup()`；下载/删除文件名必须 `isBackupFileName()`（`^myblog-\d{8}-\d{6}\.tar\.gz$`）且 resolve 后仍在 `data/backups` 内；上传对象只经 `StorageDriver.listKeys` / `openReadStream`；并发用进程内锁，冲突 409
- 📎 案例：M6（2026-08-29）

### P-027 写文章工具栏被当成侧栏
- ❌ 给 `.admin-mdx-editor` 设 `display:flex`（默认 row）再写 `> * { height: 100% }`，工具栏和正文并排，控制栏能占掉右栏约 1/3
- ✅ 规则：编辑器根节点必须 `flex-direction:column`，并加 vendor 的 `mdxeditor-full-height`；工具栏 `flex:0 0 auto`，正文区域 `flex:1; min-height:0; overflow:auto`。不要让工具栏子节点被迫拉满高度
- 📎 案例：M7 打磨（2026-08-29）

### P-028 正文视频必须是可编辑的 Video 节点
- ❌ 用 `insertMarkdown('<Video src=... />')` 插入后只渲染一个不能改的 `<video>`；或把 HTML `<video>` / `![](*.mp4)` 原样存库，jsxPlugin 解析失败后无法更换
- ✅ 规则：插入走 `insertJsx$`；`VideoJsxEditor` 必须提供更换/删除；读写都过 `lib/posts/normalize-content.ts`，把 HTML video 与视频图片语法归一成 `<Video />`。不要改 vendor 去「升级」视频能力
- 📎 案例：M7 打磨（2026-08-29）

### P-029 编辑器深色主题不要改 vendor
- ❌ 深色站点下 mdx-editor 仍用浅色 `--baseBg` / `--baseTextContrast`（近黑字 + 白工具栏）；或去改 `src/editor/styles` 换肤
- ✅ 规则：vendor 冻结。在 `admin.css` 用 `[data-theme="dark"] .admin-mdx-editor`（及 popup/select）覆盖 `--base*` / `--slate-*`，让工具栏与正文跟 Heo 深色 token。不要给 html 乱加 `.dark` 以免波及前台
- 📎 案例：M7 打磨（2026-08-29）

### P-030 不要重写编辑器，先修预览样式
- ❌ 标题看起来一样大就换一套编辑器，或把正文当成 textarea；Tailwind preflight 会把 h1–h6 `font-size:inherit`
- ✅ 规则：继续只用 `EditorLoader`。标题字号写在 `.admin-mdx-prose h1–h6`。成稿预览走 `/api/admin/preview`，HTML 必须先过 `renderMdx`/`sanitize`。图片视频拖动写在应用层 toolbar/VideoJsxEditor，不改 vendor
- 📎 案例：M7 打磨（2026-08-29）

### P-031 目录必须收齐编辑器各级标题
- ❌ TOC 只收集 h2–h4；编辑器工具栏「标题 1」导出为 `#` / `h1`，侧栏就显示「本文没有小节」
- ✅ 规则：`lib/markdown/toc.ts` 收集 h1–h6；`Toc` 按 depth 缩进/字重分层，点击 `scrollIntoView({behavior:'smooth'})`。不要再平行写一套 tocbot
- 📎 案例：M7 打磨（2026-08-29）

### P-032 媒体插入不要做工具栏内下拉
- ❌ 图片/视频「上传或外链」用 `position:absolute` 挂在工具栏里；`.admin-mdx-editor` 的 `overflow:hidden` 和正文会把菜单挡住
- ✅ 规则：对齐 WordPress/Halo 的插入框——`MediaInsertMenu` 用 `createPortal` 挂到 `document.body`，`z-index:220`。不要平行重写编辑器（P-030）
- 📎 案例：M7 打磨（2026-08-29）

### P-033 后台分栏滚动与收起按钮
- ❌ 后台 `min-height:100vh` 却不锁视口，整页连 footer 一起滚，左侧栏/设置栏跟着动；或把「收起栏目 / 收起设置」文字按钮放在栏底
- ✅ 规则：桌面用 `html:has(.admin-workspace)` 锁 `overflow` 并藏 footer；`.admin-workspace` 定高 `calc(100vh - navbar)`；各栏自己 `overflow` + `overscroll-behavior:contain`。收起只用 `.admin-pane-toggle` 放在该栏右上角，chevron 图标，文字走 `title` / `.visually-hidden`
- 📎 案例：M7 打磨（2026-08-30）

### P-034 自定义模块代码是管理员内容面，别扩散
- ❌ 把 `HomeModule.html/css/js` 的「直接注入」当成通用能力，顺手用到评论、昵称或正文管线；或反过来因为怕 XSS 就给这条路加 sanitize，把管理员写的布局代码剥空
- ✅ 规则：`html/css/js` 只有 `requireAdmin` 能写，各 32KB 上限，按用户决策**不过** sanitize，等价于管理员可以 XSS 自己的站。评论/昵称仍纯文本禁 `dangerouslySetInnerHTML`，正文仍过 `lib/markdown/sanitize.ts`。JS 只能由 `CustomModuleRuntime` 用 `createElement('script')` 执行并包 `try/catch`（`innerHTML` 里的 script 不会跑）。若以后收紧 CSP 的 `script-src`，这些 JS 会一起失效
- 📎 案例：M8 首页模块化（2026-08-30）

### P-035 改首页不要再往 page.tsx 堆 JSX
- ❌ 想加一块首页内容就直接在 `src/app/page.tsx` 或 `HomeGrid` 里写死一段 JSX，绕过模块目录
- ✅ 规则：`page.tsx` 只负责取布局 + 渲染 `HomeGrid`。加内容的顺序是：`/admin/modules` 建/改模块 → 放积木或代码 → `/admin/home` 入格。新内置模块必须同时登记 `lib/home/builtins.ts` 与 `HomeModuleRenderer`
- 📎 案例：M8 首页模块化（2026-08-30）

### P-036 格点写 CSS 变量，别写 inline grid-column
- ❌ 把 `gridColumn: "3 / span 6"` 直接写进格子的 `style`；手机端媒体查询压不成单列，inline 样式永远赢
- ✅ 规则：`lib/home/grid.ts` 只输出 `--cell-col` / `--cell-col-span` / `--cell-row`，真正的 `grid-column` 写在 `globals.css` 里，窄屏媒体查询才能覆盖。左侧留白是第 1 条轨道，所以 `--cell-col = col + 1`。满宽出血用 `grid-column: 1 / -1`，不要用 `100vw`（会带出横向滚动条）
- 📎 案例：M8 首页模块化（2026-08-30）

### P-037 别用 CSS Grid 行跨越做侧栏那一列
- ❌ 让「文章卡」跨 5 行、右侧 5 个 widget 各占 1 行：CSS Grid 会把跨行元素多出来的高度平均摊给它跨过的每一行，widget 之间被撑出两三百像素空隙
- ✅ 规则：`HomePlacement.rowSpan` 恒为 1。纵向高度用「同格堆叠」表达——`(row, col, colSpan)` 相同的模块归成一个 `HomeArea` 纵向排列（`lib/home/types.ts` 的 `toAreas()`）。同行横向重叠时被压住的格子整体下移一行，前台与后台画布共用同一个函数
- 📎 案例：M8 首页模块化（2026-08-30）

### P-038 恢复备份不要在连库时覆盖 blog.db
- ❌ 后台点「恢复」就立刻 `copyFile` 覆盖正在被 Prisma 打开的 `blog.db`；或用系统 `tar` 解包；或把包内任意路径写进 `data/uploads`；或 CLI 脚本 `import "@/lib/db"` 导致先连上旧库
- ✅ 规则：运行中只允许写 `restore-pending.json`，真正换库在 `instrumentation.ts` 里、`initializeApplication()` 之前，且必须 `restartAt` 已到期。点「恢复」不得立刻 `process.exit`。到点或点「立刻重启」才由 `lib/backup/restart.ts` 退出。有 pm2 / systemd（`INVOCATION_ID`）只退出，由守护拉起。否则 `scripts/relaunch-app.cjs` 用 `node node_modules/next/dist/bin/next` 拉起。Windows 禁止 `spawn(node, {detached:true})`（会弹出 cmd，关掉窗口服务就停），改用 `wscript` + `Run ..., 0, False` 隐藏启动。Linux 仍 detached。日志写 `data/relaunch.log`。停服换机恢复仍走 `pnpm restore`。解包只用纯 JS（`lib/backup/tar.ts`），只收 `blog.db` 与 `uploads/<合法 Storage key>`。上传先 `StorageDriver.delete` 再 `put`。换库后删 `-wal`/`-shm`。路径解析走 `lib/db-path.ts`，不得为了恢复去 import Prisma。重启前 `disconnectDatabase()` 松开文件锁。
- 📎 案例：一键恢复（2026-08-30）

### P-039 备份拆分密钥与管理员账号都不要硬编码
- ❌ 把完整 DEK 明文放进备份包 `key`（只拿文件就能解）；或静默生成弱密钥；或做后台「改备份口令」；或代码里写死 `admin`/`password`
- ✅ 规则：DEK = 主机半钥 XOR 包内半钥。备份口令在后台「备份」页交互设定一次（或 `pnpm setup`），经 scrypt 写入 `data/backup-host-secret.json`，设定后不可改。加密包只有 `meta.json` + `half` + `payload.enc`。`BackupSecret` 只存 `SHA-256(DEK)`。无半钥文件则拒绝**加密**备份，非加密备份仍可做。后台恢复加密包先 `requireAdmin` 再比对哈希。换机用 `pnpm restore --passphrase`。v1 旧包只读兼容。bootstrap 无管理员时告警打开 `/admin/setup` 或执行 `pnpm setup`。CLI 停服读哈希用 `lib/backup/secrets-read.ts` 的参数化 better-sqlite3。
- 📎 案例：拆分密钥备份（2026-08-30）；加密可开关（2026-09-04）

### P-040 主题防闪烁不要在 layout 里写 script
- ❌ 在 `src/app/layout.tsx` 的 `<head>` 里放 `<script dangerouslySetInnerHTML>`。React 19 / Next 16 客户端渲染组件树时不会执行这段脚本，开发态会报 `Encountered a script tag while rendering React component`（后台 client 页更明显）
- ✅ 规则：防闪烁脚本只由 `components/layout/ThemeInit.tsx` 用 `useServerInsertedHTML` 注入；Next 会把它插到 `</head>` 前，浏览器照常执行，React 树里没有 `<script>`。不要用 `next/script` 的 `beforeInteractive` 做这件事（它改成 `__next_s` 队列，首屏前跑不了）。不要为了消警告去装 `next-themes` / 滤 `console.error`
- 📎 案例：M7 打磨（2026-08-30），后台 Console Error 指向 RootLayout:38

### P-041 备份加密可开关，明文与加密同等能力
- ❌ 把非加密备份做成 5 分钟临时包、禁止上 COS、不进列表；或 COS 已是 HTTPS 时仍强制加密且不许关掉
- ✅ 规则：后台「备份」页可随时开关加密（`PUT /api/admin/backup/encrypt`，Setting `backupEncrypt`，不进默认表、用户未手设则不算已存储）。关加密时仍走 `runBackup()`：落盘、列表、下载、恢复、周期备份、COS 私有 `backups/`。COS 访问域名为 HTTPS 且用户未手设时默认关加密（`lib/backup/encrypt-policy.ts`）。打开加密必须已有备份口令。包内 `meta.json` 带 `channel`/`version`。上传的备份进列表管理，滚动清理不删 `myblog-import-*`。历史 ephemeral 包只由 `purgeExpiredPlainBackups()` 收拾。
- 📎 案例：非加密临时备份（2026-08-30）；加密可开关（2026-09-04）

### P-042 普通用户能调的都进后台面板
- ❌ 把备份口令、恢复重启、周期备份之类用户自己能搞定的事只做成 CLI / 改 `.env` / 改源码
- ✅ 规则：普通用户有能力调整的措施都做到后台面板里，留给用户充足的自定义空间。CLI / 环境变量只留给 `pnpm setup`、停服换机恢复、部署等面板做不到或不该做的事
- 📎 案例：应用内重启恢复 + 面板优先原则（2026-08-30）

### P-043 画布拖动不要把 pointer capture 绑在会被卸掉的手柄上
- ❌ 拖动手柄 `setPointerCapture` 后，预览态把该模块换成幽灵格，手柄卸载，后续 `pointermove`/`pointerup` 丢失，模块卡在半空
- ✅ 规则：落点预览会卸掉被拖模块的原节点。捕获必须挂在始终存在的画布（`canvasRef.setPointerCapture`），拖动尺寸放进 state，不要只读 `dragRef.current` 做渲染
- 📎 案例：首页管理拖动让位（2026-08-30）

### P-044 后台动效与字号只走 `--admin-*`
- ❌ 后台侧栏/折叠/弹窗再写 340ms、360ms 或自造 ease；顶栏和页面 h2 都写「管理后台」抢标题；危险说明用灰色正文
- ✅ 规则：时长只用 `--admin-fast/mid/slow`（160/220/280ms）和 `--admin-ease`（现为 `cubic-bezier(0.16, 1, 0.3, 1)`）。字号走 `--admin-title/heading/body`（现 21/17/15）。非编辑页顶栏由 `AdminWorkspace` 按路径出当前页标题，页面内 h2 只写分组名。切页时顶栏只做标题透明度交叉渐变。删除/覆盖/重启等必须用 `.admin-danger`。普通 `.admin-card` hover 不要位移；统计卡与 `.admin-card--hover` 允许 `translateY(-3px)`。`.admin-stagger` 入场 460ms 是唯一允许超 280ms 的地方；超调弹簧只给弹窗 pop
- 📎 案例：后台 UI 重做（2026-08-30）

### P-045 强制改密必须拦 API 不只拦页面
- ❌ 只在 `/admin/(protected)/layout` 画改账号表，`requireAdmin()` 不看 `mustChangeCredentials`，登录后直接打 `/api/admin/posts` 或恢复备份
- ✅ 规则：`requireAdmin()` 默认拒绝未改初始密码的会话（403 `CREDENTIALS_CHANGE_REQUIRED`）。只有 `/api/admin/account` 传 `{ allowMustChange: true }`。判定走 `lib/auth/must-change.ts`，不要从 guard import account（会和 `admin/http` 循环）
- 📎 案例：M7 安全复查（2026-08-30）

### P-046 客户端 IP 不要信 X-Forwarded-For 第一跳
- ❌ `getClientIp` 取 `x-forwarded-for` 的第一个地址。客户端可以随便填，登录/评论/搜索/解锁限速全部失效
- ✅ 规则：优先 `x-real-ip`（nginx 必须用 `$remote_addr` **覆盖**写入），再 `cf-connecting-ip`，再 XFF **最后一跳**；非法字符直接丢弃。生产反代必须覆盖 `X-Real-IP`
- 📎 案例：M7 安全复查（2026-08-30）

### P-047 密码文评论未解锁不得外泄
- ❌ 页面藏了评论区，但 `GET /api/comments?targetType=post&targetId=` 仍回 approved 树，讨论内容等于把密码文剧透出去
- ✅ 规则：`listApprovedComments` 对未解锁密码文返回空列表；游客 `POST` 回 401 `LOCKED`。管理员审核/回复不受影响
- 📎 案例：M7 安全复查（2026-08-30）

### P-048 公开缓存不得装密码正文
- ❌ 用 `unstable_cache` 包 `getPublishedPostContent(slug, true)`，解锁后的正文进共享缓存，别人打开同一 slug 就能读
- ✅ 规则：只缓存列表/meta/分类标签/首页格点/`sitemap`/`rss`。`getPublishedPostContent` 禁止进 `cachedPublic`。密码文页继续 `noStore()`。写成功走 `revalidateTag`（`lib/cache/public.ts` 的 `PUBLIC_CACHE_TAGS`）
- 📎 案例：M7 缓存（2026-08-30）

### P-049 COS 密钥与原图路径
- ❌ 把 SecretId/SecretKey 写进仓库或 `getPublicSettings`；经 `/api/uploads` 反代 COS 原图/视频字节；把明文备份上传 COS
- ✅ 规则：凭证只进后台 Setting，GET 不回显 SecretId/SecretKey（只给 `cosSecretIdSet`/`cosSecretKeySet`）。原图/音视频/访客 thumb 走 COS 公网 URL，不反代。备份（加密或明文）上 `backups/`（私有）。媒体库迁移 HEAD 已存在则跳过。产品是腾讯云 COS，不要接阿里云 OSS SDK
- 📎 案例：COS 接入（2026-08-30）；媒体目录与访客 thumb 改走 COS（2026-08-30）

### P-050 媒体分片目录与文章 publicId
- ❌ 把同一类文件全摊在一层目录；访客 thumb 继续走 `/api/uploads/...-thumb`；新文章链接仍拼 `/posts/${slug}`；重生成缩略图直接 `driver.get(row.key)` 从 COS 拉整份原图
- ✅ 规则：本地与 COS 同一套 `images|videos|audio/.../{hh}/{hash}.*`（`lib/storage/media-keys.ts`）。缩略图按 Upload 元数据先本地后 COS 取源。前台链接只走 `postHref()`（`/posts/{8 位 base62}/{slug|article}`）；旧 `/posts/{slug}` 301。解锁 cookie 绑 `publicId`
- 📎 案例：媒体目录与文章 URL（2026-08-30）

### P-051 二级缩略图只本地、hash 定址
- ❌ 把二级缩略图上传 COS；把 `thumb2` URL 写进 `Moment.images` JSON；`isThumbKey` 用 `startsWith("images/thumbs/")` 误伤 `thumbs2`；重生改文件名导致首页/瞬间 404
- ✅ 规则：路径固定 `images/thumbs2/{hh}/{hash}.webp`（`thumb2MediaKey`），只 `LocalDriver.put`。瞬间 JSON 仍只存原图 key。解析走 `resolveThumb2Src`，本地没有文件则回退一级 thumb。`thumbs2` 不要标 immutable。媒体库「重新生成二级缩略图」先删再写同名文件
- 📎 案例：瞬间首页模块（2026-08-30）

### P-052 媒体库删除与查看
- ❌ 只删库记录或只删 `row.key`；关联文章直接 409 不给警告就走；打开媒体库就 List 整个 COS 桶；查看路径不带体积
- ✅ 规则：默认删除走 `keysForDelete`（本地原图 + 一级/二级 thumb + COS）。`keepCos` 只删本地、留记录。引用检查只用于面板警告，不再拦截删除。查看只 `stat` 已知 key。上传进度走 XHR，不新开依赖
- 📎 案例：媒体库删除菜单 / 路径查看 / 库内上传（2026-08-30）

### P-053 盒子决定内容，双套几何
- ❌ 手机端把格子改成 `height: auto`，图片 `height: auto + aspect-ratio` 把模块撑成超长条；只存一套 `col/colSpan`；用视口 `max-width` 判断模块内部排布（后台手机画框对不上）；横屏只看宽度误走电脑 12 列
- ✅ 规则：固定格用 `hPct * --h-unit` 锁高，内部 `object-fit` / `@container`；电脑/手机两套几何写在 `HomePlacement`；走手机套条件与 `LAYOUT_PHONE_MEDIA` 一致（含 `(hover: none) and (max-height: 540px)`）；格点只写 `--cell-*` / `--m-cell-*`。侧栏走手机套时下沉，禁止 `display: none`
- 📎 案例：首页双视口自适应（2026-08-30）

### P-054 手机拆格后格子必须自己叠层
- ❌ 走手机套时 `home-grid__area { display: contents }`，格子变成根栅格子元素，父级 `z-index: 2` 失效；公告/站点/分类/标签等 hug widget 是 `position: static`，沉到 Banner 的 `position: fixed` 底图下面——DevTools 里有盒子，画面上空白
- ✅ 规则：`.home-grid__cell` 写 `position: relative; z-index: 1`，不依赖 area 的层叠。文章卡靠 `position: relative`、欢迎卡靠 `isolation` 才没中招，不能当通用解
- 📎 案例：首页双视口自适应跟进（2026-08-30）

### P-055 版本角标与备份版本只走 release.ts
- ❌ 在页脚/后台随手写死「v0.1」或各写一套文案；备份列表不标版本
- ✅ 规则：频道与展示文案只出自 `lib/release.ts`（当前 `APP_CHANNEL=alpha`、`APP_VERSION=0.1.2`、标签「0.1.2」）。前台页脚左下角 `ReleaseMark`，后台侧栏左下角同一文案。备份包 `meta.json` 写入 channel/version，列表展示 `backupReleaseLabel()`。改版本号只改这一处。**但发版时还有三处必须同步**：`main/package.json` 的 `version`、`release.test.ts` 与 `backup/inspect.test.ts` 里断言具体版本号的用例（不同步 = `pnpm test` 直接红）；`AGENTS.md` §6 的状态摘要也必须带上新版本号，否则 `pnpm doc:check` 报「发行号无单源」。
- 📎 案例：备份加密开关与 Alpha 角标（2026-09-04）

### P-056 上传分两步，超 10MB 图片先压再当原图
- ❌ 一上传就生成 thumb/上 COS，或直接 413「文件不能超过 10 MB」；发布不等传输结束；灯箱直接换原图导致尺寸跳变
- ✅ 规则：`POST /api/upload` 只把原图写入本地。图片 >10MB 先弹出「继续会压缩至 10MB 以下」，压缩保持原格式，结果即原图（进站上限 50MB）。写文章/瞬间传 `{ defer: true }`，点发布后才 `POST /api/admin/uploads/finalize`（`derivatives` 然后 `replicate`）。进度只走 `TransferHud`，发布前 `hasActiveTransfers()` 必须为空。灯箱用缩略图做模糊底，原图加载完再约 1s 变清晰，框尺寸用同一套 contain 盒子。关闭灯箱不要 `revokeObjectURL`，原图 blob 挂在 `Lightbox` 模块级 LRU（最多 6 张）。
- 📎 案例：文章插图超 10MB 报错与发布后处理（2026-09-04）

### P-057 灯箱缩放只走 Lightbox，禁止引入手势库
- ❌ 为滚轮/双指放大再装 `pinch-zoom` / `react-zoom-pan-pinch`；或把缩放绑在 `<img>` 的浏览器默认手势上导致整页跟着放大
- ✅ 规则：缩放数学只走 `lib/client/lightbox-zoom.ts`（`zoomAtPoint` / `applyPinch` / `containScale`）；事件挂在灯箱视口，`touch-action: none` + 非 passive `wheel`/`touch`/`gesture*` `preventDefault`。舞台 CSS 尺寸必须是原图 `naturalWidth/Height`，用 `transform: scale` 装进视口；禁止把原图 `object-fit` 进缩略图那么大的盒子（放大后仍是缩略图像素）。适配倍率到 8× 适配；缩回适配倍率必须 `fitCentered` 回正中。放大后单指/鼠标拖平移。
- 📎 案例：查看原图滚轮与双指放大（2026-09-04）

### P-058 所有评论默认收起
- ❌ 只给瞬间折叠、文章/留言板保持展开；或再写一套评论组件
- ✅ 规则：`CommentSection` 默认 `collapsible=true`。文章页、瞬间、留言板都要点「评论 n」才展开。不要再给文章/留言板做展开特例。
- 📎 案例：评论栏统一收起（2026-09-04）

### P-059 文章阅读侧栏默认只显示目录
- ❌ 给所有带 `Sidebar` 的列表页也收起公告/统计，或平行再写一套阅读页 widget
- ✅ 规则：只有文章详情 `Sidebar reading` 走 `PostSidebar`；默认只显示目录，右侧按钮展开其余卡片。列表/分类/标签/归档保持全展开。widget 仍来自 `components/widgets/*`。
- 📎 案例：文章阅读侧栏收起（2026-09-04）

### P-060 首页大图加载进度只走 TransferHud
- ❌ 为首页 Banner 再做一条顶栏进度条；或加载一开始就弹出 HUD；或满格后停在「完成」不关
- ✅ 规则：解码超过 2 秒（`HOME_LOAD_REVEAL_MS`）才 `beginTransfer` 进现有 `TransferHud`；2 秒内完成则不显示。就绪 `finishHomeLoad()`，满格后 HUD 自动关掉。后台 `/admin/home` 画布传 `trackLoad={false}`。仅首页任务时标题为「加载进度」。
- 📎 案例：首页加载进度（2026-09-04）

### P-061 next/image 透传 loader 不要拼 width
- ❌ 为消 `next-image-missing-loader-width` 往 COS/Bing URL 加 `?w=`；或让 Next 默认优化器再压一遍已生成的 thumb
- ✅ 规则：缩略图/封面/Banner 已是最终地址。`next.config.ts` 里 `images.unoptimized=true` + `image-loader.ts` 原样返回 `src`。腾讯云 COS 查询参数可能触发数据万象处理。
- 📎 案例：首页 Banner / CoverMedia 控制台告警（2026-09-04）

### P-062 站点运行时间只走 uptime 模块
- ❌ 把运行时间写进 `src/app/page.tsx` / `Footer`；或把开始时间做成 env / 源码常量；或 `siteStartedAt` 为空仍占一块空白格
- ✅ 规则：内置 `uptime` 登记 `lib/home/builtins.ts` + `HomeModuleRenderer`。开始时间只进 Setting KV `siteStartedAt`（三处同步，见 P-004），并进入 `getPublicSettings`。启用时由 Footer 在版本信息行中间复用模块组件；空或解析失败则不渲染。后台画布显示「未设置开始时间，前台不显示」。计时精确到秒，走 `lib/home/uptime.ts`。
- 📎 案例：首页底部版本信息栏运行时间（2026-09-06）

### P-063 写文章左栏折叠卡片不要被 Grid 撑成方块
- ❌ `.post-workspace__rail-body` 用 CSS Grid 且默认 stretch，收起后的 `admin-fold` 仍被拉满剩余高度，看起来像大方块
- ✅ 规则：左栏 `align-content: start` + `grid-auto-rows: min-content`；卡片 `align-self: start`。收起后只留标题行（`.admin-fold__head`），内容区 `grid-template-rows: 0fr` + `overflow: hidden`
- 📎 案例：写文章设置卡片收起（2026-09-04）

### P-064 程序更新只走 boot.cjs，禁止覆盖 data/.env
- ❌ 在 `instrumentation.ts` 里覆盖 `src/`（Next 已加载）；把更新做成备份恢复的变体去换 `blog.db`；更新包打进 `data/`、`.env`、`node_modules/`、`.next/`；残缺小包当完整程序导致 overlay 掏空 `src/`；与预约恢复同时挂；生产构建不限堆内存
- ✅ 规则：`pnpm dev` / `pnpm start` / pm2 / relaunch 一律 `scripts/boot.cjs`，在 `require` Next 之前 `applyPendingUpdate()`。`boot.cjs` 用 `node tsx/cli` 跑 TypeScript，**禁止顶层 await**（tsx 会按 CJS 编译，启动直接炸）；脚本写成 `async function main()`，与 `pnpm restore` / `pnpm setup` 相同。包格式见 [app-update-spec.md](app-update-spec.md)：`kind:app-update`，**拒绝名单**打包（禁止再维护一份允许的根文件清单），必须有 `package.json` + `src/`。覆盖时包内出现过的顶层目录会删包里没有的文件；`data/` 与 `.env` 不动。预约更新与预约恢复互斥。正规包须为完整 `src/` 树。Windows 上正在跑的 `boot.cjs` 覆盖失败记日志即可。生产 `next build` 用 `NODE_OPTIONS=--max-old-space-size=768`，失败拷回 `.next.bak`。开发 `dev` 不构建。
- 📎 案例：M9 程序更新（2026-09-04）

### P-065 发版只换更新包，禁止上传 Windows 依赖
- ❌ 每个版本去改 `install.sh` / 环境变量模板；scp 整仓或 Windows 的 `node_modules` / `.next`（Linux 上 sharp、better-sqlite3 对不上）；首装跑 `pnpm db:seed`
- ✅ 规则：空机只解压 `pnpm pack:update` 的 tar.gz，跑一次 [`scripts/install.sh`](../main/scripts/install.sh)。以后升级只导新包：后台 `/admin/updates` 或 `pnpm apply-update --file`，然后 pm2 重启，由 `boot.cjs` 覆盖。1GB 机器构建前加 swap。详见 [linux-deploy-spec.md](linux-deploy-spec.md)
- 📎 案例：Linux 精简安装（2026-09-04）

### P-066 更新包用拒绝名单；GitHub 只点检查；站点名禁止默认 MyBlog
- ❌ 再维护一份「允许打进包的根文件」清单，导致 `main/` 下新目录打不进更新包；scheduler 轮询 GitHub Releases；把空 `siteName` 回退成 MyBlog；把创建管理员做成未授权开放接口
- ✅ 规则：打包遍历 `main/`，只拒绝 `data/`、`.env*`、`node_modules/`、`.next/`、`.git/`、`coverage/`、测试文件与路径穿越。overlay 按包内**顶层目录**同步删除，不删包外顶层散文件。GitHub 仓库写在 Setting `updateGithubRepo`，只在后台「更新」点检查时请求公开 Releases，资产名必须 `myblog-update-*.tar.gz`。`siteName` 默认空，创建站点页 / `pnpm setup` 手填；未创建完成前公开标题用中性「博客」。`POST /api/auth/setup` 仅当零管理员时可写：无半钥走完整初始化，有半钥只补建管理员，与登录同套 CSRF/限速
- 📎 案例：0.1 发行（2026-09-04）

---

### P-067 时间型 Client 组件首屏必须使用确定性初始值
- ❌ 在 SSR 的 Client Component 首次渲染中直接用 `Date.now()` / `Math.random()` 初始化展示文本，服务端与客户端值不同会触发 hydration mismatch
- ✅ 规则：首轮渲染使用来自 props 的稳定快照或确定性占位值；组件挂载后再通过 `useEffect` 启动实时数据更新。运行时间模块以 `startedAt` 作为首轮 `now`，挂载后再每秒刷新
- 📎 案例：首页运行时间 hydration mismatch（2026-09-06）

### P-068 破坏性清理不能只靠前端倒计时，也不能误删配置
- ❌ 只在浏览器端等待 15 秒；把倒计时当成安全边界；直接覆盖/删除正在使用的 `blog.db`；把 `Setting`、首页模块、主机半钥或非本站 COS 数据一并删掉；清理确认期间仍让备份创建并发写入
- ✅ 规则：`/api/admin/update/clear` 用当前管理员绑定的一次性内存令牌，服务端以 `executeAt` 强制至少 15 秒，DELETE 才能撤销；按「删除数据 / 删除管理员账号」严格分支清理，数据库只用 Prisma 事务，文件只走 StorageDriver 与既有备份/更新 helper；包含 `data` 的待确认操作要阻止新备份，COS 桶按本站专用约定使用。UI 的红色进度条只是提示，不能代替服务端校验
- 📎 案例：更新页一键数据清理（2026-09-06）

---

### P-069 已有主机半钥时网页只能补建管理员
- ❌ 为了让清理管理员后的创建页可用而放宽 `runInitialSetup()`，或接受客户端传入的恢复模式并重新生成/覆盖主机半钥
- ✅ 规则：服务端根据实时状态分派：零管理员且无半钥才走完整初始化；零管理员且已有半钥只调用 `createAdminForExistingSite()` 创建账号，保留 Setting、首页布局与不可更改的备份口令；CSRF、限速与零管理员检查不能省略
- 📎 案例：清空管理员后网页直接重建账号（2026-09-06）

### P-070 后台样式只进 admin.css，不得重定义前台共享类
- ❌ 在 `admin.css` 里重写 `.heo-button` / `.form-field` / `.heo-card`，或把 `--admin-*` token 整块搬出 `globals.css`
- ✅ 规则：后台新基元用 `.admin-btn` / `.admin-field` / `.admin-card` / `.admin-list`；`--admin-danger` / `--admin-ease` 必须留在 `globals.css`（前台 TransferHud 依赖）
- 📎 案例：后台 UI 重写（2026-09-11）

### P-071 motion 只许在后台 client 组件
- ❌ 在 `src/components/home/`、`src/components/layout/` 或根 `layout.tsx` 里 `import` motion；不用 `LazyMotion` 把完整 feature bundle 打进后台首屏
- ✅ 规则：`from "motion` 路径白名单只有 `src/components/admin/`；`AdminMotion` 用 `LazyMotion` + `domAnimation` + `m.*`；时长仍受 P-044 的 280ms 约束
- 📎 案例：后台 UI 重写（2026-09-11）

### P-072 后台表格必须双形态，不许横滑糊弄竖屏
- ❌ 窄屏给 `.admin-table` 加 `overflow-x: auto`；或服务端渲染两套列表结构
- ✅ 规则：同一套 DOM（`.admin-list`）桌面 CSS Grid 表格、手机卡片，字段用 `data-label`
- 📎 案例：后台 UI 重写（2026-09-11）

### P-073 写文章手机设置 sheet 不要复用桌面收起状态
- ❌ 竖屏「设置」打开底部 sheet 后，右上角 chevron 仍 `setSettingsOpen`；`is-sheet` 的 CSS 盖掉 `is-collapsed`，看起来点了没反应，也关不掉 sheet
- ✅ 规则：手机 sheet 的箭头 / 背板 / Escape 只 `setSheetOpen(false)`。桌面 chevron 才切换左栏折叠。背板必须 `position: fixed` 且 z-index 低于 sheet。窄屏工具栏必须全部可见：用 `.admin-mdx-toolbar-break` 分成两行整齐换行，禁止 `max-height` + `overflow:hidden` 把按钮裁掉，也不要藏滚动条的单行横滑
- 📎 案例：竖屏写文章设置退不回去（2026-09-11）

### P-074 数据清理弹窗保持独立圆角卡片，进度条贴底
- ❌ 把 `DataClearDialog` 套进通用 `AdminDialog` 手机 sheet（底边直角、内边距把红色进度条托离底边）；或让确认输入框吃到 Tailwind preflight 的 `border-radius: 0`
- ✅ 规则：清理弹窗继续用 `.admin-clear-backdrop` + `.admin-clear-dialog` 三行网格（头 / 正文 / 进度），四角圆角；进度条是最后一行、半径跟卡片底角对齐。不要并进 768px 的 sheet 覆盖。确认输入写 `.admin-clear-dialog .admin-field input { border-radius: 9px }`
- 📎 案例：更新页清空数据弹窗被改方（2026-09-11）

### P-075 清空管理员后创建页必须按半钥分派
- ❌ 创建页把 `recovery` 写死为 `false`；或 `/api/auth/setup` 调用 `hostSecretExists()` / `adminRecoverySchema` 却不 import。清空账号后页面仍走完整建站，请求在服务端直接 500「创建站点失败」
- ✅ 规则：`setup/page.tsx` 用 `hostSecretExists()` 决定显示重建管理员还是创建站点；`SetupForm` 接收 `recovery`，恢复模式只提交 `{username,password,passwordConfirm}`。`setup/route.ts` 必须显式 import `hostSecretExists` 与 `adminRecoverySchema`，已有半钥只走 `createAdminForExistingSite()`（P-069）
- 📎 案例：清空账号后创建站点失败（2026-09-11）

### P-076 后台配色 token 必须挂 admin.css 的 :root，且与前台 --heo-* 脱钩
- ❌ 把新 token 写在 `.admin-workspace, .auth-shell` 作用域里；或为了换后台肤色去改 `globals.css` 的 `--heo-*` / 前台 `--admin-*`
- ✅ 规则：`admin.css` 只被 `src/app/admin/layout.tsx` 引入。新 token（`--admin-accent-*` / `--admin-ink-*` / `--admin-surface*` / `--admin-line*` / `--admin-shadow-*`）和同名覆盖（`--admin-danger` / `--admin-ease` / 字号）写在 `:root` 与 `:root[data-theme="dark"]`（`data-theme` 在 `html` 上，写成 `[data-theme="dark"] :root` 永远匹配不到）。`AdminDialog` / `DataClearDialog` / 媒体菜单 portal 到 `document.body`，不在 `.admin-workspace` 子树内。前台首页、评论表单、搜索、404、TransferHud 继续只用 `globals.css` 的 `--heo-*` 与 `--admin-danger/--admin-ease`
- ✅ 多配色（6 套预设）的额外规则：**色值集中在 `src/lib/admin/accents.ts`（单一事实源），`admin.css` 只消费变量、不写死任何预设色值**；由 `admin/layout.tsx`（server）读 Setting `adminAccent` → `adminAccentStyle()` 注入 `<style>` 到 `:root`（零闪烁、零 JS、不用 localStorage）。注入用 `:root:root` 提特异性，避免与 admin.css 的 `:root` 同特异性时只能靠文档顺序决胜。
- ✅ **每套预设必须给浅色 / 暗色两套锚点**：`--admin-accent-300/400` 由 `color-mix(锚点 N%, var(--admin-bg))` 派生，而暗色下 `--admin-bg` 是深色 —— 若锚点仍是深色主色，混出来就是「深底上的深色」（石墨实测约 **1.2:1**，等于不可读）。暗色锚点必须换成亮色，且要单独算一遍对比度。
- ✅ 亮主色的两个连带项：主色变浅后（如天青 `#0ea5e9`），① 拿它当文字色在浅底上只有 2.6:1；② 白字压在它上面同样只有 2.6:1。前者由派生级兜住，后者必须把 `--admin-on-accent` 换成深色。
- 📎 案例：后台二次换肤（2026-09-13）；第三轮可切换配色（2026-02）

### P-077 写类名 / import / 图标名之前，必须用工具验证它存在
- ❌ 错误：按印象写标识符。第三轮后台重写中一轮内犯了 3 次 —— 虚构 CSS 类 `.admin-card__head` / `.admin-badge--muted`（真实约定是 `.admin-section` + `.admin-section__title` 与中性 `.admin-badge`）、虚构模块 `@/lib/admin/repo-config`、虚构图标 `PaletteIcon`（Radix 里没有，错误的是正确名 `ColorWheelIcon`）。
- ✅ 规则：
  - **类名**：写完 tsx 后，把文件里所有 `className="admin-*"` 提取出来，与 `admin.css` 里已定义的类逐个比对，**缺失清单必须为 0**。引用不存在的类不会报错，只会静默丢样式，比编译失败更难发现。
  - **import 路径**：用 `glob` 或 `rg` 确认模块文件真实存在；写不存在的模块会直接编译失败。
  - **图标名**：先查 `node_modules/@radix-ui/react-icons/dist/index.d.ts`，不要凭印象。
  - **变量名**：改名（如 `--admin-sky-*` → `--admin-accent-*`）必须全仓 `rg` 归零，且把 tsx 里的内联用法一并改（`page.tsx` 里就有 3 处写死的 `var(--admin-sky-500)`）。
  - **工具输出本身也要交叉验证**：PowerShell 的 `Get-Content` 输出中文可能显示为乱码（控制台编码问题），**不代表文件被写坏** —— 用 Read 工具复核再判断（本项目已两次虚惊：`admin/layout.tsx`、`admin.css`）。同理 `Get-Content | Measure-Object -Line` 的计数与实际行数可能不符（实测把 4444 行数成 3830），**在"文件被删了内容"这类结论前，先用 Read 确认总行数**，否则会去追一个不存在的 126 行缺口。
  - **审计的匹配口径必须对齐文档的组织方式**：`docs/ai/module.md` 是**分组登记**（一行一个目录、列出组件名或函数名），不是逐文件清单。用"文件名精确匹配"去审计会得到大量误报——实测报出 53 个"未登记"，逐条核对后**全部已在 L143/L149–157 的分组行里**。做注册表审计时先确认文档用什么粒度组织，再选匹配口径；否则会把"口径不同"误判成"文档脱节"，然后去补一堆本就存在的行。
  - **CSS 自定义属性（token）要跨文件查，别只看一个文件**：本项目 `--admin-fast/mid/slow`（160/220/280ms）与 `--admin-ease` 定义在 **`globals.css`**（前后台共享层，前台 `TransferHud` 也用），`admin.css` 只是使用者。只 grep `admin.css` 会得出"token 未定义、过渡全失效"的**错误结论**；真去 `admin.css` 补一个 `--admin-fast: 120ms` 还会反手把全后台的动效时长改错。
  - **别拿被截断的输出当全量**：同一处 `Select-String ... | Select-Object -First 8` 把 23 处用法说成 2 处。列用法/定义时不要加 `-First`；加了就要在结论里标注"已截断"。
  - **兜底证据永远看运行时**：`getComputedStyle(document.documentElement).getPropertyValue('--admin-fast')`、`getComputedStyle(el).transitionDuration`，比任何静态 grep 都硬。
  - **数行数 / 统计代码量别用 shell 命令**：`Get-Content | Measure-Object -Line` 不准、被 `-First` 截断的结果不全。走 `pnpm loc`（`main/scripts/count-loc.mjs`，只读、零依赖、不写任何文件）：它按桶数物理行，显式剔掉依赖（`node_modules`）、vendor 冻结子树（`src/editor`）、构建产物（`.next` / `build`）、运行时数据（`main/data`）、锁文件（`pnpm-lock.yaml`）与二进制；一个文件只落一个桶（不会重复计数），`--all` 会把「没计入的都有什么」**和「没被任何桶接住的文件」**一起列出来——后者是漏数的唯一保险绳。⚠️ 第一次写这个脚本时就栽在口径上：`pnpm-lock.yaml`（9,631 行）被「工程配置」那一桶接走，配置虚高 30 倍，是 `--all` 审计里看出锁文件没出现在「未计入」清单才发现的。
- 📎 案例：第三轮后台重写（2026-02）；以及 2026-02 的一次**误报**——先报"`--admin-fast` 未定义导致 `.admin-btn` / `.admin-list__row` hover 瞬变"，实测 `.admin-btn` 计算值 `0.16s ×5 + 0.12s`、`:root` 上 `--admin-fast = .16s`，结论作废；真正要改的只有自己新写的 `.admin-choice__btn` 硬编码了 `120ms`，已改成 `var(--admin-fast)`。

### P-078 清理自建进程必须按 PID / 专属特征，禁止按进程名 Stop-Process
- ❌ 错误：验证时用 `Start-Process msedge --headless --remote-debugging-port=...` 起浏览器，收尾时用 `Get-Process msedge | Stop-Process -Force` 清理。**这会终止机器上所有 Edge 进程**，包括用户正在使用的浏览器窗口——实测把用户的浏览器关掉了（还两次）。
- ✅ 规则：
  1. 启动时用 `-PassThru` 记下 PID，收尾 `Stop-Process -Id $p.Id`。
  2. 浏览器/Node 这类会 fork 子进程的程序，PID 会散成多个。此时用**本次独有的命令行特征**筛选，再逐个 `Stop-Process -Id`：
     ```powershell
     Get-CimInstance Win32_Process |
       Where-Object { $_.CommandLine -match 'myblog-verify' } |   # 本次专用的 --user-data-dir 路径
       ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
     ```
     收尾后**再查一次**只剩多少，并确认剩下的都不是自己的。
  3. **禁止** `Get-Process <通用名> | Stop-Process -Force`。`msedge` / `chrome` / `node` 是**共享资源**，不是本次任务的私有资源；按名清理等于替用户决定关掉什么。
  4. **启动自建浏览器后必须校验归属，但判据要对准"人"，不是"扩展"**：
     - ✅ 正确判据：**有没有别人的真实标签页**（`type=page`，URL 既不是 `about:blank`，**也不是 `edge://` / `chrome://` / `devtools://` 这类浏览器内部页**）
     - ❌ 错误判据有两个坑：① 用「有没有 `chrome-extension://` 的 target」——**Edge 的内置组件扩展在全新 profile 里同样存在**（实测误报两次，两次都把正常验证拦住了）；② 只排除 `about:blank`——**浏览器会自己开出 `edge://sync-confirmation-dialog/` 之类的内部页**，也会被误判成"别人的标签页"（实测又误报一次）
     ```js
     const list = await (await fetch("http://127.0.0.1:<port>/json/list")).json();
     const internal = /^(edge|chrome|devtools|about):/;
     const foreign = list.filter((t) => t.type === "page" && !internal.test(t.url));
     if (foreign.length > 0) throw new Error("CDP 上有别人的标签页，立即中止");
     ```
     - **更可靠的一步**：校验完 target 后，再确认**监听端口的进程命令行**含你本次专用的 `--user-data-dir` 路径。两步都过再操作：
       ```powershell
       $own = (netstat -ano | Select-String ':9555' | Select-Object -First 1).Line.Trim() -split '\s+' | Select-Object -Last 1
       (Get-CimInstance Win32_Process -Filter "ProcessId=$own").CommandLine -match 'my-user-data-dir'
       ```
  5. **端口冲突时不要抢，先认占用者的身份**：`next dev` 在 3000 被占时会自动改用 3001 并**拒绝启动第二个实例**（正确行为）。此时用 `Get-CimInstance Win32_Process` 看占用者的命令行与工作目录，**判断是不是用户自己在跑**；是用户的服务就**什么也别做**（不 taskkill、不改端口抢占），改为让用户刷新页面自行验证——热更新会把新代码推到他正在看的那个实例上。
- 📎 案例：第三轮后台重写验收（2026-02）——误关用户浏览器，用户当场发现

### P-079 同路由只换 query 时组件不重新挂载 —— 别把 URL 复制进 useState
- ❌ 错误：
  ```tsx
  const [open, setOpen] = useState(() => searchParams.get("panel") === "1");
  ```
  从 `/admin` 点入口跳到 `/admin?appearance=1` 属于**同路由只换 query**：组件**不重新挂载**，
  惰性初始化只跑首次挂载那一次，state 永远停在旧值 → **表现为"点了没反应"**。
- ✅ 规则：**状态来源是 URL 就从 URL 派生**，不要复制进 state：
  ```tsx
  const open = searchParams.get("appearance") === "1";   // 派生，无 state，URL 一变就重渲染
  const close = useCallback(() => {                      // 关闭 = 用 router.replace 抹掉 query
    const next = new URLSearchParams(searchParams);
    next.delete("appearance");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);
  ```
  关闭时清掉 query，因此下次再点入口仍能打开（不需要额外 state）。
- **判断要点**：`useState(初值)` 只认**首次挂载**。凡是「由 URL / props 驱动」的开关，先自问
  「同路由参数变化时它会重跑吗？」——不会，就别用 state；也不要为此加 `useEffect` 同步
  （会引入 `react-hooks/set-state-in-effect`）。
- 📎 案例：后台外观面板入口（2026-02），用户反馈"调色板点了没反应"。实测确认：
  冷启动带 `?appearance=1` 能开，**在 `/admin` 页面内点入口则不开** —— 正是这个差异定位到根因。

### P-080 后台侧栏的"节奏"来自扁平结构 + 统一 gap，不是分组容器
- ❌ 把侧栏写成「每个分组一个容器，各自带 margin/padding」——组间垂直节奏会随组数、字高、折叠态漂移，和参照稿对不上。实测首个分组标题 `y=81`，参照稿是 `76.28`，且第三组之后累计偏移越来越大。
- ✅ 规则：参照稿（`demo/admin-ui/index.html`）里**分组标题与导航项是同一层的直接子元素**，容器只给一个统一的 `gap: 2px`；分组标题用自身的 `padding: 14px 10px 6px` 撑出上间距。复刻时照这个模型写（`.admin-nav { gap: 2px }` + 分组容器同样 `gap: 2px`），**不要在分组之间加 `margin`**。
- ✅ 配套：字号/行高也要跟参照稿（分组标题 `11px/600/letter-spacing .07em/uppercase/ink-3`，导航项 `h36/padding 0 10px/gap 10px/13.5px/ink-2`）。后台壳继承的行高是前台 `globals.css` 的 `1.6`，参照稿是 `1.55`——差 0.05 在这个密度下会累积成可见偏移，所以单独加了 `--admin-leading: 1.55`。
- 📎 案例：第三轮后台重写（2026-02）。改成扁平 gap 模型后，实测 y 坐标（76.28 / 115.33 / 153.33 / 192.38 / 230.38 / 268.38 / 306.38）与参照稿**完全一致**；第三组之后的分歧只来自本项目比参照稿多 2 个导航项。
- 💡 方法论：**"看起来差一点"的观感问题，先查结构模型是否一致，再调数值。** 结构不对时，调 padding 只能让某一组对上，换个组数又歪了。

### P-081 登录/退出是鉴权边界：不要用软导航，也不要在跳转前复位提交态
- ❌ 错误：登录成功后 `router.replace("/admin"); router.refresh();`，并且 `finally { setSubmitting(false) }`。两处都会咬人：
  1. 软导航复用登录前的客户端状态（Next 段缓存 / bfcache / 未登录时预取到的 `/admin` 载荷），可能落到旧载荷或重定向载荷上；
  2. `finally` 在**跳转还没落地**时就把按钮放回「登录」，用户会在这段空隙再点一次 —— 第二次请求撞上限速或 CSRF 轮换，明知会话已建立却停在登录页。实测（6× CPU 节流）这个空隙 **>1.2 秒**，第二次提交拿到 **429**。
- ✅ 规则：成功后 `window.location.replace(next)` 做**文档级跳转**（新会话重新渲染，浏览器自己给加载状态，只发一次请求）；**成功分支不复位 `submitting`**，按钮一直禁用到新页面接管；失败分支才 `setSubmitting(false)`。落地地址来自 `?next=` 时先过 `lib/auth/next-path.ts` 的 `adminNextPath()`（挡协议相对地址、反斜杠变体、编码穿越与登录页自环）。退出（`LogoutButton`）同理。
- ✅ 配套：`proxy.ts` 的登录限速只该管**失败**尝试。登录成功后 `clearRateLimit(loginLimitKey("login", ip))` 清账，否则站长自己反复登录/退出 5 次就被 429 挡在门外——表现同样是"点了没反应，刷新才进得去后台"。
- 📎 案例：用户反馈「登录管理员账号之后页面会卡住，只有刷新后才会来到后台」（2026-02）。headless Edge 实测：限速策略与密钥集中在 `lib/auth/login-limit.ts`，6 轮登录/退出全部落在 `/admin`、`POST /api/auth/login` **零 429**。

### P-082 写 `-webkit-` 前缀别写在标准属性后面：CSS 管线会把标准属性吃掉
- ❌ 错误：
  ```css
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  ```
  Turbopack/Tailwind 的 CSS 管线把两条合并成**只有 `-webkit-` 前缀**的那条，标准属性消失 → 现代 Chromium 只认标准属性，`getComputedStyle().backdropFilter === "none"`，模糊**静默失效**（页面照常渲染，看不出报错）。
- ✅ 规则：**只写标准属性**（`backdrop-filter: blur(3px)`），管线会自己补前缀；反过来验证也简单——直接抓 dev server 下发的 CSS 看规则文本。CSSOM 里的 `rule.cssText` 只保留浏览器认识的声明，所以"计算值是 none 但 `CSS.supports` 为真"就是这句诊断。
- 📎 案例：无封面细条卡的渐变模糊层（2026-02）。第一版写了 `-webkit-` 前缀，实测计算值 `none`；去掉前缀后规则里标准+前缀两条都在，计算值 `blur(3px)`。该层后来整体换成「模糊的文字副本」（见 P-084），但这条管线纪律仍然成立。

### P-084 「越往右越糊」别拿 `backdrop-filter` 糊背景，也别把渐变锚在整行宽度上
- ❌ 错误一：用 `backdrop-filter: blur()` 盖一层做渐隐。它糊的是**卡片背景**，文字被 mask 抹掉后只剩一块被糊浅的底色——用户看到的是"**白色色块覆盖**"，不是"字变糊"。
- ❌ 错误二：把渐变写成 `linear-gradient(to right, #000 34%, transparent 94%)`。百分比是相对**行宽**的：摘要短、没顶到卡片右缘时文字全落在透明之前，**看起来完全没有特效**。
- ✅ 规则：
  1. 模糊层 = **同一段文字再叠一层**（`aria-hidden`），对它自己 `filter: blur(2.6px)`，再用 mask 让模糊从左到右加深、末尾整行隐去；清晰层单独一条 mask 负责"变淡"。两层必须是**兄弟节点**（父子的话父层 mask 会把子层一起裁掉）。
  2. 渐变用 **px 锚在文字尾部**：`#000 calc(100% - 130px), transparent 100%`；模糊层 `transparent calc(50% - 120px), rgba(0,0,0,.95) calc(85% - 30px), transparent 100%`。
  3. 想让"锚在文字尾部"生效，需要一个 `width: fit-content; max-width: 100%` 的**内层壳**，外层留着 `flex: 1 0 100%` 独占一行。直接给 flex item 写 `width: fit-content` 没用——主尺寸由 `flex-basis` 决定，mask 的参照系仍是整行。
- 📎 案例：无封面细条卡（2026-02，同一处被用户反馈两次）。

### P-083 网格项 `min-width: auto` + 卡内 `nowrap` 文本 = 整列被顶宽
- ❌ 错误：给「无封面细条卡」的单行导语加 `white-space: nowrap` 后，`.post-list` 的列被顶到 **1455px**（视口 504px），页面横向溢出、侧栏被卡片压住。原因是网格项（`.post-card-wrap`）的自动最小尺寸 = min-content，nowrap 内容一路把它撑到文字宽度；`.post-card__lead { min-width: 0 }`、`.post-card { min-width: 0 }` 都**不管用**（最小尺寸是在网格项那一层算的）。
- ✅ 规则：两条一起加——`.post-list { grid-template-columns: minmax(0, 1fr) }`（容器侧）与 `.post-card-wrap { min-width: 0 }`（项侧）。要让「徽章 + 单行标题」同排，标题还要 `flex: 1 1 0`（`flex-basis: auto` 会按 max-content 参与换行，窄屏上把标题挤到第二行、细条变三行）。
- 📎 案例：同上（2026-02）。修复前 504 视口下 `document.scrollWidth = 1467`；修复后 `scrollWidth = 504`，细条稳定 **480×90**，手机宽度下也是两行。

### P-085 判定「这篇文章有没有封面」必须走 `bannerStyle`，不能只看 `cover` 字段
- ❌ 错误：列表卡片写 `const plain = !post.cover`。作者在编辑器里选「纯色 / 混色」时 `cover` 本来就是空的（色值在 `bannerColor/bannerColor2` 里），于是这些文章被当成"无封面"塞进细条卡 —— 用户原话是"**文章设置里选了渐变色封面，还是被识别为无封面**"。
- ✅ 规则：一律用 `lib/posts/banner.ts` 的 `postBannerKind(bannerStyle, cover)`，三种结果对应三种画法：
  - `image` → `CoverMedia`（封面图）
  - `fill` → `bannerFill(bannerStyle, bannerColor, bannerColor2)` 当 `background` 的色块
  - `none` → 真·无封面（细条卡 / Hero 占位）
- ✅ 配套：编辑器「封面与 Banner」在 `bannerStyle === "cover" && !cover` 时给出inline 提示（"还没选封面图 → 按无封面处理"），把三种状态在设置里就说清楚。
- 📎 案例：无封面细条卡（2026-02，同一处第三次反馈：先是白块、再是短摘要没特效、再是渐变被当无封面）。
- ⚠️ 待办：`RecentPostsWidget` / `RecommendModule` / `BlockRenderer` 里的小缩略图仍在直接用 `post.cover`（无图时落到 `CoverMedia` 的哈希渐变占位），没有跟随作者选的色块 —— 真要统一时按同一套 `postBannerKind()` 改。

### P-086 UI 验证要一条命令拿到结果：别把 `tsc` / `build` / 起服务跟截图捆在一起
- ❌ 错误：`npx tsc --noEmit; node probe.cjs` 这种"顺手都做了"的串联。用户体感就是"**就截个图怎么这么慢**"，而慢的其实不是截图。成本拆开看：
  - `tsc --noEmit` 是大头：`tsconfig.json` 的 `include` 含 `**/*.ts(x)` + `.next/types/**` + `.next/dev/types/**`，`next build` 会重建 `.next` 让 `incremental` 缓存失效，dev server 又在持续写 `.next/dev/types` → 每次都接近全量检查（数十秒级）；
  - 在**同一条命令里起 dev server**：Turbopack 从零编译全部路由，分钟级（用户会直接把它掐掉）；
  - 每次全新 `--user-data-dir`：Chromium 建 profile + 结束 `taskkill /T /F` + 删上千个小文件，各 2–5s；
  - 脚本里的固定 `sleep`（400ms 轮询 + 每次 1.5s 静置 × 视口数）；dev 路由首个请求实测 1–2s（`GET /admin/login 200 in 1896ms`）。
- ✅ 规则：**UI 验证走 [`main/scripts/ui-shot.mjs`](../main/scripts/ui-shot.mjs)**（`pnpm shot /posts --measure .post-card --json`）：
  1. 只对着**已经在跑的** server（先用 `fetch` 热一次路由），不启动服务；
  2. **复用**同一个浏览器 profile（`os.tmpdir()/myblog-ui-shot-profile`），不删；退出用 CDP `Browser.close`；
  3. 密集轮询（100ms）+ 早退，不写死长 `sleep`；一次启动跑完桌面 + 窄屏（`Browser.setWindowBounds` + reload）；
  4. 输出 = 图 + 视口/滚动宽/元素尺寸，**一次写文件**给 AI 读，别用 shell 管道来回绕（`Select-String` 会吃掉退出码，`>` 重定向在 pwsh 下还可能写成 UTF-16）。
  实测**命令整体 2.6s**返回（脚本内部 2.1s：warm fetch 138ms | desktop 777ms | mobile 630ms）。
- 🔴 **最容易踩的一刀（这条才是"卡两分钟"的真凶）**：`spawn(..., { detached: true })` 出来的浏览器进程**必须 `child.unref()` + 结束用 `child.kill()`**。
  - 不 unref → 子进程句柄吊着事件循环 → **脚本干完活也不退出**，pnpm/pwsh/AI 的工具调用一直等到被人工掐断（实测用户等 2 分 12 秒后手动中断）；
  - 想杀进程组写 `process.kill(-pid)` → **Windows 不支持负 PID**（抛 EINVAL，被 catch 吞掉）→ 浏览器活着，循环照样不结束。
  - 收尾再补一刀：stdout 冲干净（空写 + 回调）后 `process.exit(0)`，另挂一个 `unref()` 的 3s 硬退出兜底。
  - 📎 连带解释了历史怪现象：以前被我掐断的那几次脚本，其实**活都干完了**（包括 finally 里的清理），只是进程不退出 —— 于是"看起来卡住"。
- ✅ 配套纪律：类型检查/构建各自单独一次，别和 UI 验证同一条命令；AI 的每次工具调用都是冷进程，凡是"大量小文件读写"（tsc 解析、Chromium profile）都会被放慢，能省的都要省。
  - ⚠️ AI 还有个自伤操作：**别用 pwsh 的 `-replace` / `Set-Content` 管道改源码**（见 P-077），中文会被 GBK 往返毁成乱码，整文件重写更省事。
- 🔴 **读内联值证明不了过渡在跑**：`el.style.top` / `el.style.transform` 是**声明值**，点击瞬间就跳到终点；过渡补的是**计算值**。想看动画有没有真的在滑，只能读 `getBoundingClientRect()`（或 `getComputedStyle`）逐帧采样。实测：折叠组点开时 `style.top` 第一帧就是 `2347px`（看着像"瞬跳"），而 `rect.top` 是 `68.8 → 150.6 → 338.9 → 501.2 → 555`（真在滑）——只读内联值会把好的动画误判成坏的。
- 🔴 **截图和尺寸都看不出「交互死了」——改交互必须真点一遍**：`pnpm shot` 只能证明"画出来了、几何对"，证明不了"点得动"。实测：折叠组组件因为 `useCallback` 依赖里漏了 `expanded`，**点展开没有任何 effect 重跑**（内联 `height` 还停在牌堆高度、卡片 `transform` 没清）→ 视觉完全没反应；而此时 `pnpm shot` 量出来的 `.ig__viewport` = 433px（客户端 layout effect 跑过）、截图里叠放卡 + 「展开 4」胶囊一应俱全，**看起来完全正常**。
  - 做法：写十几行 CDP（`scripts/ui-shot.mjs` 里有全套现成管线：spawn 浏览器 → `Target.createTarget` → `Target.attachToTarget` → `Runtime.evaluate`），在页面里 `.click()` 真点，然后**前后各量一次**同一个盒子（本例：视口高 376 → 2893 = 真展开；点「收起」→ 440 = 真收回）。顺带覆盖"两个入口都要能用"（牌堆本体 + 左侧胶囊）。
  - 收尾别 `await send("Browser.close")`：连接已经被自己关掉时那个 Promise 永不 settle，Node 会以"unsettled top-level await"退出且**跳过后面的 `child.kill()`**。先 `socket.close()` → `child.kill()`，或者把 close 包在 `Promise.race` + 超时里。
  - 用 `taskkill` 清残留时**只杀命令行里带自己 profile 目录的进程**（`Get-CimInstance Win32_Process` 过滤 `CommandLine -like "*myblog-ui-shot-profile*"`），不要按进程名一刀切——那会把用户自己开的浏览器一起杀掉。
- 📎 案例：2026-02 同一处卡片改动，前几轮验证动辄几分钟（还被掐断两次），换成 ui-shot 后 2.6s；2026-10-03 折叠组"根本展不开"就是这么定位并复验的。

### P-087 `updatedAt` 不能当「作者改过的时间」：浏览量自增 / 定时发布 / publicId 回填都会刷它
- ❌ 错误：文章页的「已修改」直接读 `Post.updatedAt`。Prisma 的 `@updatedAt` 在**任何** `update/updateMany` 上都会跳到"现在"：
  - `POST /api/posts/[slug]/view` 每记一次浏览量都是 `prisma.post.update({ data: { views: { increment: 1 } } })` → 有人在看这篇文章，它就显示成"刚改过"；
  - `scanScheduledPosts()` 把 `scheduled` 翻成 `published`、`ensurePostPublicIds()` 回填 `publicId` 也会刷。
  - 实测 dev 库：12 篇文章的 `updatedAt` 全被刷成同一天，`publishedAt` 却分散在半个月里 —— 拿它当修改时间，全站文章会一起显示"已修改"。
- ✅ 规则：要"作者改动时间"就单独存一列 `Post.revisedAt`，只由 `lib/posts/admin.ts` 的 `updateAdminPost()` 写，条件是**「改动前已发布」+「改完仍是已发布」+「读者可见字段真的变了」**；前台是否显示由 `Post.showRevisedAt`（编辑页设置栏开关，默认开）决定。
  - 判"有没有改"必须逐字段比对（PATCH 是部分更新，`undefined` = 不动），且**不要把** `status` / `publishedAt` / `pinned` / `recommend` / `views` 算进去：改状态、翻页序不算改文章。
  - 前台再兜一层 `revisedAt > publishedAt` 才渲染：发布前反复编辑、草稿转发布都不会误报。
- 📎 案例：2026-02 需求「文章支持显示修改日期与'已修改'」，迁移 `20260925161921_post_revised_at`（`revisedAt` + `showRevisedAt`）。

### P-088 三列 grid 的页脚：中间那个模块不渲染时，右栏会掉进中间列
- ❌ 错误：`.site-footer__inner` 是 `grid-template-columns: minmax(0,1fr) auto minmax(0,1fr)`，三个子节点（左栏 / 运行时间模块 / 右栏文案）**按顺序自动落位**。中间那列是「站点运行时间」模块：`siteStartedAt` 为空时 `UptimeModule` 直接 `return null`，DOM 里没有这个节点 → 右栏文案变成第 2 个子节点、落进中间列；`.site-footer__inner > p:last-child` 上的 `justify-self:end` 也只能贴着中列右缘，于是本来在右下角的「记录思考，也记录生活。· 归档 · RSS · 管理后台」跑到中间。
  - 受影响的不只是关掉运行时间的首页：**所有不显示运行时间模块的页面**（文章页、列表页……`Footer` 只在首页传 `showUptime`）本来就是两子节点的三列 grid，同样是错的。
- ✅ 规则：列位写死，别靠"第几个子节点"：`.site-footer__left { grid-column: 1 }`、`.site-footer__inner > p:last-child { grid-column: 3 }`，中间列留给自动落位；手机档（≤720px，容器改 `display:flex` 竖排）把右栏文案 `text-align` 钉成 `right`，保持左/中/右的身份。
- 📎 案例：2026-02。修后实测（1370 视口，`inner.right - 右栏文字.right`）：文章页（无运行时间模块）= 0；首页（有模块）= 0 且中间列水平居中偏差 0；504 视口 = 0。

### P-089 `cachedPublic` 里跨表读来的数据：`revalidateTag(tag, "max")` 是"先给旧值"，要立刻生效得用 `{ expire: 0 }`
- ❌ 错误：作者署名按「文章没单独填作者 → 读管理员账号上的默认笔名」实现（跨表读，塞进 `cachedPublic(["getPublishedPostMeta", …], [posts])`）。改完默认笔名只调 `revalidatePublicContent()` → **第一次导航仍渲染旧署名**，第二次才变。同一口径连测三次都复现：`["和自己对话","丁笔名"]`、`["丁笔名","戊笔名"]`、`["戊笔名","和自己对话"]`。
  - 一开始我误判成"全站既有行为"，被对照实验推翻：**改文章标题第一次就是新值** —— 因为那条写入路径里带了该文的 `revalidatePath(postHref)`，而 `revalidatePath("/具体路径")` 是立即生效的。
- ✅ 规则：Next 16 里 `revalidateTag(tag, "max")` 的语义是**「标记过期 + 先给旧值、后台重算」**（SWR），要"改完立刻可见"：
  - 从 **Route Handler** 立即过期：`revalidateTag(tag, { expire: 0 })`（内联 profile = 立即过期，无 deprecation warning）。
  - **不要用 `updateTag()`**：Next 16.3.3 源码里它对 `page.endsWith('/route')` **直接 throw**（"updateTag can only be called from within a Server Action"），而本项目所有写入都在 Route Handler。
  - 无 profile 的 `revalidateTag(tag)` 也能立即过期，但 Next 会打 deprecation warning。
  - 判断口径：**凡"公开页面的某段内容依赖另一张表"（账号笔名、站点设置、作者清单…），写入侧就必须显式立即过期那个 tag**，否则第一次请求是旧值。
- 📎 案例：2026-02 作者功能（`lib/auth/account.ts` 改笔名后补 `revalidateTag(PUBLIC_CACHE_TAGS.posts, { expire: 0 })`）。修后同口径实测：`["丁笔名","丁笔名"]`、`["戊笔名","戊笔名"]`、`["和自己对话","和自己对话"]` —— 第一次导航即新值。
- ⚠️ 遗留（需用户点头再改）：`lib/admin/revalidate.ts` 的 `revalidatePublicContent()` 四个 tag 仍用 `"max"`。凡「只靠 tag 失效、没有对应 `revalidatePath`」的公开面（分类/标签/归档等列表页），第一次请求可能仍是旧值。要统一成"改完立刻可见"，把那四处换成 `{ expire: 0 }` 即可 —— 那是全站写入语义变更，本次未擅自动。

### P-090 变体按钮的文字色不许在暗色块里"族级统一钉"：一条 (0,2,0) 就能把整族打成"深底 + 近黑字"
- ❌ 错误：`admin.css` 里有一条 `[data-theme="dark"] .admin-btn { color: var(--admin-on-accent) }`。它是 (0,2,0)，而 `.admin-btn--ghost { color: var(--admin-ink) }`、`.admin-btn--link { color: var(--admin-accent-600) }` 都是 (0,1,0) —— 暗色下**整族被盖住**。偏偏暗色的 `--admin-on-accent`（`lib/admin/accents.ts` 的 `onAccentDark`）是**近黑 `#0b0d11`**（那是给亮主色实心按钮配的字），于是所有"没有底色的按钮"（幽灵 / 链接）在深底上变成近黑字，用户原话是"**有些没有底色的按钮在深色模式下还是黑色看不清**"。
- ✅ 规则：
  - 那条暗色规则本来**就是冗余的**：基础 `.admin-btn` 已写 `color: var(--admin-on-accent)`，CSS 变量在 `:root[data-theme="dark"]` 下自己解析到暗色锚点 —— **删掉即可**，别拿 `:not()` 链去补丁（越补越脆、下一个变体还会踩）。
  - **改族级颜色前先算权重**：`[data-theme="dark"] .x` = (0,2,0)，能盖掉所有 (0,1,0) 的 `.x--变体`；要覆盖变体，选择器就照抄变体本身，不要写族级。
  - 同类相邻坑：vendor 的 token 名会骗人。`editor/styles/ui.module.css` 里 `.selectTrigger[data-placeholder] > span:first-child { color: var(--baseBorderHover) }` —— 这 token 名叫 Border，实际**只当文字色用**（216 / 286 两处全是 `color`，没有一处边框）。所以"它只是边框色、暗色不用管"是错的判断。
- 🔎 可复用口径（别靠眼睛）：CDP 打开后台页 → `document.documentElement.dataset.theme = 'dark'` → 遍历 `.admin-workspace *`，取每元素 `getComputedStyle().color`，背景沿祖先链逐层合成（rgba 叠 `--admin-bg` 打底），算 WCAG 对比度，报出 < 3 的（带 class + 祖先链 + color/bg/ratio/fontSize）。一轮可跑完 12 个后台页，含手机档（430 宽）与弹窗打开态。
- 📎 案例 2026-02：修复前 `/admin` 的「退出登录」= `rgb(11,13,17)` 压在 `rgb(20,23,28)` 上 = **1.08:1**（`/admin/posts` 的「编辑」同）；修后 = `rgb(233,236,241)`（暗色 `--admin-ink`，≈15.6:1）与 `rgb(147,197,253)`（暗色 `--admin-accent-600`）。第 2 处同类：暗色块里 `--baseBorderHover: #5a6169` 写死 → 编辑器工具栏「段落样式」占位 2.86:1，改为 `var(--admin-ink-2)` 后达标。审计复跑：12 个后台页 + 弹层/手机档 **0 命中**。
- ⚠️ 有意不动（避免误伤）：浅色下三级文字色 `--admin-ink-3 = #98a2b3`（2.58:1：侧栏分组名、卡片提示、行内次要文字）是参照稿定档的"次要文字"，不是按钮；`/admin/home` 画布里的 `dash-chip`（白字压彩色块 1.97–2.84:1）是**前台预览内容**（定义在 `globals.css`），改了会动前台设计。

### P-091 浮层被盖住：先给两边"各自分层"（栈上下文），别只往浮层上加 z-index
- ❌ 错误：文章编辑页右上角 ⓘ 的说明卡（`.post-workspace__popover`，`position: absolute; z-index: 5`，挂在 `.post-workspace__titlebar` 上）被编辑器工具栏盖住 —— 工具栏是 `.admin-mdx-editor .mdxeditor-toolbar { z-index: 6 }`（flex 项，z-index 同样生效）。两边都不在同一个受控层里，于是 6 > 5 直接压过去。实测：卡片 `[1050,136 → 1410,225]`、工具栏 `[592,129 → 1410,209]` 重叠，卡片矩形内 5 个取样点 **4 个**命中的是工具栏/它的按钮。
- ✅ 规则：**别只给浮层加数字**（今天调 7、明天 8，还会跟 sheet / dialog 打架）。给"两个子树"各自分层：
  ```css
  .post-workspace__titlebar { position: relative; z-index: 2; }  /* 标题行整层压住编辑区 */
  .post-workspace__editor,
  .post-workspace__preview { position: relative; z-index: 1; }   /* 把编辑器内部的 z-index(6/240) 关进自己的栈上下文 */
  ```
  这样编辑器内部的任何 z-index 都困在它自己那层，标题行的浮层稳定压得住；而全局层（手机 sheet `--admin-z-sheet+1 = 81`、弹窗 `--admin-z-dialog = 90`）仍在根层级比大小，不受影响。
- 🔎 验证口径（可复用）：用 `elementFromPoint` 在浮层矩形里取 5 个点（0.1 / 0.5 / 0.9 组合），逐点报"命中的元素链 + `hit.closest('.浮层')` 是否为真" —— 把"有没有被挡"变成数字。修后实测 **0/5 被挡**（浅色 / 暗色 / 桌面 1440 / 手机 430 四组一致）。
- 📎 案例 2026-02。同轮核过相邻面没被这次分层改坏：手机档设置 sheet 仍 `z-index: 81` 在最上层、且它的背板盖住标题行按钮（标题行不会被点穿）；媒体插入仍是 portal 到 body 的 `admin-dialog`（z=90），中心 `elementFromPoint` 命中它自己。
- ⚠️ 顺带发现（未改，属产品选择）：手机档里的 `.post-workspace__hint { display: none }` 类名**在 DOM 里不存在**（真实是 `.post-workspace__hint-btn` 与 `.post-workspace__popover`）——那是条死规则，"手机上藏起 ⓘ" 并没生效。要藏就把选择器改成 `-btn`，不要就删掉，别留着骗人。
- 与 P-032 的关系：P-032 管"别把下拉放进工具栏"；这条管"浮层放好了为什么还会被盖" —— 根因是**跨子树的 z-index 比较**。

### P-092 从远端撤私密内容：别在"验证之前"销毁本地对象
- ❌ 错误：要把 `reference/`（第三方主题源码 + 旧站导出 + 私人计划笔记）从已推送的仓库撤下来时，直接用 `git filter-branch ... -- --all` → 删 `refs/original` → `git reflog expire --expire=now --all` → `git gc --prune=now`。三个后果叠加：① `--all` 把**备份分支也一起重写**（备份等于没备）；② `filter-branch` 收尾会把**当前分支的工作区重置成重写后的 HEAD** → `reference/` 被从磁盘删掉；③ `gc --prune=now` 把旧对象清干净 → 本地**同时**失去文件与可恢复对象。这次唯一救命的是远端（GitHub）还留着旧提交，因为**强推还没发生**。
- ✅ 规则：
  1. 撤内容前先在**仓库之外**做备份（`git clone --mirror <本地路径> <别处>` 或直接复制整个目录）；**别把备份做成同一仓库里的分支**——`--all` 会连它一起重写。
  2. 重写时明确指定 ref：`git filter-branch --index-filter "git rm -r --cached --ignore-unmatch <path>" --tag-name-filter cat -- refs/heads/main`，**不要写 `--all`**。
  3. 重写后先把文件捞回工作区（`git checkout <旧提交> -- <path>` 或 `git archive <旧提交> <path> | tar -x`），再 `git restore --staged <path>` 取消跟踪，最后把该路径写进 `.gitignore`（本项目已把 `reference/`、`demo/`、`changelog/` 列入），这样以后 `git add -A` 也不会再带上去。**捞回后要逐个 `Get-FileHash` 对照重写前的指纹**，别只看"文件在不在"。
  4. **验证通过之前不要 `gc --prune=now`**，也不要删 `refs/original` 与 reflog——它们就是本地后悔药。
  5. 远端：`git push --force origin main` + `git push --force --tags`（tag 也会被重写，必须强推）。`DELETE /repos/{owner}/{repo}` 需要 token 带 `delete_repo` 权限（GCM 默认 scope 是 `gist, repo, workflow`，**不含它**，实测 403 `Must have admin rights`）→ 想连"不可达的旧对象"一起抹掉，只能在网页端删仓库后重建，或换一个带 `delete_repo` 的 token。
  6. 验证要用不含糊的 ref：本仓库根目录有 `main/` 目录，`git log main` 会报 `ambiguous argument 'main'`，**失败命令的空输出会被误读成"命中 0"**（P-077 同类）→ 用 `HEAD` 或 `refs/heads/main`。
- 📎 案例 2026-09-25：MyBlog 首推 GitHub 后按要求撤下 `reference/`（350 文件 / 8.73 MB）。文件全部从远端旧提交 `1358586` 还原，本地零丢失；仓库策略定为**远端只留程序代码 + 项目文档**。
- 📎 同日第二次（按 P-092 规矩重做，零事故）：撤下 `demo/`（6 文件 / 609 KB，后台 UI 参照稿）——先做**仓库外明文备份**（`D:\code_projects\myblog-demo-backup`）并记录 6 个文件的 SHA256 → `filter-branch` **只指定 `refs/heads/main` 与两个 tag**（不写 `--all`）→ 从旧提交捞回后 **6/6 哈希一致** → 强推 `main`/`--tags` → 远端 `contents/demo` → 404 → **最后才**清 `refs/original` + reflog + `gc --prune=now`。`demo/`、`reference/` 的**文件仍在本机**，只是不再进任何 commit（远端与本地都查不到）。
- 📎 同日第三次：撤下 `changelog/`（3 文件 / 31 KB，内部施工笔记）——仓库外备份（`D:\code_projects\myblog-changelog-backup`）+ 记录 SHA256 → 只指定 `refs/heads/main` 与两个 tag 重写 → 捞回后 **3/3 哈希一致** → 入 `.gitignore` → 清残留对象。**这次的关键差别：远端即将被整体删除，没有任何远端可当救命绳，仓库外备份是唯一的后悔药。**

### P-093 让手机连上 dev server：拦路虎是 `allowedDevOrigins`，不是 `-H`
- ❌ 错误（三个连着的）：
  1. 以为要给 `next dev` 加 `-H 0.0.0.0` 才能局域网访问——Next 16 官方 `--help` 写着 `-H` **默认就是 `0.0.0.0`**，本项目 `boot.cjs` 的 `extraAfterMode()` 也已原样透传参数，实测启动即 `监听 0.0.0.0:3000`。
  2. 只测「整页打得开」就当成连通成功。Next 16 默认拦跨源访问 dev 资源，但拦截器 `block-cross-site-dev.js` 第一句就是 `if (!isInternalEndpoint(req)) return false;`——**只拦 `/_next` 与 `/__nextjs`**，页面本身是 200。表现为：能看首页、但 **HMR 热更新和开发浮层全 403**，改代码不刷新、报错看不到原因。
  3. 用**猜的** `/_next` 路径做验证（如 `/_next/static/chunks/main-app.js`）→ 得到 404 就当作"没被拦"。**404 会把 403 掩盖掉**（P-077 同类：被截断/失真的探针输出不足以当结论）。
- ✅ 规则：
  1. 在 `main/next.config.ts` 配 `allowedDevOrigins`（**只写 hostname，不带协议、不带端口**）。它按 `.` 分段匹配：`*` 恰好替换**一段**标签，`**` 匹配一段以上且只能放开头（官方文档 Compatibility 段）。`192.168.2.*` 可覆盖 `.36` 且**抗 DHCP 漂移**；Tailscale 出口再加 `*.ts.net`。
  2. 改完**必须完全重启 dev server**（next.config 在启动时加载，日志有 `✓ Running next.config.ts took Nms`）。
  3. **Windows 本机验证快路径**（无需第二台设备）：先从首页 HTML 里正则抽出**真实存在**的 `/_next/...js` 路径，再带 `Origin: http://<本机局域网IP>:3000` 请求它：
     - 真实路径 + 无 `Origin` → 200（证明路径有效）
     - 真实路径 + 该 `Origin` → 改前 403 / 改后 **200**
     - 真实路径 + `Origin: http://evil.example` → 必须**仍 403**（反证：确认不是把拦截整体关掉）
  4. 多网卡（本项目机上有 WiFi / Tailscale / Radmin VPN / Meta Tunnel）时 **Next 打印的 `- Network:` 可能是假地址**（实测打印 `198.18.0.1`，那是 Meta Tunnel）；以 `192.168.*` 那个为准。
  5. 防火墙**先别急着加规则**：实测本机 `DefaultInboundAction = NotConfigured`（= Windows 默认 AllowInbound），从本机连自己的 LAN 地址返回 200。Node 规则是**按程序路径**匹配（`app=C:\program files\nodejs\node.exe`），只要 dev 就是用这个 exe 起的就命中；换 exe 路径才需要另加。
- 📎 案例 2026-02（本机）：改前 403 Unauthorized 且 `err.log` 有 `Blocked cross-origin request ... from "192.168.2.36"`；改后同请求 200，反证 `evil.example` 仍 403。配置见 `main/next.config.ts` 第 11–14 行。

### P-094 公开查询的 where 里不要给外键加「兜底支」：`ON DELETE SET NULL` 已经兜住了，多写一支会让 Prisma 把整条 OR 算错
- ❌ 错误：瞬间可见期的公开过滤要区分「未分组」与「各组」，写成 `OR: [未分组支, 各分组支]` 之后，我又"顺手"加了一支兜底：
  `{ visibilityGroupId: { notIn: [所有已知组 id] } }` —— 想法是"万一库里存在指向已删组的孤儿 id，也算未分组"。
  结果**本该隐藏的瞬间被放行**：实测 5 天前那条（全局 3 天生效）出现在公开列表里。
- ✅ 根因：孤儿 id **在结构上不可能存在** —— 迁移 `20260927160000_moment_visibility_group` 的 `ALTER TABLE "Moment" ADD COLUMN "visibilityGroupId" INTEGER REFERENCES "MomentVisibilityGroup"("id") ON DELETE SET NULL` 已经规定「组被删 → 该列置 NULL」。那一支不是兜底，而是**多给 Prisma 一个 OR 分支**，整条条件的组合结果跟着变（多出来的分支把不该命中的行也命中了）。
- ✅ 正确写法：只写**实际需要的**分支 —— 未分组支 `{ visibilityGroupId: null, ...全局窗口 }` + 每个组一支 `{ visibilityGroupId: <id>, ...min(全局, 组) 窗口 }`。条件的全集就是这些，见 `main/src/lib/moments/visibility.ts` 的 `buildMomentVisibilityFilter()`。
- 🔎 回归单测：`src/lib/moments/visibility.test.ts` 的「buildMomentVisibilityFilter：绝不输出 notIn（Prisma OR 组合会算错）」。
- 📎 案例：2026-09 瞬间可见范围。DB 级脚本 `main/scripts/verify-moment-visibility.ts` 对着 scratch 库跑真实 Prisma 条件，7/7 通过。

### P-095 Prisma 不把 `OR: [{}]` / `OR: []` 当「恒真」：不带条件要返回 `undefined`，别返回空条件对象或空数组
- ❌ 错误：把「全局永久公开（0 = 不限制）+ 没有任何可见范围组」这种"什么都不用过滤"的情况，写成 `return { OR: [{}] }`（或 `OR: []`），以为等价于不带条件。
- ✅ 根因（实测）：Prisma 对这两种写法**都不按"恒真"处理，直接返回空集合** —— 表现是**整站瞬间全部被判为不可见**（首页瞬间模块空、瞬间页空、连点赞都 404）。这不是"少过滤一些"，而是把可见性整体判反。
- ✅ 正确写法：没有需要过滤的条件时**返回 `undefined`**，调用方照 `where: undefined` 写（Prisma 视作不带条件）。
  - 本项目收口在 `main/src/lib/moments/visibility.ts`：`buildMomentVisibilityFilter()` 在「全局 0 + 无分组」时返回 `undefined`；`lib/moments/query.ts` 的 `visibleWhere()` 统一转成 `Prisma.MomentWhereInput | undefined`，**不要**在调用处改写成 `{}` / `OR: []`。
- 🔎 回归单测：`visibility.test.ts` 的「buildMomentVisibilityFilter：没有组时只剩全局条件」（断言全局 0 + 无分组 → `undefined`）。
- 📎 案例：2026-09 瞬间可见范围（默认 `momentVisibleDays = 0` 就是这条路径 —— **默认配置下走的就是"不过滤"分支**，写错会让全新站点一条瞬间都看不见）。

### P-096 分组分支必须同时乘上全局上限：`cutoff = max(全局 cutoff, 组 cutoff)`，少乘一侧长组就绕过天花板
- ❌ 错误：把「生效天数 = min(全局, 组)」这条规则只实现在**纯函数**里（`resolveMomentVisibilityDays()` 是对的），却在 SQL 侧的分组分支里**只用了组自己的天数**算截止时刻，漏掉全局那一侧。
- ✅ 根因：天数取 min 换算成时间就是**截止时刻取 max**（更晚的 cutoff = 更严的窗口）。分组分支只写组窗口时，长组会把窗口放得比全局还宽 —— 实测：**全局 7 天 + 一年组，漏出了 40 天前那条**（按全局本应隐藏）。
- ✅ 正确写法：每个分组分支的 cutoff 都要 `pickStricterCutoff(globalCutoff, groupCutoff)`（任一侧 null = 该侧不限制），见 `main/src/lib/moments/visibility.ts`。**纯函数对不代表 SQL 条件对**：规则有两处实现（判定文案 + 查询条件），改一处必须同时改另一处。
- 🔎 回归单测：`visibility.test.ts` 的「buildMomentVisibilityFilter：组比全局长时必须乘上全局上限」（全局 7 + 组 365 的天数断言与全局 7 一致）。
- 📎 案例：2026-09 瞬间可见范围。

### P-097 裸引用 CSS 类名照样"跑得起来"：`.admin-moment-*` 四个类名曾经在 admin.css 里根本不存在（P-077 的现场复现，已补 CSS 关闭）
- ❌ 错误：写瞬间后台列表（`src/components/admin/MomentAdminList.tsx`）时用了 `.admin-moment-content`、`.admin-moment-meta`、`.admin-moment-time`、`.admin-moment-badge` 四个类名，但**从没往 `src/app/admin/admin.css` 里写过对应规则**。页面不报错、构建不报错，只是这几处静默丢掉样式（P-077 说的正是这种"裸引用不报错"）。
- ✅ 实测证据（2026-09 发现当时，逐名比对）：`admin.css` 4988 行里 `.admin-moment` 前缀**只有 1 处命中** —— `.admin-moment-list`（与 `.admin-media-grid` 合成一条 `display: grid; gap: 16px`）。`admin-moment-content` / `-meta` / `-time` / `-badge` 命中数 **0**。也就是说这几处**完全没有规则**：`<li>` 只带 `.admin-stagger`，内容块与元信息块按 `div` 默认 `display: block` 纵向堆叠，元信息里的图标 + 时间 + 张数 + 可见期文案则按 `span` 默认行内流排——**不是**类名暗示的「元信息横向排布成一行徽章」，也不会走 `.admin-badge` 的徽章样式（那两个 `-badge` 是纯文字）。
- ✅ 规则：**类名写完必须回查 CSS**（`Select-String -SimpleMatch ".类名"`；命中 0 就是没样式）。两种收尾都要做一次判断，别放着：
  1. 想要那些布局 → 在 `admin.css` 里补上规则（立刻补，别留成"以后再说"）；
  2. 不想要 → **把类名从 JSX 里删掉**，别留一串听起来有意义的假类名骗下一个人（它们看起来像"已经实现过样式"，最容易让后续 AI 以为只需微调）。
- ⚠️ 发现当时的状态（2026-09 文档同步，未改代码）：这 4 个类名保留在 JSX 中、无对应 CSS；随后按下面的"补 CSS"收尾关闭。
- ✅ 收尾结果（后续，选的是"补 CSS"这条路）：在 `admin.css` 补齐真实样式 —— `.admin-field__label`、`.moment-form`（含 `> .admin-field` / `> .admin-field-row`）、`.moment-form__textarea`、`.moment-form__file-input`、`.admin-moment-content p`、`.admin-moment-meta`（flex + wrap + `--admin-ink-3`）、`.admin-moment-time` / `.admin-moment-badge`（inline-flex + svg `flex: 0 0 auto`）与徽章描边（`--admin-line` / `--admin-surface-2` / 999px 圆角），全部沿用既有 `--admin-*` token，未新造颜色。
- 🔎 回归自查脚本：`main/scripts/check-admin-classes.mjs`（跑法 `node scripts/check-admin-classes.mjs`）—— 把瞬间这几个组件引用的 `admin-*` / `moment-*` 类名与 `admin.css` 逐个比对，**缺失即非零退出**；实测「引用类名 40 个，缺失 0 个」。⚠️ 它**没有挂进 `pnpm test`**（`pnpm test` 只跑 `tsx --test`），要手动跑；新增同类组件时把文件加进脚本的 `FILES` 列表即可复用。
- 📎 案例：2026-09 瞬间可见范围。文档同步时按 P-077 复核标识符发现（交叉验证两次：Select-String 计数 + 全量列出 `admin-moment` 出现位置，结果一致），随后按"补 CSS + 自查脚本"关闭。

### P-098 服务端组件不能把函数当 prop 传给客户端组件：报错在渲染期，`tsc` 与 `next build` 都拦不住
- ❌ 错误：后台瞬间页要让「全局可见期」面板实时预览"此刻起算最早可见发布时间"，又不想让客户端调 `Date.now()`（React 纯度规则 `react-hooks/purity` 禁止），于是把**函数**当 prop 传下去：`<MomentVisibilityPanel computeLabels={(days) => ({...})} initialDays={...} />`。打开 `/admin/moments` 直接运行时报错：`Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server".`
- ✅ 规则：跨 RSC 边界（Server Component → `"use client"` 组件）的 props 必须是**可序列化数据**：字符串/数字/布尔/null/数组/纯对象（含 `Date`）。需要"服务端算好的东西随选择变化"时，**在服务端一次性预计算成数据再传**（本次做法：把各档位天数的预览文案算成 `previewLabels: Record<string, string>` 传下去，客户端只查表）。
  其他同样会炸的形态：传回调、传类实例（如 Prisma 结果以外的自定义类）、传 `Map`/`Set`、传 `function` 包在对象里（`{ fn: () => {} }`）。
- ✅ 自查成本很低：`tsc --noEmit` 与 `next build` **都不会**报这个（类型上函数是合法 prop），只有**真的渲染那个页面**才会炸。所以**改了后台/前台页面的 props 后必须实际打开一次对应路由**（本次就是靠 `GET /admin/moments` 才发现的）。
- ✅ 顺带一条同源经验：**时间只在服务端取一次**，通过 prop 下发（`now` / `nowMs`），客户端不要各自 `Date.now()`——既避免水合不一致，也避免触发纯度 lint。客户端要"过一会儿刷新剩余时间"时，放在 `setTimeout`/`setInterval` 回调里更新 state（不在 effect 体里同步 setState）。
- 📎 案例：2026-09 瞬间可见范围后台面板。修复后实测 `GET /admin/moments` → 200 且含面板文案，无错误标记。

### P-099 让区块"默认折叠"之前，先查桌面档是否把 `summary` 的点击禁掉了：`.admin-section > summary{pointer-events:none}` 会让折叠区变成打不开的死格子
- ❌ 错误：把瞬间页「可见范围」做成默认折叠（`AdminSection defaultOpen={false}`）后，桌面端**点标题没反应、也看不到展开箭头**，等于设置没有入口。原因不在新代码，而在 `admin.css` 里 0.1.1 后台重写时加的一段：
  ```
  @media (min-width: 769px) {
    .admin-section > summary { pointer-events: none; cursor: default; }
    .admin-section > summary::after { display: none; }
  }
  ```
  当时所有 `AdminSection` 都是恒展开的（`useState(true)`），桌面看起来就是"纯标题、不响应点击"，没问题；一旦有区块默认折叠，这条规则直接把它锁死。
- ✅ 规则：桌面"不可点 + 隐藏箭头"只应作用于**已展开**的区块 → 选择器收窄为 `.admin-section[open] > summary`（箭头同理 `.admin-section[open] > summary::after`），并显式给 `.admin-section:not([open]) > summary` 恢复 `pointer-events: auto; cursor: pointer;`。这样既有页面观感不变，折叠区可点、且有箭头提示。
- ✅ 自查：改折叠/展开行为后，在浏览器里量 `getComputedStyle(summary, '::after')` 的 `display`/`transform` 与 `details[open]`，并**真的点一次 `summary`** 看是否展开（本次实测：折叠态箭头 `transform: matrix(0.707…)`=45°、展开态 `none`+隐藏；点击后 `detailsOpen: true`）。
- ⚠️ 同一轮踩到的环境坑（别误判成页面坏了）：headless 浏览器里 `motion` 的入场动画（`AdminWorkspace` 的 `.admin-page-swap`，`initial opacity:0`）会停在起始帧，整页内容区看起来是空白——**`/admin/settings` 这种未改动的页面也一样**。判断方法：对比一个未改动页面，或直接查 `getComputedStyle(el).opacity`；要出可用截图就先把该层 `style.opacity='1'` 再截。
- 📎 案例：2026-09 瞬间可见范围。截图核对时发现折叠区无箭头，回查 CSS 定位到上述桌面规则。

### P-100 自动化的"点击没反应"先看 dev 服务器有没有 403：Next 16 dev 把 `127.0.0.1` 当**跨源**，被拦掉的 JS chunk 会让整页不水合
- ❌ 现象：脚本化打开 `/admin/moments`，DOM 结构完全正常（输入框、按钮、文案都在），但**点任何按钮都没反应**——`element.click()` 与 CDP 真实鼠标事件都试过，按钮上的原生 `click` 监听器计数 +1，而 React 的 `onClick` 从不执行、state 不变化、`motion` 入场动画也停在 `opacity:0`（整页看起来空白）。控制台早期是安静的，容易误判成"React 坏了"。
- ✅ 定位方法（一次分清"代码问题"还是"环境问题"）：
  1. 查 React 是否挂上：`Object.keys(el).filter(k => k.startsWith('__react'))`——**全页 0 个**就说明从未水合，不是组件逻辑问题；
  2. 导航**之前**就开 `Runtime.enable` + `Log.enable` + `Network.enable` 并挂监听，再看日志：本次抓到
     ```
     [log.error] Failed to load resource: 403 (Forbidden)
     [loadingFailed] net::ERR_ABORTED Script
     ```
     对应 dev server 日志里的 `⚠ Blocked cross-origin request to Next.js dev resource /_next/static/chunks/... from "127.0.0.1"`。
- ✅ 规则：**本地自动化一律用 `http://localhost:3000`，不要用 `http://127.0.0.1:3000`**。Next 16 dev 只信任 `localhost`（这是 P-093 `allowedDevOrigins` 的另一面），`127.0.0.1` 会被判定为跨源并 403 掉部分 chunk；本机 HTTP 之外**不要**为了绕过它去加 `allowedDevOrigins`。截图脚本同理（`pnpm shot` 默认就是 `127.0.0.1`，遇到整页空白先换 `localhost` 复测）。
  - ✅ 本仓库自带的 `ui-shot.mjs` 与 `measure` 类脚本的**默认 `--base` 就是 `http://127.0.0.1:3000`**，所以"量尺寸对、交互全无反应"在自动化里极易复现；自己写 CDP 脚本时第一句就用 `localhost`。
- ✅ 顺带结论：**空白截图 ≠ 页面坏了**。本次两张"内容区全白"的截图与折叠箭头、按钮无反应是同一个根因（未水合），换 `localhost` 后一切正常且交互全通过。
- ⚠️ **复发（2026-10，同一根因、更难认）**：这次的表现不再是"按钮没反应"，而是**「服务端渲染出来的部分一切正常、客户端 effect 从来没跑过」**——模块水合后本该由 `useEffect` 填充的瀑布区一直空着（`stack` 节点 0 个）、页面上 `window.__xxx` 探针全为 `undefined`。我按"组件逻辑坏了"排查了几轮（读源码、比对下发 chunk、查 HMR、重启 dev server），最后靠**反向探针**定位：往组件里塞 `document.body.dataset.debugEffect = ...`，探针为 `null` 就说明**组件根本没在客户端执行**，与业务逻辑无关；再回查 `_dev.err.log` 就看到 `⚠ Blocked cross-origin request to Next.js dev resource ... from "127.0.0.1"`。
  - 教训：**"渲染结果正确但没有任何客户端副作用"= 先怀疑水合，别先怀疑逻辑**；判据就一条——探针（`dataset` / `globalThis`）有没有值。
- 📎 案例：2026-09 瞬间发布区改版（朋友圈式）验收时，为了验证 popover/抽屉交互才发现；此前两轮"headless 动画不跑"的猜测是错的方向。2026-10 首页瞬间穿插卡验收时**同一坑复发**（浪费数轮排查），故补上面这条判据。

### P-102 图片拖动排序：别用 HTML5 `draggable`，也别把数组下标编进 key
- ❌ 错误 1（**手机端拖不动**）：`SortableImageGrid` 原来用 `draggable` + `onDragStart/onDragOver/onDrop`。HTML5 拖放**在触屏上根本不触发**，手机上永远拖不动；而且没有 `touch-action` 声明，手指移动会被浏览器当成页面滚动吞掉。
- ❌ 错误 2（**拖动时图片重新加载**）：发布区把 key 写成 `${image.key}-${index}`——**下标进了 key**。重排后每张 key 都变，React 认为元素不同 → `<img>` 全部卸载重挂 → 浏览器重新请求图片。
- ✅ 修法：
  1. 用 **Pointer Events** 自己实现拖动（`onPointerDown/Move/Up` + `setPointerCapture`，用 `document.elementFromPoint` 命中 `[data-sort-index]` 判断落点），桌面与触屏同一套代码。
  2. 手柄加 `touch-action: none`（`.admin-sort-grid__handle`），否则手机上收不到 pointermove。
  3. key 用**稳定 id**（本项目按对象身份分配一次：Symbol 挂载 + 自增序号），**永远不要把下标编进 key**。
  4. 拖动过程中只改内部 `dropIndex` 做落点提示，**指针抬起时才 onChange 一次**，避免拖动途中反复搬动 DOM。
  5. 体验两件：跟随指针的缩略图 `.admin-sort-ghost`、落点高亮 `.is-drop-target`。
- ✅ 实测口径（隔离库 + 真实上传 2 张图）：拖动顺序改变、图片集合未变、拖动中出现跟手缩略图与落点提示、**拖动期间新增图片请求数 = 0**。
- 📎 案例：2026-09 瞬间发布区改版（用户反馈"手机端没法拖动 + 拖动时图片会重新加载"）。

### P-101 弹层别默认往上展开：`bottom: 100%` 会顶到页面标题行，用户看到的是"卡片被上面挡住了"
- ❌ 错误：发布区操作条在页面内容区靠上位置，可见范围小卡片原本写成 `position: absolute; bottom: calc(100% + 8px)`（向上展开）。卡片高约 300px，展开后顶部正好顶进 `.admin-page-head` 的 `h1`（页面标题）所在区域——用户的原话是「卡片被挡住了」，看起来像被标题压住。
- ✅ 定位方法：在浏览器里对弹层自身取 `getBoundingClientRect()`，然后对它的 `center` / `top` / `bottom` / `left` / `right` **五个采样点**跑 `document.elementFromPoint(x, y)` 并判断 `pop.contains(hit)`。本次 `top` 点命中的是 **`H1.`**、`inside: false`，其余四点都在卡片内 → 一眼锁定"上方被标题覆盖"。
- ✅ 规则：**靠页面顶部的操作条，弹层一律向下展开**（`top: calc(100% + 8px); bottom: auto; left: 0`）；同时给宽度上限 `width: min(300px, calc(100vw - 96px))`，避免窄屏向右溢出。向上展开只适合"弹层在屏幕下半部"的场景。
- ✅ 复测口径（两档都量）：桌面 1400 与手机 430 各测一次，确认 `offscreenLeft/offscreenRight = false`、`outsideCard = false`，且五采样点 `inside` 全为 `true`。
- 📎 案例：2026-09 瞬间发布区改版。修复后桌面/手机两档五点全中，截图确认卡片完整显示在按钮下方。

### P-103 「清空数据」是一份手写的表清单：后加的表不会被清（可见范围组、笔名都活了下来）
- ❌ 错误：`lib/admin/data-clear.ts` 的 `clearDatabase()` 是一串手写 `deleteMany`。数据清理功能（2026-09-06）之后新增的 `PenName`（2026-09-25）与 `MomentVisibilityGroup`（2026-09-27）**没有人回头补进清单**，于是「清除所有数据」跑完，可见范围组还在（用户在后台现场发现）。
- ✅ 根因不是漏了一行代码，而是**没有覆盖守卫**：清理清单和 `schema.prisma` 之间没有任何东西在比对，加表时不会报错，表就静默活下来。
- ✅ 修法：
  1. `lib/data-clear/coverage.ts` 显式登记三档：删除（`DATA_CLEAR_DELETE_ORDER`，顺序 = 依赖顺序，`Comment` 先删回复）/ 保留（`Setting`、`HomeModule`、`HomePlacement`）/ 按条件删（`AdminUser`）。
  2. `lib/data-clear/coverage.test.ts` 三方比对：schema 全表 ↔ 覆盖清单 ↔ `data-clear.ts` 里真实的 `tx.X.deleteMany(` 调用。漏登记、登记了没删、删了没登记、顺序不对，`pnpm test` 都会失败。
  3. 扫描 `data-clear.ts` 时**必须先去掉注释**：注释掉的 `deleteMany` 也会被正则当成"删了"（负向验证真踩到——注释掉 `penName.deleteMany()` 后用例仍然全绿，补了 `stripComments()` 才拦住）。
- ✅ 验证口径（本次实做）：把 `PenName` 从清单里删掉 → 用例失败；注释掉 `penName.deleteMany()` → 用例失败；恢复 → 全绿。DB 级用 `scripts/verify-data-clear.ts` 在 scratch 库铺齐全表数据后调 `clearDatabase()`，7/7 通过（可见范围组 1 → 0、笔名 1 → 0，`Setting`/`HomeModule`/`HomePlacement` 含新写入的行原样保留）。
- 📎 案例：2026-10 用户「为什么清除所有数据后可见范围组还在？检查一下其它的会不会也有这种情况」。**同类风险**：任何"手写枚举全表"的地方（备份清单、导出、统计）都要配一个对着 schema 的守卫，别指望下次记得。

### P-104 概览页半宽行别用 `auto-fit`；服务端造的插槽元素塞进动态子元素数组必须给 key
- ❌ 错误 1（**版面跑偏**）：`.admin-dash__wide` 原来用 `repeat(auto-fit, minmax(320px, 1fr))`。卡片从 2 张加到 4 张后，1200px 宽的舞台能塞下 3 列 → 排成 **3+1**，右下角空一块，「两两成行」直接没了。`auto-fit` 的列数跟**容器宽度**走，不跟卡片数走。
- ✅ 修法：`repeat(2, minmax(0, 1fr))` 固定两列 + `> .admin-dash__slot:last-child:nth-child(odd) { grid-column: 1 / -1 }`（奇数张时最后一张占满整行），这样「隐藏卡片 = 不渲染」的约定仍然不留空洞；≤768px 单列。
- ❌ 错误 2（**dev 报错，构建不报**）：卡片槽位写成 `<div className="admin-dash__slot">{content}<button/></div>`，`content` 是服务端组件造的元素 → React dev 报
  `Each child in a list should have a unique "key" prop … Check the render method of DashboardView. It was passed a child from AdminDashboardPage.`
  **`tsc`、`next build`、截图都看不出来**，只有 dev 控制台与左下角「1 Issue」角标。定位靠 A/B：用 `PUT /api/admin/settings` 逐张关卡片再复看控制台，才排除掉新加的那张卡、锁定是 `{content}` 这个动态子元素数组。
- ✅ 修法：**带 key 的 Fragment** 包住服务端元素——`<Fragment key="card">{content}</Fragment>`，静态兄弟节点也补 `key="hide"`。Fragment 不产生 DOM 节点，`> .admin-card` / `> :not(.admin-dash__hide)` 这些直接子选择器不受影响（改完量了 8 张卡的盒子：位置尺寸与改前一致）。
- ✅ 规则：凡是「服务端造好内容、client 组件只负责摆位」的插槽式渲染，都要当成数组子元素对待，逐个给 key；改完 dev 页面的角标应为 0 issue。
- 📎 案例：2026-10 概览页加「快速发瞬间」卡（占原阅读量最高位置、阅读量最高下移、最近文章改半宽）。

## 追加模板

```markdown
### P-0XX 标题
- ❌ 错误：（实际做了什么）
- ✅ 规则：（正确做法，含文件路径）
- 📎 案例：（关联里程碑/日期）
```

### P-105 Prisma 迁移里的 `DROP TABLE` 重建会顺着 `ON DELETE CASCADE` 吃掉关联表；dev server 占库时 `migrate` 一定失败
- ❌ 错误：给「静态页面」加迁移时直接用了 `prisma migrate dev` 生成的 SQL。它除了建 `StaticPage`，还**顺带重建了 `Post` 表**（`CREATE TABLE new_Post` → `INSERT SELECT` → `DROP TABLE "Post"` → `RENAME`）——那是一段与本次功能无关的「列顺序规范化」churn。`DROP TABLE` 触发了 `PostTag.postId` 上的 `ON DELETE CASCADE`，**实测 `PostTag` 17 行 → 0 行**（Post↔标签的关联被静默删光）。
  - 同一次还踩了两个连带的坑：① `prisma migrate dev` / `deploy` 在 **Next dev server 常驻占库时必然 `database is locked`** —— Prisma schema engine 的 `busy_timeout` 为 0，不会等锁，而 better-sqlite3 可以等；② 我用「拷回主库文件」的方式回滚，**没清 `-wal`/`-shm`**，旧 WAL 在下次打开时被重放（且文件被 dev server 持有、`rm` 直接 EPERM），于是回滚看起来"生效了"其实没有。
- ✅ 规则：
  1. **生成迁移后逐行读 SQL**。出现 `DROP TABLE` / `CREATE TABLE "new_*"` 时先问：这段是本次功能必需的吗？不是就删掉，只留必需 DDL。`Post` 那次重建纯属列顺序差异（schema 定义顺序 vs 迁移历史的追加顺序），不影响功能。
  2. 真要重建表，先在**副本**上按 Prisma 的执行方式验证数据存活：`PRAGMA foreign_keys=OFF` **必须在事务外**执行——在事务里它是**静默 no-op**，`DROP TABLE` 会带着级联删干净（我第一次验证脚本就是这么把自己骗过去的）。
  3. dev server 在跑时不要跟它抢库：要么停掉它再用 `migrate deploy`，要么用 `better-sqlite3` + `busy_timeout` 直接应用 DDL（写完按 Prisma 口径补 `_prisma_migrations` 记录：checksum = `migration.sql` 的 sha256；`prisma migrate status` 应报 `Database schema is up to date!`）。
  4. 回滚**不能只拷主库文件**：`-wal`/`-shm` 必须一起处理，否则旧帧会被重放。清不掉（EPERM = 有进程持句柄）就别硬来，改用 SQL 级修复。
  5. 动库前先做**可验证的快照**（记录 `Post`/`PostTag`/`Upload`… 的行数），改完逐项比对——这次正是靠它发现 `PostTag` 归零。
- 📎 案例：2026-10 静态页面功能。最终迁移只保留 `CREATE TABLE "StaticPage"` + 唯一索引（见 `prisma/migrations/20261001061500_static_page/migration.sql` 的注释）。

### P-106 别拿「部分命令输出」当事实：一次误读差点凭空造出一个假 bug 并改库
- ❌ 错误：诊断 `Post.recommend` 是否存在时，我先跑了一个临时脚本，输出里 `Post` 的列清单**其实含 `recommend`**，我在汇总时漏看了它，据此判定「迁移标了 applied 但列没建上 = schema 漂移」。接着**基于这个假前提写了一支 reconcile 迁移**（`ALTER TABLE "Post" ADD COLUMN "recommend"`），差一步就改名应用；应用时 SQLite 直接报 `duplicate column name: recommend` 才暴露真相。
- ✅ 规则：
  1. **结论要落到"逐项比对"，不要落到"我扫了一眼"**：判断某个字段/列/类名存不存在，用 `includes()` / `filter` 出**缺失清单**，让结果自己说话，而不是肉眼看一长串输出。这次用 `required.filter((name) => !postCols.includes(name))` 一眼就否掉了假前提。
  2. **矛盾信号必须当红灯**：迁移记录显示 applied、schema 文件也写着该字段，但"你判定列不存在"——这时候两个来源已经打架了，正确动作是**先停下来核对**，而不是顺着其中一个来源往下修（我当时顺着"列缺失"写迁移了）。
  3. 造出新的迁移/SQL/回滚脚本后，先用**只读探针**验证前提（`pragma_table_info`、`sqlite_master`），再执行写操作。
  4. 与 P-077 同源：**工具输出本身也要交叉验证**，包括"我读工具输出"这一环。
- 📎 案例：2026-10 静态页面功能（与 P-105 同一次事故链）。

### P-107 静态页面的目录冲突：`notFound()` 让位要在应用层显式做，且 `notFound()` 不是硬 404
- ❌ 错误：给静态页面做「自定义目录」时，只在前端做了目录名格式校验。风险是目录取成 `posts` / `admin` / `api` 这类已被框架路由占用的段——**`src/app/[dir]/[slug]` 在 Next 里优先级最低**，这些地址永远轮不到静态页处理，用户会以为"建成了却打不开"。
- ✅ 规则（三闸缺一不可）：
  1. **写入闸**：保留清单 `lib/pages/directories.ts` 的 `RESERVED_SEGMENTS` 同时管目录与 slug，分 `block`（硬拒）/ `warn`（提示但放行）两档。判定**顺序**是先保留清单再字符形态——反过来的话 `robots.txt` / `rss.xml` 会先撞"只允许小写字母数字-_"的规则，用户拿到的提示是"格式不对"，而真因是它占了 robots / RSS 地址。
  2. **运行期让位**：`src/app/(static)/[dir]/[slug]/page.tsx` 在目录命中保留段时直接 `notFound()`，把地址交给框架路由，**不自作处理**。
  3. **回归守卫**：`lib/pages/directories.test.ts` 读真实的 `src/app/` 顶层条目，与保留清单比对——将来新加一个顶层栏目（例如 `/notes`）而忘了登记，`pnpm test` 直接失败并提示"同名目录下的静态页面会被框架路由顶掉"。**这是"框架路由完全优先"唯一可自动验证的一环。**
- ⚠️ **`notFound()` 不等于硬 404（本应用实测）**：页面组件里调 `notFound()` 返回的是 **200 + 应用的 404 页**；只有完全没匹配到路由才真给 404。既有的 `/categories/[slug]` 同样如此（`/categories/no-such-category` → 200；`/definitely-not-a-route-xyz` → 404）。所以写这类验收时**断言"是否渲染了 404 页 / 是否泄漏了页面内容"，别死盯 status code**——否则会把既有行为误判成自己新写的 bug。
- 📎 案例：2026-10 静态页面功能（用户要求「目录完全自定义，但创建和运行都要检查冲突，Next 路由完全优先，冲突时要能随时停掉」）。

### P-108 静态页面是独立文档：`RootLayout` 的页头页脚**卸载不掉**，只能用作用域 CSS 盖
- ❌ 错误：以为给静态页单独挂一个嵌套 `layout.tsx` 就能不套站点页头页脚。**Next 里父布局无法被子布局卸载**——`src/app/layout.tsx` 已经在最外层渲染了 `SiteHeader` / `Footer`，嵌套 layout 只是多包一层，页头页脚照样在。
- ✅ 规则：静态页路由组 `src/app/(static)/layout.tsx` 里注入一段**带作用域前缀**的样式把这三块藏掉（`.site-navbar` / `.mobile-drawer` / `.site-footer`），并复位 `body` 的顶部留白：
  ```css
  body:has(.static-page-shell) .site-navbar,
  body:has(.static-page-shell) .mobile-drawer,
  body:has(.static-page-shell) .site-footer { display: none !important; }
  ```
  `:has()` 的作用域就是「静态页这一棵子树」，其它页面 DOM 里没有 `.static-page-shell`，不受影响。**要动 `RootLayout` 才能解决的话，代价是把全站每个路由的文件位置都搬进路由组**，收益与风险不成比例。
- ✅ 另一个应用层别自作聪明：静态页 JS 运行时**不要去 patch `setTimeout` / `EventTarget.prototype.addEventListener`** 做"全局副作用回收"——那会连 React 与全站的监听一起劫持。定时器/全局监听残留属于管理员代码自负其责的部分，**写进编辑器提示里说清楚**，而不是假装框架能兜住。
- 📎 案例：2026-10 静态页面功能（每页 HTML/CSS/JS 三栏，复用首页自建模块那套直接注入的决策）。

### P-109 `prisma generate` 之后不重启 dev server，新模型在**已经跑着的那个进程里永远是 `undefined`**
- ❌ 错误：静态页面交付后，用户打开 `/admin/pages` 报 `Cannot read properties of undefined (reading 'findMany')`（`prisma.staticPage.findMany`）。这个报错**很容易被误判**成「迁移没应用 / 表不存在 / 代码写错了」——实际逐项核对：库里 `StaticPage` 表在（0 行）、迁移记录 `finished_at` 正常、生成的客户端里 `prisma.staticPage` 也在。**唯一不对的是那个进程**：dev server 比 `prisma generate` 早起了 7 分钟。
- ✅ 规则：
  1. **先分状态再动手**：`prisma.<model>` 是 `undefined` ⇒ 进程里的客户端不认识模型（**修法是重启进程**）；报 `P2021 / no such table` ⇒ 库里缺表（**修法是跑迁移**）。两者完全不同的修法，别互相顶替，也别拿其中一个的现象去改另一个。
  2. dev 下 `PrismaClient` 挂在 `globalThis`（`lib/db.ts` 的 `globalForPrisma`），HMR 只会**复用旧实例**——**热更新救不了，必须重启进程**；`prisma generate` 只改磁盘文件，改不了已经加载进模块图的类。
  3. **分进程定位**：同一个函数「在这个终端 500、在一个新进程里正常」时，不要再翻代码和数据库了，根因就是进程年龄。新进程跑一次真实函数（`tsx` 直接调 `listStaticPages()`）比读十分钟代码都快。
  4. 新模型一律经 `lib/db-schema.ts` 的 `requirePrismaModel()` 取委托，缺失时抛 `SchemaNotReadyError`（`SCHEMA_MISSING`，由 `handleAdminError()` 转成 JSON），提示直接写「重启 `pnpm dev`」——把这条坑的**排查成本从"翻代码"降到"照做"**。
- 🔎 **同一个进程里通常不止一处坏**：这类"进程早于 generate"是**全局**状态，凡是读新模型的入口都会一起坏。本次顺带发现用户的 `/sitemap.xml` **也是 500**（它也读 `StaticPage`），只是没人打开过。排查时要把该模型的所有读入口都数一遍，别只修用户报的那一个。
- 📎 案例：2026-10-01 静态页面功能交付后。时间线——dev server 12:11 启动 → 迁移 13:15 应用 → 客户端 13:18 生成 → 13:21 构建 → 用户 13:37 打开后台即报错。同一份代码在新进程里 `listStaticPages()` 与 `listEnabledStaticPages()` 都正常返回。

### P-111 编辑器页「无顶栏」只在桌面档成立：竖屏下没有上下导航 = 进得去出不来
- ❌ 错误：`.admin-workspace--editor` 一路做到底——桌面档不要顶栏（画布铺满，P-033）是**对的**，但顺手把手机档的底部 tab bar 也 `display: none` 掉、顶栏又在 JSX 里直接 `{editor ? null : …}` 不渲染。结果竖屏下 `/admin/home` 只剩编辑器自己那条「设置/画布」分段控件，**上方和下方的全局导航全没了**（用户报的原话：「失去了下方和上方的其它都有的导航栏」）。
- ✅ 规则：
  1. **桌面排版决策不要顺手带到手机档**。「桌面不要顶栏」的理由是画布要铺满；手机档的顶栏 + 底栏是**唯一的全局导航**，理由不成立。要按视口分别决定（`@media (min-width: 769px)` 里收顶栏，手机档保留）。
  2. **判据是「这一页自己有没有返回入口」**，不是「它是不是编辑器」。写文章自带头部与「返回文章列表」（`.post-workspace__back`），可以不保留；首页画布、模块编辑什么都没有，必须保留。新增编辑器页时先问这一句。
  3. 保留底栏的同时**必须给底栏让出高度**（`.admin-workspace--editor-chrome` 的 `padding-bottom: calc(var(--admin-tabbar-h) + env(safe-area-inset-bottom))`）——编辑器页是 `height:100dvh; overflow:hidden`，不让高度会被底栏压住画布底部。同权重选择器**靠源码顺序覆盖**，这条必须写在 `.admin-workspace--editor` 之后。
  4. 验证别靠眼睛：在真页面里量「编辑区底边 vs 底栏顶边」。自检用 `pnpm shot` 对着**真 `admin.css`** 的 DOM 复刻页量（见下方案例），结论要写成 `overlap=0px` 这种数字。
- ⚠️ **复刻页做 CSS 验收时，别忘了 `globals.css` 的全局复位**：`*{box-sizing:border-box}` 与 `body{margin:0}` 缺任何一个都会算错——少了 `body{margin:0}` 会凭空多出 8px，把「没被底栏压住」误判成压住（实测 `overlap=8px`，补上复位后是 `0px`）。`admin.css` 是独立文件、不复位这些。
- 📎 案例：2026-10 竖屏首页管理导航缺失。修后手机档（504×805）实测 `tabbar=shown topbar=shown padB=56px overlap=0px`（`edB=749 / barT=749`，编辑区底边正好落在底栏顶边），桌面档（1370×805）仍是 `tabbar=hidden topbar=hidden padB=0px`，即 P-033 的桌面排版未动。

### P-112 删掉一个入口之后，指向它的文案就变成假话了：单卡「叉掉」必须自带回头路
- ❌ 错误：概览页每张卡片右上角有个 ✕（`admin-dash__hide`，点一下把该卡写进 Setting `dashboardCards` 并隐藏）。用户叉掉一张卡后卡就没了，**只能去前台导航栏的「外观」图标里勾回来**；而空态文案写的是「用顶栏「外观」重新勾选」——**后台标题行早就按用户要求把「外观」按钮删掉了**（`admin.css` 里明写着"曾短暂放过…两个都按用户要求删掉了"）。于是用户被告知去点一个不存在的控件，只能来问「叉掉怎么恢复」。
- ✅ 规则：
  1. **删入口时要连文案一起改**。入口搬走后，任何"用顶部/那个按钮"的说法都必须重写成**真实存在**的路径（本例：前台导航栏的「外观」图标 → `/admin?appearance=1` → 「概览卡片」）。规范层的事实源在 [admin-ui-rewrite-spec.md](admin-ui-rewrite-spec.md) 的「入口演进（三次）」一节——**改入口先改那里，再全局搜一遍旧说法**。
  2. **破坏性/隐藏性操作要在原地给回头路**。✕ 在卡片上，恢复入口在别的页面，这个不对称就是坑。做法：只要隐藏数 > 0 就在网格里出现一行 `已隐藏 N 张卡片 · 全部显示`（空态另给「恢复默认」）。判据是"误触之后能不能一眼找到回来的路"，不是"功能上有没有办法恢复"。
  3. **这行提示要放在子元素列表的最后**：`.admin-dash > *:nth-child()` 用它做入场延迟，插在前面会让所有卡片的延迟整体错位。
  4. 两个语义别混：**全部显示**（把叉掉的都放出来）≠ **恢复默认**（回到出厂默认）。入口文案与实现都要分开，否则将来默认值改成"只开一部分"时，「全部显示」会变成假按钮。
- 📎 案例：2026-10 用户提问「仪表盘卡片上的叉是什么鬼？叉掉怎么恢复」。（同类历史：P-077 的静默丢样式、P-091 的浮层被盖住——都是"看起来没坏、实际用户找不到"。）

### P-110 「按钮点了没反应 / 图不显示」可能根本不是客户端的 bug：宿主地址不在 `allowedDevOrigins` 时，Next dev 客户端会降级到**不 hydrate**
- ❌ 现象（Android 客户端 / GeckoView 壳，加载 `http://10.0.2.2:3000`）：首页**背景图不显示**，其余元素（导航、卡片、标签、页脚）全部正常；登录页输入账号密码后**点「登录」毫无反应**——页面看着像没收到点击。
- 🔍 **决定性取证**（logcat）：`handleMessage GeckoView:LocationChange uri=http://10.0.2.2:3000/admin/login?username=admin&password=admin123456`。
  这是**原生 GET 表单提交**（账号密码出现在 query 里）。而 `components/admin/LoginForm.tsx` 的 `handleSubmit` **第一句就是 `event.preventDefault()`** —— 只要那个 handler 被绑定过，原生提交就绝不可能发生。**结论：React 从未 attach 事件 = 页面没 hydrate**，不是"点击无效"，更不是 App 的触摸/视图问题。同一根因也解释了背景图：`.home-backdrop__img{opacity:0}`，只有 `HomeBanner` 的 `onLoad` 给元素加上 `.is-ready` 才显形（`components/home/HomeBanner.tsx:118` + `app/globals.css:708-719`）——JS 不跑，图永远透明。**两个症状，一个根因。**
- ❌ 排查中走过的两条死路（留档省时间）：
  1. 怀疑 `/_next/static/*` 被 Next 的跨源拦截 403。实测**确实 17/17 全 403（连 CSS 都是）**——但那只针对**带 `Origin` 的请求**（`next/dist/server/lib/router-utils/block-cross-site-dev.js:107` 只在 `Origin` 存在且不在白名单时拦）。页面的 `<script src>` / `<link rel=stylesheet>` 是同源加载、**不带 `Origin`** → 全部 200。
     **判据：页面样式完整渲染 ⇒ CSS 拿到了 ⇒ 静态资源通路是好的，别再往这条查。**
  2. 怀疑远端背景图挂了。主机侧 `curl` 那张 Bing 图是 `200 image/jpeg 337076` 字节，**图是好的**。
- ✅ 根因：`main/next.config.ts` 的 `allowedDevOrigins` 当时只写了 `["192.168.2.*", "*.ts.net"]`，**没有 `10.0.2.2`**。HMR 的 `ws://…/_next/hmr` 握手**带 `Origin`**，命中拦截 → 403 → Gecko 报
  `The connection was refused when attempting to contact ws://10.0.2.2:3000/_next/hmr`，每 2 秒重试一次，并伴一条 `uncaught exception: undefined`。dev 客户端在这个状态下**降级到不 hydrate**。
- ✅ 修法：`allowedDevOrigins` 加上宿主地址（`"10.0.2.2"`，`*` 恰好替换一段标签，也可写 `"10.0.2.*"`），**然后完全重启 dev server**（配置在启动时读取，日志里出现 `✓ Running next.config.ts took Nms` 才算生效）。
- ✅ 验收判据（三条同时成立才算修好，别只看"能点了"）：
  1. logcat 出现 `[HMR] connected` **且** 出现 `Download the React DevTools for a better development experience`（后者是 React 真的启动了的标志）；
  2. `_next/hmr` 报错数 = 0、`JavaScript Error` 数 = 0；
  3. 点登录**不再**产生 `?username=…&password=…` 的 LocationChange，且能进 `/admin`。
- ⚠️ **这是 dev-only 的降级路径**：生产构建没有 HMR 客户端，不存在这条失效链。所以「真机上按钮也点不动」时要先问清：它连的是 dev server 还是生产构建。
- 💡 一条能加速定位的可用性事实：**Next dev 客户端会劫持页面 `console.*` 并排队等 HMR socket 转发**（`_forwardlogs.logQueue.onSocketReady`，见 `next/dist/client` 的 `0gsm_next_dist_client_*.js`）。socket 不通时页面 console **一条都不会落 logcat** —— 这本身就是「dev 客户端没起来」的信号，**别误读成「JS 没跑」**（真没跑的话连 HMR 报错都不会有）。
- 📎 案例：2026-10-01 Android 客户端（GeckoView 壳）联调。用户同时报「模拟器里背景图加载不出来，其它元素没啥问题」与「登录界面点击登录没反应」，两者同一根因。
- 🔎 **同类风险**：凡是「换了宿主/域名，但 `allowedDevOrigins` 没跟上」的场景都会复现同一组症状——换网段、换模拟器、走 Tailscale、真机连 LAN、改用云主机域名。**新宿主地址要同时进 `allowedDevOrigins` 与 Android 的 `START_URL`**，只改一侧就是给下一次留同一个坑。见 [docs/android/debug.md](android/debug.md)。

### P-113 打包拒绝名单把 `.env.example` 一起拒了：空机首装 `install.sh` 当场中断
- ❌ 现象（2026-10-01 首次 Linux 上机）：照 [INSTALL.md](../main/INSTALL.md) 在空机解压 `pnpm pack:update` 的 tar.gz，跑 `bash scripts/install.sh`，**连依赖都没开始装就退出**：
  ```
  cp: cannot stat '.env.example': No such file or directory
  ```
  解压后的根目录里确实没有这个文件（只有 `package.json` / `src/` / `scripts/` / `INSTALL.md` …）。
- ✅ 根因：`main/src/lib/update/paths.ts` 的拒绝名单写的是「`.env` 与一切 `.env.*`」，模板文件 `.env.example` 命中 `posix.startsWith(".env.")` 被排除；而 `main/scripts/install.sh` 在 `set -euo pipefail` 下直接 `cp .env.example .env`——源文件不存在 → `cp` 返回 1 → **整脚本退出**。打包侧 `collectPackFiles` 与覆盖侧用的是同一条 `hasDeniedPrefix`，所以每一份历史包都缺这个文件。`pnpm setup` 反而有兜底（`init-production.ts` 的 `readEnvFile` 读不到模板时写最小 `.env`），**只有 `install.sh` 是硬依赖**。
- ✅ 规则：
  1. **模板随包，密钥不随包**。拒绝名单只该拦真会装密钥的文件（`.env`、`.env.local`、`.env.production` …），`.env.example` 必须白名单放行——它是首装链路的一环，不是秘密。
  2. **首装脚本不许硬依赖「包里有某个文件」**。模板缺失要自己兜底（现在会写最小 `.env`），否则一条打包规则的小改动就能让空机部署彻底走不下去。判据：**把包砍到只剩 `package.json` + `src/` + `scripts/`，`install.sh` 仍要能跑完**。
  3. **改拒绝名单必须补断言钉住**：`update.test.ts` 里 `.env.example` 可打包，`.env` / `.env.local` / `.env.production` 不可打包。
- 🩹 已踩坑的机器上绕过（在解压目录执行，再跑安装脚本）：
  ```
  printf 'DATABASE_URL="file:../data/blog.db"\n' > .env
  bash scripts/install.sh
  ```
  `SESSION_SECRET` 由随后的 `pnpm setup` 生成写回（`init-production.ts` 见长度不足或占位符就重新生成），所以这里只补 `DATABASE_URL` 就够。
- 📎 案例：2026-10-01 首次上机部署（Debian，程序装在 `/root` 而非 `/opt/myblog`；tar 已解压、swap 已加）。绕过后继续安装。

### P-114 脚本（`tsx scripts/*.ts`）里别调应用层的写库函数：`revalidatePath` / `unstable_cache` 都要 Next 请求上下文
- ❌ 现象（2026-10-01 写 Halo 导入脚本 `scripts/import-halo.ts`）：想「复用后台的发文/发瞬间逻辑」，第一版直接调 `createAdminPost()` / `createAdminMoment()`，`npx tsx` 一跑就抛
  ```
  Invariant: static generation store missing in revalidatePath /
  ```
  换成「只读也复用」的 `listPublishedPosts()` 验收，同样炸：
  ```
  Error: Invariant: incrementalCache missing in unstable_cache async()=>{…}
  ```
  两处都不是数据问题：**报错来自 `next/cache`**，而不是 Prisma。
- ✅ 根因：`lib/admin/revalidate.ts` 的 `revalidatePublicContent()`（`revalidateTag` / `revalidatePath`）与 `lib/cache/public.ts` 的 `cachedPublic()`（`unstable_cache`）都是 **Next 请求级 API**，靠请求上下文里的 store 工作。CLI 进程没有那个 store；而且第一个是**先写库再抛**（记录已进库、调用方却收到异常），拿它包 try/catch 还会把成功误报成失败。
- ✅ 规则：
  1. **脚本里出现 `next/cache` 的导入就是雷**。写库要么直接 `prisma.*`，要么把那层包装成「可注入的 revalidate 回调」，让 CLI 传一个 no-op。
  2. **能复用的复用，别因为这一条就整段重写**：`normalizePostContent()`、`allocatePublicId()`、`originalMediaKey()`、`finalizeUpload()`、`loadHaloBundle()` 这些纯函数/存储层在 CLI 里都正常，只有碰 `next/cache` 的那几层不行。
  3. **导入完必须重启应用**才是「立刻可见」：公开页缓存 `revalidate=60` 且 tag 在**进程内存**里，`pm2 restart myblog` 最省事（不重启就等最多 60 秒）。
  4. 脚本自己读 `.env`：`process.loadEnvFile()`（Node ≥22 内置）要在 import `lib/db` **之前**执行，否则 `DATABASE_PATH` 已经算完了——所以应用层模块用动态 `await import()`。
- 📎 案例：2026-10-01 Halo 备份导入（见 [halo-import-spec.md](halo-import-spec.md)）。同类风险：任何「一次性数据修复/批量导入/报表」脚本只要写库并想立刻看到前台效果，都会踩同一条。

### P-115 程序装在 `$HOME`（`/root`）里：pm2 的 `.pm2/rpc.sock` 落进项目根 → `next build` 直接被 Turbopack 读 socket 打崩，更新从此永远失败，而且会**每小时 1 次的重启死循环**
- ❌ 现象（2026-10-01 首次上机，程序解压在 `/root`）：后台导入更新包 → 应用看起来在跑、但过一会儿就重启一次；`ss -ltnp` 查不到 3000 端口，`curl 127.0.0.1:3000` 连接不上；`pm2 logs` 里是这段循环：
  ```
  [myblog] 开始应用程序更新 {"name":"myblog-update-import-…","mode":"start"}
  [myblog] 依赖有变化，开始 pnpm install
  [myblog] 预约更新返回 1，仍尝试启动应用
  … FATAL: An unexpected Turbopack error occurred …
  Caused by: - reading file "/root/.pm2/rpc.sock" - No such device or address (os error 6)
  ```
- ✅ 根因链（三段，缺一段都不会这么表现）：
  1. **项目根 = `/root`**，而 pm2 的运行时目录 `/root/.pm2`（里面有 Unix socket `rpc.sock`）就在项目根里。`next build` 的文件扫描读到 socket 直接 panic → **这台机器上任何一次构建都会失败**（首次装机时 `.pm2` 还不存在，所以 `install.sh` 那次 `pnpm build` 是成功的——坑要等第一次发版才炸）。
  2. `lib/update/apply.ts` 的顺序是 **先 overlay 覆盖程序文件 → pnpm install → prisma migrate deploy → next build**。构建失败时 `.next` 会从 `.next.bak` 回滚，但**`src/` 已经是新代码了** → 机上一度是「新源码 + 旧构建」。
  3. 失败路径**不执行** `cancelPendingUpdate()`（它只在成功后调用），`data/update-pending.json` 里 `restartAt` 仍是过去时间 → `lib/scheduler/index.ts` 的 `checkDueUpdateRestart()` 每 60 秒判定「已到期」→ `scheduleAppRestart()` → 进程退出 → pm2 拉起 → boot 再尝试更新（再失败）→ **永久循环**，站点的在线窗口只够撑到下一次重启。
- ✅ 规则：
  1. **程序目录永远不要用 `$HOME`**：标准布局是 `/opt/myblog`（pm2 家目录 `~/.pm2` 与项目互不包含）。已经装在 `/root` 的，把 pm2 家目录挪出去也行：`pm2 kill && rm -rf /root/.pm2 && mkdir -p /var/lib/pm2`，之后所有 pm2 命令带 `PM2_HOME=/var/lib/pm2`（写进 `/root/.bashrc`，并 `pm2 startup` 刷新一次开机自启，否则重开机又回到 `/root/.pm2`）。
  2. **循环的开关是 `data/update-pending.json`**，不是 pm2：`rm -f data/update-pending.json data/update-state.json` 等价于后台的「取消更新」。先修好构建能过的前提，再清这个文件，最后 `pm2 start/restart`。
  3. **构建必须先手动验一次**：`NODE_OPTIONS="--max-old-space-size=768" pnpm build` 在停服状态下跑通，再去碰 pm2——否则你分不清是「更新流程坏了」还是「构建本来就不可能成功」。
  4. 排查顺序：`pm2 list`（看 ↺ 与 uptime）→ `ss -ltnp | grep 3000`（没监听 = 多半在循环里）→ `pm2 logs --lines 40 --nostream`（找 `FATAL` 与 `预约更新返回`）→ 看它打印的 `/tmp/next-panic-*.log`。
- 📎 案例：2026-10-01 腾讯云轻量（Debian，安装到 `/root`）。P-113 的案例备注里那句「程序装在 `/root` 而非 `/opt/myblog`」就是同一个隐患的前半段。

### P-116 生产模式 cookie 带 `Secure` + 站点跑明文 HTTP = 后台永远登不进去（表现是「CSRF 校验失败」）
- ❌ 现象（2026-10-01 同一台机器）：后台登录页正常显示，点「登录」后红字 **`CSRF 校验失败，请刷新后重试`**；账号密码确认无误。服务器上 `curl` 直连却是 200：
  ```
  set-cookie: myblog.session=…; Secure; HttpOnly; SameSite=lax
  set-cookie: myblog.csrf=…;     Secure; SameSite=lax
  ```
- ✅ 根因：`lib/auth/session.ts` 与 `lib/auth/csrf.ts` 都按 `process.env.NODE_ENV === "production"` 给 cookie 打 `Secure`（pm2 的 `ecosystem.config.cjs` 设了 `NODE_ENV=production`），而 `ss -ltnp` 显示 nginx **只有 :80、没有 :443**。浏览器在 `http://` 下**直接丢弃 `Secure` cookie** → 每次请求都是全新会话 → 登录 POST 缺 `myblog.csrf` → `proxy.ts` 返回 403 `CSRF_INVALID`。`curl` 不理会 `Secure`，所以命令行怎么试都是好的——这正是最容易把人带偏的地方。
- ✅ 规则：
  1. **生产部署必须 HTTPS**（README / 站长手册都以 https 为前提）。判别三连：`ss -ltnp | grep -E ':(80|443)\s'`、`curl -sS -D - -o /dev/null http://127.0.0.1:3000/api/auth/csrf | grep -i set-cookie`（有 `Secure` 就是它）、浏览器开发者工具里看 `myblog.session` 是否真的落盘。
  2. **没 TLS 时的临时解法（零代码、可回滚，但必须知道代价）**：在 nginx 的代理 location 里摘掉这两个 cookie 的 `Secure` 属性（nginx ≥1.19.3 自带），上 HTTPS 后删掉：
     ```nginx
     proxy_cookie_flags myblog.session nosecure;
     proxy_cookie_flags myblog.csrf    nosecure;
     ```
     代价：会话 cookie 会在明文 HTTP 上传输（等于把会话安全等级降到与整站明文一致）。
  3. **不要用 `NODE_ENV=development` 绕过**：`next start` 要求生产构建，dev 模式还会带来不水合、缓存失效等一堆别的问题（见 P-110）。
- 📎 案例：2026-10-01 首次上机（nginx 1.22.1 只有 :80），登录页截图里的红字就是这个 403。

### P-117 改 nginx 站点配置时的「同目录备份」会被一起加载：`include sites-enabled/*` **不看扩展名**
- ❌ 现象（2026-10-01 同一台机器）：按「先备份再改」的习惯执行 `cp /etc/nginx/sites-enabled/myblog /etc/nginx/sites-enabled/myblog.bak-20261001`，改完 reload 后 `nginx -t` 刷出十几条
  ```
  [warn] conflicting server name "bruccese.com" on 0.0.0.0:80, ignored
  [warn] conflicting server name "www.bruccese.com" on [::]:80, ignored
  ```
  网站本身能开（先加载的那个块生效），但**你改的那份可能根本不是生效的那份**——"改了没效果"的经典来源。
- ✅ 根因：Debian/Ubuntu 默认 nginx.conf 里写的是 `include /etc/nginx/sites-enabled/*;`——**通配符不看扩展名**，`.bak` / `.bak2-1903` / `myblog.old` 全部照样被加载成正式配置；里面若还有 `listen 80` + 同样的 `server_name`，就与正式文件撞名。带 `.conf` 的 `conf.d/*.conf` 同理（只认 `.conf`，但 `.conf.bak` 也会被 `*.conf` 漏进来？——不会，`*.conf` 才匹配，但 `conf.d/` 下别放同名副本）。
- ✅ 规则：
  1. **备份放到被 include 的目录之外**：`mkdir -p /root/nginx-backup && cp <file> /root/nginx-backup/<name>.$(date +%F.%H%M)`；改完验证通过再删。
  2. **判别"哪份在生效"**：`nginx -T | grep -nE 'configuration file|listen |server_name '` —— `nginx -T` 会把每个来源文件与最终配置一起打印。
  3. 清完以后 `nginx -t` 应当**一条 warn 都没有**；还有 warn 就继续找同名 `server_name`。
  4. 一次只留一份 `sites-enabled/<站点>`：改之前宁愿先 `ls -la /etc/nginx/sites-enabled/` 看清里面到底有几个文件。
- 📎 案例：2026-10-01 给站点加 443 证书时，`sites-enabled/` 里同时躺着 `myblog`、`myblog.bak-20261001`、`myblog.bak2-1903` 三份，全部被加载。修法：`mv /etc/nginx/sites-enabled/*.bak* /root/nginx-backup/ && nginx -t && systemctl reload nginx`。

### P-118 正文图和封面图不是一条路：正文按 hash 改写，封面**原样使用**——外部导入时封面必须写缩略图/COS 地址
- ❌ 现象（2026-10-01 Halo 导入后迁移到 COS）：媒体都上云了，页面**还是慢**；首页四张文章封面加起来十几 MB，`curl` 页面看到封面 src 还是 `/api/uploads/images/original/<hash>.jpg`（3–5 MB 原图），而正文里的图已经是 COS 域名。
- ✅ 根因（两条链路，容易以为是同一条）：
  1. **正文图**：`lib/markdown/mdx.tsx` 的 `loadMediaUrls()` 从正文里抽 64 位 hash → 查 `Upload` → `displaySrc` 用缩略图、`data-lightbox-src` 用原图，**配了 COS 就自动换 COS 直链**。所以正文里存 `/api/uploads/images/original/…` 没问题。
  2. **封面图**：`components/common/CoverMedia.tsx` 把 `Post.cover` 这个**字符串原样**交给 `next/image`，**没有任何 hash 改写**。谁写进去什么地址，浏览器就打什么地址；写成本机原图路径 → 每次都由应用读盘流式返回（`/api/uploads/<canonical key>` 不会 302 到 COS，只有 `media/…` 与 `images/<hash>-original.*` 别名会跳），服务器带宽和用户加载时间一起遭殃。
  3. 编辑器自己的口径是对的：`editorImageUrl(result)` = `result.thumb?.url ?? result.original.url`，即"缩略图 URL，配了 COS 就是 COS 直链"——外部导入脚本必须**照着这个口径写封面**（`publicMediaUrl(thumbMediaKey(hash))`），否则就复现本坑。
- ✅ 规则：
  1. **改封面类的字段前先看它会不会被改写**：搜 `firstMediaHash(` / `resolvePublicImageUrl(` 有没有覆盖这条路；`CoverMedia` / `PostCard` / `PostHero` 这条是"原样使用"。
  2. **缩略图别只当预览**：它是列表/封面/正文显示层的标准素材（`thumbMaxPx` 默认 480，webp），原图只留给灯箱。
  3. 已经写错的封面，用后台「文章 → 封面 → 从媒体库重选」重写一遍即可（媒体库选出来的是 `thumb.url`，配了 COS 就是 COS 直链）；批量修就走导入脚本的 `--update-posts`（只覆盖正文/封面/摘要/分类，不动状态与时间）。
- 📎 案例：2026-10-01 `scripts/import-halo.ts` 第一版把封面写成了 `resolveImage(ref)`（原图地址），迁移 COS 后仍然慢；已改成 `publicMediaUrl(thumbMediaKey(hash))`，见 [halo-import-spec.md](halo-import-spec.md) §3/§4。

### P-119 灯箱原图别默认走 `?proxy=1`：原图动辄几 MB，站点中转会把轻量机出网带宽当瓶颈（实测 8 倍差）
- ❌ 现象（2026-10-01 迁 COS 后）：首页已经很快（TTFB 0.24s、16 张全是 COS 缩略图 7–26 KB），但**点开一张原图要等好几秒**。同一张 4.82 MB 原图，客户端实测：
  ```
  proxy  .../api/uploads/images/original/9d/9d45827….jpg?proxy=1   200  5049788B  4.895s  1031559 B/s
  cos    https://<bucket>.cos.ap-shanghai.myqcloud.com/images/original/9d/9d45827….jpg  200  5049788B  0.623s  8103387 B/s
  ```
- ✅ 根因：`components/common/Lightbox.tsx` 取原图时是 `image.key ? proxyUrl(image.key) : image.src`——**只要图带存储 key 就优先 `?proxy=1`**（`/api/uploads/<key>?proxy=1` 明确不 302 到 COS，由 Node 读盘/读桶再流给浏览器）。当初这么写是为了同源 + XHR 能报进度 + blob 缓存；但**这与 [cos-storage-spec.md](cos-storage-spec.md) §4 写的「灯箱原图使用 COS URL」不一致**，等价于把每张 3–5 MB 的原图都塞进站点服务器（腾讯云轻量常见 3–6 Mbps 峰值），COS 的带宽完全没用上。
- ✅ 规则：
  1. **大对象（原图/视频/音频）一律直连对象存储**，只有"站内路径"才用同源代理；判断依据是 URL 形态（`/api/uploads/` 前缀）而不是"有没有 key"。
  2. **直连要能优雅降级**：跨域 XHR 失败（桶上没配 CORS 最常见）→ 先退回 `?proxy=1`，再失败就 `<img>` 直载 src（没有进度环但图能出来）。三步都不做就等于"要么慢、要么坏"。
  3. **要进度环，就在桶上加 CORS**：`Origin: https://<站点域名>`、`Methods: GET, HEAD`、**必须 `Expose-Headers: Content-Length`**（否则 `event.lengthComputable` 恒为 false）。改完用 `curl.exe -sS -I -H "Origin: https://<域名>" <COS URL> | findstr /i access-control` 验一下有没有回 `Access-Control-Allow-Origin`。
  4. **排查口诀**：页面本身快、只有"点开大图/播放视频"慢 → 先量"经站点"与"直连"两条路的 `speed_download`，差一个数量级就说明有代理兜在中间。
- 📎 案例：2026-10-01 `src/lib/client/lightbox-src.ts`（新增）+ `Lightbox.tsx` 改为「优先直连、失败回退代理」，配 `lightbox-src.test.ts` 5 项单测。

### P-120 打包走的是「文件系统遍历」，`.gitignore` 拦不住本机验证产物：35 张截图曾占掉整包 3.01MB 里的 2.51MB
- ❌ 现象（2026-10-01 发 0.1.2 时实打包发现）：`pnpm pack:update` 打出的包 584 个文件 3.01 MB，其中 **`.ui-shots/` 33 个 + `.promo-shots/` 2 个 = 35 个截图/JSON，未压缩合计 2.51 MB**——**包体积的八成是本机 UI 截图**，而且应用更新会把它们覆盖进服务器的项目目录。
- ✅ 根因：`packCurrentApp()` 是**文件系统遍历**，过滤只认 `lib/update/paths.ts` 里的拒绝名单（`data/`、`node_modules/`、`.next/`、`.git/`、`coverage/`），**不看 `.gitignore`**。而 `main/.gitignore` 里写着 `/.ui-shots/`、`/.promo-shots/`——于是"本机只管忽略、打包照收"。`packAppFromGitRef()`（`--git`）走 git 树，天然没有这些文件，所以**只有默认的 `pnpm pack:update` 会中招**，两条路径结果不一致也掩盖了问题。
- ✅ 规则：
  1. **新增任何"落在项目目录里的本机产物"（截图/抓板/临时导出），同时进两处**：项目 `.gitignore`（不提交）**和** `lib/update/paths.ts` 的 `DENIED_ROOTS` / `DENIED_PREFIXES`（不打包）。少写第二处 = 它会被发到服务器。
  2. **发版前扫一眼包内清单**：`tar -tzf main/data/updates/myblog-update-*.tar.gz | Measure-Object -Line` 看条目数，或 `tar -tzvf …` 按大小排序看有没有陌生的胖目录。3 MB 的包对程序文件来说已经算大（`src/` 501 个文件其实很小）。
  3. **带点号的目录名别指望被默认拒掉**：`.env*` 是**显式**特判的（P-113），拒绝名单不是"以点开头的都拒"。
- 📎 案例：`lib/update/paths.ts` 补 `.ui-shots/`、`.promo-shots/` 两个根 + `update.test.ts` 补 4 条路径断言与 2 条 `shouldTraversePackDir` 断言；改后重打包为 **549 个文件**（少 35 个截图），`.env.example` 与 `meta.json`（version 0.1.2）仍在包内。

### P-121 测试夹具里写了真实的桶名与 APPID：它们会随仓库公开发布
- ❌ 现象（2026-10-01 发 0.1.2 前排查）：`main/src/lib/storage/cos-config.test.ts` 与 `main/src/lib/client/lightbox-src.test.ts` 的夹具直接用了**生产桶名 + 腾讯云 APPID**（形如 `<桶名>-<10 位 APPID>.cos.ap-shanghai.myqcloud.com`）。测试文件**不进更新包**（`isSkippedPackName()` 会跳过 `*.test.ts`），但**会进公开仓库**——克隆或翻历史的人一眼就能读到你的对象存储账号标识。
- ✅ 规则：
  1. **测试夹具、示例、文档、占位符一律用占位值**：桶名写 `example-1300000000`（`SettingsForm` 的 placeholder 就是这个，全仓统一）或 `bucket`；区域写 `ap-shanghai` 无所谓；域名写 `cdn.example.com` / `blog.example.com`。
  2. **IP 用 RFC 5737 文档段**：`192.0.2.0/24`、`198.51.100.0/24`、`203.0.113.0/24`（仓库现有 `fingerprint.test.ts` 就是这么写的，照抄它）。
  3. **发版前扫一遍公开面**（一条命令，靠 `git grep` 而不是 PowerShell 管道——`$files | Select-String` 搜的是**文件名字符串**不是文件内容，会静默给出空结果）：
     ```powershell
     git grep -n -I -E "myqcloud\.com|<你的桶名>|13[0-9]{8}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(com|cn|net)" -- .
     git grep -h -I -o -E 'https?://[A-Za-z0-9._-]+\.[A-Za-z]{2,}' -- . | Sort-Object -Unique
     ```
     第二条会把仓库里出现过的**所有域名**列出来，人眼扫一遍最快能发现漏网的。
  4. **改完当前树 ≠ 改完历史**：字符串只要进过一次公开提交，就在历史里了（`git log -S '<串>' --all` 可查是哪些提交带进来的）。真要抹掉得走 P-092 那套「仓外备份 → 改历史 → 验证 → 才 gc」+ 强推，属于单独一次需要用户拍板的操作，不要顺手做。
- 📎 案例：2026-10-01 把两处夹具改成 `example-1300000000`（`pnpm test` 194/194）。**该串已随更早的提交在远端公开过**，本次只保证「当前树与今后的提交」干净。

#### P-121 附：2026-10-01 真的清了一次历史（完整记录与四个坑）

用户要求连历史一起抹掉，走了 P-092 那套。**先说结论**：可达 ref 全干净，但**强推不等于立刻消失**——GitHub 上旧提交对象仍可访问（详见坑 4）。

**做了些什么**

1. 仓外备份：`git bundle create $env:USERPROFILE\myblog-history-backup\myblog-full-<时间戳>.bundle --all`（1.23 MB，`git bundle list-heads` 验证过）。**必须放在仓库之外**——放仓库里会被 `--all` 一起重写（P-092）。
2. 删掉本机临时退回分支：`git filter-branch --all` 会连它一起改写。
3. 改写：`git filter-branch -f --tree-filter '<sed>' --tag-name-filter cat -- main`
   - filter：`test -f main/src/lib/storage/cos-config.test.ts && sed -i s/<桶名>-<APPID>/example-1300000000/g main/src/lib/storage/cos-config.test.ts || true`
     （**注意本文件也不写真实桶名**——写这份记录时我第一版就把真实串抄了进去，等于自己把刚清掉的东西又提交了一遍，只能再 amend 一次。占位写 `<桶名>-<APPID>`。）
   - 结果：`main` c9b577b→146c9b6；`v0.1.0` 87638fa→c4f99c9；`v0.1.1` 5ac1f1b→84f77b3；内容只差那两行。
4. `git update-ref -d refs/original/refs/heads/main` → `git reflog expire --expire=now --expire-unreachable=now --all` → `git gc --prune=now`
5. 强推：`git push --force origin main` + `git push --force origin v0.1.0 v0.1.1 v0.1.2`；再 `git fetch --prune --prune-tags`，然后再 expire + gc 一次。

**四个坑（都实际踩到了）**

1. **filter 字符串别直接传给 PowerShell**：含引号/分号时会被拆开，git 报 `fatal: bad revision 's/<APPID>/1300000000/g …'`（本次第一次尝试就中）。改法：filter 写成**不含任何引号**的形式，并用数组 splat 保证它整体是一个参数：
   ```powershell
   $filter = 'test -f path && sed -i s/old/new/g path || true'
   $argv = @('filter-branch','-f','--tree-filter',$filter,'--tag-name-filter','cat','--','main')
   & git @argv
   ```
   （Git for Windows 自带 `sh.exe` 与 `sed.exe`，不用另装。）
2. **`filter-branch` 不会重挂「不在本次 rev 范围内」的标签**：本次 `v0.1.0`/`v0.1.1` 被自动 remap，但 `v0.1.2` 当时指在另一个提交上、**没被 remap**，仍指着含串的旧提交。改写后必须 `git for-each-ref refs/tags` 逐个核对，该手动 `git tag -f` 就手动。
3. **`refs/remotes/origin/*` 会把旧提交锚住**，导致 `gc --prune=now` 剪不掉（本次第一次 gc 后对象库里仍有 3 处命中）。正确顺序：**先强推 → 再 `git fetch --prune` 让跟踪引用追上 → 再 expire + gc**。
4. **强推 ≠ 立刻消失**。实测改写并强推之后：
   ```
   https://raw.githubusercontent.com/<owner>/<repo>/<旧SHA>/main/src/lib/storage/cos-config.test.ts
   -> HTTP 200，文件里仍然有桶名（87638fa / 5ac1f1b 都是）
   ```
   GitHub 会保留不可达对象（其中较晚被替换掉的 c9b577b 反而先变成 422）。**彻底清除的唯一正规途径**是按 GitHub 官方「Removing sensitive data from a repository」**找 Support 提 GC 请求**（或删库重建，代价是丢 star/issue/release）。所以：**别把"改写历史"当成能兜底的补救手段——第一次就别写进去。**

**验证方法（重点：必须带阳性对照）**

- 逐提交：`foreach ($rev in (git rev-list --all)) { git grep -c -I -E '<串>' $rev -- }`
- 全对象库：`git cat-file --batch-all-objects --batch` 抓成文本再正则计数
- **空结果不算证据，除非同时扫到已知存在的串**。本次对照 `buildCosPublicBaseUrl` / `example-1300000000` 都有命中（12/12），目标串 0，才算通过。用 `$files | Select-String` 那套搜文件名得到的"0 命中"是假阴性（见正文规则 3）。
- 另外 `git diff main` 会因仓库里有 `main/` 目录而报「ambiguous argument」——用 `git diff <sha> refs/heads/main`（P-092 已记，本次又中一次）。

### P-122 可选字段写成必填：非加密备份必然 400，而且把 Zod 的默认错误漏给了用户
- ❌ 现象（2026-10-01 用户实测）：后台「备份」页点「立即备份」永远失败，页面显示 **`Invalid input: expected string, received undefined`**。而加密默认是关的，这本该是最常见的那条路——等于**手动备份这条路整个不可用**。
- ✅ 根因：同一个约定三处各说各话。
  1. 客户端 `components/admin/BackupPanel.tsx`：`JSON.stringify({ passphrase: passphrase || undefined })`——`undefined` 会被 `JSON.stringify` **把整个键丢掉**，空口令时实际发出去的是 `{}`
  2. 路由 `api/admin/backup/run/route.ts`：注释明写「Empty body is valid for non-encrypted backups」，`body` 初值也是 `{}`
  3. 但 `lib/validation/backup.ts` 的 `backupRunPostSchema` 写的是**必填** `z.string().min(8)` → `{}` 直接校验失败，而路由把 `parsed.error.issues[0].message` 原样当用户提示返回，于是 Zod 的开发者向错误直接糊到用户脸上
  4. **回归点很明确**：0.1.0 里这两个 schema **根本没有口令字段**（口令是「设一次存在后台」的 `backupPassphrasePostSchema`）；**0.1.1（`84f77b3`）把口令模型改成「每次输入、不落盘」时**，删掉旧 schema、给 `restorePostSchema` 与新的 `backupRunPostSchema` 都加上了**必填** `passphrase`——**却没动客户端那行 `passphrase || undefined`**。于是从 0.1.1 起，**非加密备份与非加密恢复双双 400**，一直没人发现（默认装法没配 COS 时加密就是关的，正好踩中）
- ✅ 规则：
  1. **客户端用 `x || undefined` 省字段，服务端 schema 就必须 `.optional()`**；空串 / 纯空白要按「没给」处理（`z.preprocess` 归一成 `undefined`），否则 `.min(8)` 会把空串报成长度错误，提示更离谱
  2. **别把 `issues[0].message` 直接当用户提示**：Zod 默认消息是给开发者看的。要么每条校验都写中文 `message`，要么在路由层兜一个业务口径的说法
  3. **同一形状的入口要一起改**：`restorePostSchema` 是同一个坑（非加密恢复也会 400）；而 `initialSetupSchema` 早前已经修过一次（`validation/setup.test.ts` 里就有一条「initial setup does not require a backup passphrase」）——**修了一处没修同类**，才会在这里又炸一遍
- 📎 案例：`lib/validation/backup.ts` 抽出 `optionalPassphrase`（`z.preprocess` + `.optional()`），新增 `lib/validation/backup.test.ts` 6 条（空 body / 空串 / 纯空白 / 太短 / 合规 / 恢复不带口令）并挂进 `pnpm test`。**修复前该测试 3 条失败（原样复现用户那个 400），修复后 200/200**。

### P-123 后台「备份周期」是个死设置：周期备份在 0.1.1 被删掉且没有任何记录，UI 与文档还在承诺它
- ❌ 现象（2026-10-01 用户提问「怎么设置自动备份？？」）：设置页有「备份周期（天）」，概览页还写着「**每 N 天一次 · 保留 N 份**」——但**根本不会自动备份**。
- ✅ 根因：0.1.1（`84f77b3`，2026-09-25）把 `lib/scheduler/backup.ts` 的整段实现删成了空操作（只剩 `logger.debug("跳过周期备份：备份改为管理员手动执行")`），而**0.1.1 的发行说明里一个字都没提**，changelog 也没有对应批次。于是：
  - `scheduler/index.ts` 照旧在 boot 与定时器里调 `checkBackupDue`（调用了，但它什么都不做）
  - `backupPeriodDays` 仍是 Setting，仍能读写（`validation/settings.ts` 还在校验它）
  - `SettingsForm` 仍在渲染这个输入框，`admin/(protected)/page.tsx` 仍在渲染「每 N 天一次」
  - `docs/ai/module.md` 仍写着旧行为（「`lastBackupAt + backupPeriodDays` 到期则 `runBackup()`」）
- ✅ 规则：
  1. **删功能要留痕**：至少进 changelog 批次与发行说明，并把 README / module.md / 设置页 / 概览页这几处「承诺」一起改掉。只把实现删掉、把 UI 与文档留在原地，等于给用户一句假话（同类：P-015 改代码未同步文档、P-112 删入口后文案变假）
  2. **改行为前后用一句话说清「现在是什么」**，别只留 `logger.debug`：日志是给排查用的，不是给下一个人理解设计用的
  3. **顺带记住那条被删掉的逻辑本来也不完整**：旧实现调 `runBackup()` 不带口令，而 `runBackup` 在「加密开启且无口令」时直接抛「加密备份必须输入口令」——**加密状态下的周期备份从来就没成功过**。要恢复这个功能，得先想清楚加密时口令从哪来（当前设计是「口令不保存、每次输入」，见 `api/admin/backup/passphrase/route.ts` 的 410）
- 📎 案例：2026-10-01 用户提问时发现。**处置（用户选定「恢复自动备份」）**：按上面规则 3 把实现重写回来——`lib/scheduler/backup.ts` 恢复 `checkBackupDue()`，到期判定抽成纯函数 `isBackupDue()` / `resolvePeriodDays()`（`DEFAULT_BACKUP_PERIOD_DAYS = 3`；非法/缺失回落 3 天，空值与坏日期都算「从没备份过」→ 到期），配 `scheduler/backup.test.ts` 4 条并挂进 `pnpm test`。**加密时不再假装能跑**：明确跳过 + 记 `info` 日志，并把这些话说进两个「承诺处」——设置页「自动备份」一节加了说明，概览页状态行在加密开启时改说「加密备份要手动输入口令，不会自动执行 · 保留 N 份」；`docs/user-manual.md` §备份与恢复 同步。**（2026-10 后续：那一节连同到期判定已搬到备份页 / `lib/backup/schedule.ts`，说明文字跟着搬走，设置页只留一句指路；见 P-126。）**

### P-124 更新包不重建 Prisma 客户端：加了模型的版本上机后，表建好了、功能仍报「模型不存在」
- ❌ 现象（2026-10-01 核部署流程时发现）：更新流程只跑 `prisma migrate deploy`，而它**不重建 Prisma 客户端**。于是服务器上表建出来了，但 `node_modules` 里的客户端还是**首装那次**生成的，不认识本次新增的 `StaticPage`、`MomentVisibilityGroup`、`Moment.visibilityGroupId` —— 迁移成功、新功能照旧报错。
- ✅ 证据链：
  - `src/lib/update/apply.ts` 只调 `prisma migrate deploy`，**全仓没有任何地方跑 `prisma generate`**（`git grep 'prisma generate'` 只命中一句错误提示文案）
  - 生成器是默认 `prisma-client-js`（没写 `output`）→ 产物落在 `node_modules/.pnpm/@prisma+client@…/node_modules/.prisma/client`；而更新包**排除 `node_modules`**（`lib/update/paths.ts` 的 `DENIED_ROOTS`）→ 客户端永远停在首装那一代
  - 实测：跑一次 `migrate deploy` 之后，`index.d.ts` 的写入时间与长度都没变
- ✅ 规则：
  1. **发版时只要动过 `schema.prisma`，上机步骤里就得加一条 `pnpm prisma generate`**，然后重启进程。代码里已经兜了半层：`lib/db-schema.ts` 的 `requirePrismaModel()` 会把「客户端不认识模型」变成一句能照做的中文提示，而不是 `Cannot read properties of undefined` —— 但那只是提示，不是修复。
  2. **别拿 `migrate dev` 顶替**：它是开发命令，而且会重建表（P-105 实测把 `PostTag` 从 17 行清成 0）。
  3. 想做到「导一次包就完事」，得让 `apply.ts` 在 `migrate deploy` 之后补一步 `generate` —— 那是改更新链路，要单独改 + 验证；**0.1.2 的包仍是老流程**。
- 📎 案例：2026-10-01 回答「怎么提交到服务器」时逐行核出来的。顺带把 6 处把 `pnpm prisma migrate dev` 写成生产操作的地方（AGENTS §1/§6、README、`docs/user-manual.md` ×2、`docs/data-models.md`、`docs/moment-visibility-spec.md`）一起改成 `migrate deploy` + `generate` 的正确口径。
- 🔎 **同日后记（自己的判断要复核）**：当天我让用户「这一版上机必须手工补 `generate`」，实际去生产机核过之后**并没有踩到**——他们首装的包是当天从工作区打的，schema 里已经含 `StaticPage` / `MomentVisibilityGroup`，客户端 17:46 生成时就认识这两个模型（`index.d.ts` 里各 410 / 460 处命中），两张表也在。**但从 0.1.1 的 release 包首装的机器就会踩**。教训：断言"你必须做 X"之前，先去机器上核一下当前状态。

#### P-124 附（2026-10-03 真踩了，而且踩在"手工补 generate 的时机"上）：更新链路现在自己 generate
- ❌ 现象：上相册版本（`Album` / `AlbumVolume` / `Upload.albumId`）时，管理员按老口径**先** `pnpm apply-update --file`（只入库，`.next` 还是旧的），**再** `pnpm prisma generate`，最后 `pnpm apply-update --pending --start`。构建挂在 TypeScript：
  `src/lib/albums/admin.ts(78,29): error TS2339: Property 'album' does not exist on type 'PrismaClient'`、`data-clear.ts` 的 `albumVolume` 同样报错 —— 一屏「模型不存在」，看着像代码问题，其实是**客户端还是旧 schema 的那一代**。
- ✅ 根因：`generate` 跑在**程序文件覆盖之前**，生成的是**旧** `prisma/schema.prisma` 的客户端；随后 `applyPendingUpdate()` 里的 `pnpm install --frozen-lockfile` 没有重跑 `@prisma/client` 的 postinstall（包已在 store 里，pnpm 不会重放安装脚本）→ 真正 `next build` 时用的还是旧客户端。**手工 `generate` 必须发生在覆盖之后**，这个时机太难记对了，所以不该让人记。
- ✅ 规则（代码已落地）：`lib/update/apply.ts` 在 `migrate deploy` 之后、`next build` 之前**无条件**跑一次 `prisma generate`（实测 ~150ms），并把 `generated` 写进 `update-state.json`。顺序不能变：**install（可能重置客户端）→ migrate（改库）→ generate（对齐客户端）→ build（类型检查/产物）**。于是 P-124 第 1 条对**更新流程**不再适用：手工 `pnpm prisma generate` 只在"自己手跑 `migrate deploy`"或"首装/换机"这类绕过更新流程的场合才需要。
- ✅ 救场口径（构建失败、`src/` 已被覆盖、`.next` 已回落旧构建时）：`mv data/update-pending.json` 移走（构建失败不清 pending，旧构建没有额度保护就会进 61 秒重启循环，见 P-133 附）→ `pnpm prisma generate`（此时 `src/` 已是新 schema）→ 手工 `next build` → `pm2 start myblog`。**别在 `generate` 之后再跑 `pnpm install`**，那是唯一可能把客户端重置回去的操作。
- 🔎 判据：构建报错里出现 `Property 'X' does not exist on type 'PrismaClient'`（或 `PrismaClient` 上的模型名全找不到）＝ 客户端没跟上 schema，**先去核 `prisma/schema.prisma` 与 `node_modules/.prisma/client/index.d.ts` 的时间戳/内容，别改业务代码**。

### P-125 备份列表把每个包整读两遍：两个 59MB 的包让后台「备份」页卡 27 秒
- ❌ 现象（2026-10-01 生产）：后台「备份」页点开一直转，看着像死住；`next-server` 持续 44% CPU、`load average 2.5`，整台机器跟着发涩。
- ✅ 定位（**在真机上分段计时量的，不是猜的**）：在生产机跑一遍备份页的五个取数，`listBackupRecords()` = **26 750ms**，其余四个（`getSetting` / `readPendingRestore` / `listBackupKeyHashes` / `resolveBackupEncrypt`）都是 **0–61ms**。再切细：`listCosBackupNames` 0ms，而 `inspectBackupPackage()` **每个 59MB 的包 13.5 秒**（两个 ≈ 27s）。备份页 SSR 跑一遍、面板挂载后 `/api/admin/backup/list` 再跑一遍 —— 一轮五十多秒，还顺带把 CPU 打满。
- ✅ 根因：`listBackupRecords()` 对每个**本地**包都调 `inspectBackupPackage()` 真去开包读版本号，而它内部是 `listTarGzEntryNames()`（全文件扫一遍）+ `extractNamedFiles()`（再扫一遍）—— **同一个包读两遍**，59MB 在轻量机上就是十几秒。可**答案本来就在本地**：`data/backup-manifests.json` 存着每个包的 `encrypted/format/channel/version`，由「创建备份 / 从 COS 拉回 / 导入 / 恢复」四条路径写好、删除时清掉。代码却把它当成「开包失败时的兜底」。
- ✅ 规则：
  1. **列表类页面不许做 O(包体积) 的活**：有元数据就用元数据。`data/backup-manifests.json` 是权威缓存 → **先读它**；只有清单里没有这个包（例如手工塞进去的）才开包，而且**开完立刻回写**（自愈，下次不再慢）。
  2. **别把兜底路径当主路径**：这次就是兜底写得好好的（`manifestFromStored`），却只挂在 `catch` 里。
  3. **性能问题先在真机上分段计时**：本地开发库没有大包，这个坑在开发机上**永远复现不出来**（本次就是拿用户的生产机逐段量出来的）。
- 📎 案例：`lib/backup/backup.ts` 的 `listBackupRecords()` 改成「先读清单 → 缺失才开包并回写」。**同一台机器、同一批数据**实测：**26 750ms → 44ms**（两个包都走了清单）。`docs/ai/module.md` 的备份行同步。
- 📌 遗留（不在本轮）：清单缺失时的兜底仍要开包两遍（约 13s/包）。手工导入的包第一次进列表会慢一次，之后靠回写变快；真要治，得让 `inspectBackupPackage` 只扫一遍、拿到 `meta.json` 就早退。


### P-126 周期备份加「几点几分」时踩的两脚：分钟级 tick 会放大日志，Zod 的长度上限写在 trim 之前
- ❌ 现象一（写实现时自己撞出来的）：给「到期才备份」的检查从小时级定时器挪到 60 秒的 tick 之后，原本**一轮一条**的日志变成**每分钟一条**——`跳过周期备份：已有备份任务在进行`、加密跳过、以及 `runBackup()` 抛错时的 `定时任务失败：backup`。而「到期」是**状态**不是事件：只要没成功，条件每分钟都成立，磁盘满 / 权限错这类持续失败会一直刷 error。
- ✅ 规则：
  1. **tick 变密，输出必须跟着节流**：同一个到期窗口只提醒一次（记住 `lastBackupAt|periodDays|atTime` 这个键），失败后加退避闸门（`RETRY_AFTER_FAILURE_MS`，本次 15 分钟），成功后清空。
  2. 写循环任务前先问一句「**失败会怎样**」：成功路径的分支通常不会暴露问题，失败路径的日志量才是真正会咬人的地方（P-123 反面：什么都不记，出事没人知道）。
  3. 想做到「精确到分钟」就得让判定跑在分钟级 tick 上；**别用小时级定时器 + 分钟级设置**——用户设了 03:05，实际 03:59 才跑，那就等于没设。
- ❌ 现象二（实测的单元测试失败）：`settingsPutSchema` 写成 `z.string().max(5).refine(isBackupAtTime)`，`{"backupAtTime": " 03:30 "}` **直接被拒**——长度检查跑在 refine 里的 `trim` 之前，用户看到的是「太长」这种和格式无关的错；新加的用例「备份时刻：合规值通过并去空白」当场失败（`false !== true`）。
- ✅ 规则：**归一化必须排在校验之前**：`.transform((v) => v.trim())` → `.refine(格式)`。别指望「反正前端会 trim」——接口是自己收请求的那一端，写接口的人得自己兜（与 P-122 同源：报错口径要对用户说得清）。
- ✅ 规则（页面搬迁的通用检查）：把一组设置从 A 页搬到 B 页 = **写入白名单 / Zod schema / 默认值 / 读取归一 / 表单 payload 五处一起动**。表现在代码里最容易漏的是白名单：漏了就是「界面显示已保存、值根本没落库」。本次专门加 `src/lib/validation/settings.test.ts` 钉住「`backupAtTime` 在 `WRITABLE_SETTING_KEYS` 里」与「区间与 `BACKUP_LIMITS` 一致」，并把四个数字字段的区间收进 `lib/backup/schedule.ts` 一处（接口、输入框 min/max、提交前校验都从它取）。
- 📎 案例：2026-10 用户要求「自动备份设置移到备份栏目、每隔几天要能设到几点几分」。新增 `lib/backup/schedule.ts`（纯函数：到期 / 下次到期 / 时刻归一 / 区间 / 表单校验）+ `lib/backup/schedule.test.ts` 11 条 + `lib/validation/settings.test.ts` 4 条；`pnpm test` 215/215、`tsc --noEmit` 与改动文件 eslint 全 0。日志节流与失败退避写在 `lib/scheduler/backup.ts`。

### P-127 同一块版式别同时挂「容器查询」和「按视口」两套几何：手机格宽落在断点外，文案被裁成一行半
- ❌ 现象：用户反馈"手机端瞬间卡片显示错误，浮动文字只显示一点，图片只显示一列"。实测（504px 视口、格子 472px 宽）：瞬间模块仍走**横向**版式 —— 文案区只剩 366px 宽、三行文案单行裁断；右侧瀑布被压到 185px，两个竖排图片行各自只有一列（另一半空着），整块看起来像"图只剩一列"。
- ✅ 根因：这块的手机版式只由 `@container home-mod (max-width: 360px)` 决定，而格子宽度 = `(视口 - 2×padding - 11×gap)/12 × 用户设的列跨度` —— **随设备和用户设的跨度浮动**。390px 设备实测约 343px，**大于 360 的上限**，于是容器查询不命中；项目里真实的手机断点是 `(max-width: 959px), ((hover: none) and (max-height: 540px))`（走手机套，见 [responsive-layout-spec.md](responsive-layout-spec.md)）。两套几何互不知道对方，谁都没兜住。
- ✅ 规则：
  1. **版式切换一律跟"走手机套"的那个断点走**，不要自造容器查询阈值。写选择器时同时覆盖真机与后台画框：`.home-grid:not([data-vp]) .xxx`（真机 + 默认布局）与 `.home-grid[data-vp="mobile"] .xxx`（后台手机画框 `data-vp="mobile"`），两条并列写；**不要**把规则写进 `@container`（后台画框的宽度由画布决定，容器查询会给出和真机不同的结果）。
  2. 高度只有 32–36vh 的模块，**文案可见行数要给底线**（`min-height: calc(var(--行高) * 3)`），别只靠 `overflow: hidden` 裁 —— 否则"能显示几行"完全取决于设备高度。
  3. 拆分样式时把"行高/间距"抽成模块自己的 CSS 变量（`--dash-line-height` / `--dash-line-gap`），测量代码与 CSS 引用同一个值，改一处不会两边不一致。
- ✅ 验证口径（可复用，看数字不看感觉）：手机档量 `copy.bottom - falls.top`（本次 **−10px**，说明两区不重叠、文案区拿到 126px ≈ 3 行 × 26px + 间距）、`falls` 内 `img` 个数（本次 2 张，之前 0 张可见）、整体 `document.scrollWidth` 不超视口。
- 📎 案例：2026-10「手机端瞬间卡片显示错误」。修后实测：手机 460px 下模块 472×290，文案区 446×126（3 行），瀑布区 446×130 装下 2 张竖图。

### P-128 内联 CSS 变量挡得住媒体查询：手机档改网格列数要给 `--moment-cols` 写 `!important`（但不许带进展开态）
- ❌ 现象：瞬间页的九宫格在手机档"图片只显示一列 / 每张只有 ~80px"。根因是网格列数写成了内联自定义属性 `style={{ "--moment-cols": 3 }}`，消费方 `.moment-grid { grid-template-columns: repeat(var(--moment-cols, 3), minmax(0,1fr)) }`。**自定义属性在同一元素上做级联时，内联样式压过媒体查询里的规则**（媒体查询不改优先级），所以"手机档两列"怎么都盖不上。
- ✅ 规则：
  1. 手机档覆盖时显式加 `!important`，并且**把作用域收紧到非展开态**：`.moment-grid:not(.is-expanded) { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }`。展开态的列是「大图 + 侧边缩略条」，是另一套几何，被 `!important` 一起拍平会让展开功能失效。
  2. 更彻底的做法是**别用内联自定义属性当列数**（列数由 `data-count` + CSS 决定），新写组件时优先这个；本次是沿用既有实现，所以只做窄覆盖。
  3. 覆盖后要量两件事：`getComputedStyle(grid).gridTemplateColumns` 的实际列宽（本次手机档 = 两列 215px ×2），以及**展开一次**确认展开态仍是「1fr + 22%」（`!important` 的常见副作用就发生在这里）。
- 📎 案例：2026-10 同上一处反馈（"图片也只显示了一列"）。修后瞬间页手机档两列方图、页面无横向溢出。

### P-129 受控多行输入框别在 `onChange` 里 `filter(Boolean)`：用户刚按下的回车会被自己的清洗吃掉
- ❌ 现象：后台「首页管理 → 选欢迎光临模块 → 主标题（每行一句）/ 漂浮色块文字」两个多行框**按回车没反应**：输入 `AAA` → 按 Enter → 框里还是 `AAA`，接着打 `BBB` 得到 **`AAABBB`**（两段粘成一段）。DOM 检查一律正常（`textarea`、`rows` 正确、`white-space: pre-wrap`），所以很容易误判成浏览器或 CSS 问题。
- ✅ 根因：这两个字段的值是**数组**（`lines: string[]` / `chips: string[]`），受控 textarea 的 `value` 由 `array.join("\n")` 生成；`onChange` 里写了 `.split("\n").map(trim).filter(Boolean)`。用户按下回车 → 原生 value 变成 `"AAA\n"` → 清洗把末尾空行丢掉 → state 仍是 `["AAA"]` → React 把 value 写回 `"AAA"`，光标回到末尾 → 新行被**立刻抹掉**，下一个字符自然粘在后面。
- ✅ 规则：
  1. **编辑态的清洗只做「逐行 trim + 长度上限 + 条数上限」，绝不过滤空行**；空行是用户在编辑的中间态，不是脏数据。
  2. 去掉空行放到**保存前一处**收尾（本次：`sanitizeConfig()` 在 `PATCH /api/admin/modules/:id` 之前跑 `sanitizeLineField()`），落库与前台渲染都不带占位空串。
  3. 判断口径：受控输入框只要出现「删掉空串/去重/排序」这类**会改变用户刚敲下的字符**的清洗，就会有同类问题（去重更狠：会把两个相同标签合并掉）。
- 🔎 复现/验证口径（可复用，别靠手感）：CDP `Input.dispatchKeyEvent` 真的敲一次回车，再读 `textarea.value` 与 `selectionStart`。
  - 修前：`AAA` → Enter → `{"value":"AAA","cursor":3}` → 再打 `BBB` = `AAABBB`（实测原始值）；
  - 修后：`AAA` → Enter → `{"value":"AAA\n","cursor":4}` → 再打 `BBB` = `AAA\nBBB`；
  - 保存后再刷新页面读回仍是两行，`PATCH` 请求体里是 `["第一行","第二行"]`（没有空串）。
- 🔎 回归单测：`src/lib/home/builtins.test.ts`（`parseLineField("lines", "AAA\n", 3)` 必须给出 `["AAA",""]`；`sanitizeLineField()` 负责在保存时清空行）。
- 📎 案例：2026-10 用户反馈「首页编辑里的模块设置，欢迎模块设置里的漂浮色块设置和主标题两个输入框都无法换行」。修复文件：`HomeLayoutEditor.tsx`（`lines` 分支改用 `parseLineField()`、保存改用 `sanitizeConfig()`）、`lib/home/builtins.ts`（新增两个纯函数 + 单测）。

### P-130 混在图流里的卡片：尺寸由**图片**决定，不是由所在列宽决定
- ❌ 现象：首页文章流里穿插的瞬间卡，被做成「跟文章大卡同宽（896px）+ 网格固定三列 + `4/5` 方框 + `object-fit: cover`」。一张 2:1 的手机截屏被竖着裁成细高条，卡片整体 896×448 —— 用户原话是「**恐怖的宽高比**」「不一定要很大的卡片，应该是以图片为准的」。
- ✅ 规则：
  1. 图片卡**不要预设大画框**：给一个固定的**行高**（本次桌面 168px / 手机 118px），每张图按 `aspect-ratio: 原图宽/原图高` 决定自己的宽度；
  2. 原图比例**必须从数据来**（本项目 `Moment.images[].width/height`），没有就按 4:3 兜底 —— 别用统一方框 + `cover` 硬凑，那必然要裁掉一半画面；
  3. 极宽图要设**宽度上限**（本次 55%）并改成 `object-fit: cover` 从中间裁：不裁的话 2:1 的截屏会顶满整行；
  4. 单图走 `contain`（整图看得见）+ 从高度上限反推宽度上限 `max-width: calc(上限高 * 比例)` —— 只设 `max-height` 不推出宽度，`aspect-ratio` 的盒子仍会被容器拉伸；
  5. 卡片高度直接写死或写 `aspect-ratio` 时，先拿"最宽的图 + 最竖的图"各量一次，别拿示例图当全部。
- 🔎 验证口径：逐格比对 `img.getBoundingClientRect()` 的宽高比与 `naturalWidth/naturalHeight`（本次 336/126/168 × 168 对上 2:1、3:4、1:1），并量卡片总高（本次 896×260，改前 896×448）。
- 📎 案例：2026-10 首页穿插卡第二版（推翻第一版的固定网格）；记录见 [moments-home-spec.md](moments-home-spec.md) §2.6。

### P-131 走手机套后侧栏压到正文上：`position: static` 的**内联 `top` 依然生效**
- ❌ 现象：文章页手机视图里，目录卡片的底边压进正文约 60px（命中测试：目录底边往里 0/8/16px 三个采样点全落在 `.post-sidebar` 内，正文标题被玻璃底压住）。
- ✅ 根因：`ReadingProgress`（顶部阅读进度）会给侧栏写**内联 `top`**（桌面 sticky 的偏移，实测 76px）。走到手机套后 `.layout__aside .sticky-stack { position: static }` 把它变回 static —— **但 `position: static` 元素的 `top` 不算，`position: relative` 才算**：`.layout__aside .post-sidebar` 是 `position: relative`，于是这个 76px 偏移照样把它整体推下去，侧栏"看起来是排在正文前面"，实际是压在上面。
- ✅ 规则：把某个元素从 sticky/absolute 改成 static/relative 时，**顺手把它身上的 `top/right/bottom/left` 一起 `auto` 掉**（本次：手机档 `.layout__aside .sticky-stack` 与 `.post-sidebar` 都写 `top: auto`）。判断依据就是内联样式 —— 组件写内联 `top` 时，CSS 里那一条 `position` 覆盖根本挡不住它。
- 🔎 验证口径：`getComputedStyle(sidebar).top`（应为 `0px`/`auto`）、`sidebar.getBoundingClientRect().top - aside.getBoundingClientRect().top`（应为 0），再加 `elementFromPoint` 在边界三点命中测试（修前 `inToc: true,true,false`，修后应全部 false）。
- 📎 案例：2026-10 文章页手机端目录置顶（用户口径「手机视图应该是目录在上面」）。

### P-132 `width: min(50%, max-content)` 是无效值：`min()` 只吃长度，整条声明会被静默丢掉
- ❌ 现象：想让瞬间卡"先占文章卡一半、内容多再长到满宽"，写成 `width: min(50%, max-content)`。CSSOM 里 `.home-moment` 的规则**根本没有这条 `width`**，计算宽度仍是整列 896px（应该是 448）。
- ✅ 根因：`min()`/`max()`/`clamp()` 的参数只能是**可计算的长度/百分比**，`max-content` 这类 intrinsic sizing keyword 不合法 → 该声明在解析期被丢弃（`CSS.supports("width", "min(50%, max-content)") === false`）。整条声明消失，不报错、不进控制台。
- ✅ 正确写法：用 flex/grid 项自己的尺寸规则表达"下限 + 内容撑开"：`width: fit-content; min-width: 50%; max-width: 100%; justify-self: start`（本次的有效解，实测 896 的列里 = 448）。
- 🔎 验证口径：**先看 CSSOM 有没有这条规则**（遍历 `document.styleSheets` 找 `selectorText`，打印 `rule.cssText`），再看计算值；只看计算值容易误判成"优先级被盖住"。
- 📎 案例：2026-10 首页穿插卡宽度（与 P-130 同一处）。

### P-133 预约更新的失败不会清 pending：pm2 每次拉起都白跑一次全量构建
- ❌ 现象：更新失败后站点一直起不来。`pm2 restart` 反复拉起，每次都卡在编译（实测单次 2.3–3.1 分钟，用户观感"以前两分钟、这次八分钟"），`.next` 被反复删了又建，`curl` 一直 `000`。
- ✅ 根因：`data/update-pending.json` 一旦写上就**长期有效**（`isPendingUpdateDue()` 只看 `restartAt ≤ now`）。失败路径只写 `data/update-state.json`、**不动 pending**（见 `lib/update/apply.ts`）→ 每次 `boot.cjs` 拉起都重试一次完整更新（覆盖 + 可能 `pnpm install` + `migrate deploy` + `next build`）。而 `boot.cjs` 里「应用更新 → startNext」是**一次性**的：构建把 `.next` 清了、启动又失败，就留下一台既不响应也没有产物的机器。
- ✅ 规则：
  1. 更新失败先看 `data/update-pending.json` 在不在——**在就说明每次重启都会重试**；要停掉重试就把它移走（留档到 `/var/backups/`），再手动 `next start` 或干净重建一次。
  2. 手动应用更新时**先 `pm2 stop`**：`prisma migrate deploy` 撞上正在跑的实例会 `database is locked`（实测），这也是本次「第一次 apply 失败」的直接原因。
  3. 一次只跑一个构建：CLI 与 boot 同时进来会互相抢 `.next/lock`，报 `Another next build process is already running`。
  4. 编排类动作（apply/build）用「轮询产物与进程状态」的方式推进，别把一长串命令串在一条里——SSH 一断，后面的步骤全都不执行（本次因此多绕了两轮）。
  5. `pkill -f "<模式>"` 会匹配到**执行这条命令的 bash 自己**（命令行里就含那个模式），把会话连同后续命令一起杀掉；要用 `pkill -f "[a]pply-pending-update"` 这种括号写法。
- 🔎 验证口径：`ls data/update-pending.json`（应不存在）+ `.next/BUILD_ID` 存在 + `curl -o /dev/null -w '%{http_code}'` 为 200。

#### P-133 附（2026-10-03 生产第三次踩到，这次是**每分钟自我重启**）：pm2 直起 `next start` 后 pending 永远没人消费
- ❌ 现象：后台点「立即备份」→ `Unexpected token '<', "<html> <h"... is not valid JSON`（见 P-157）；刷新后本地包在、COS 里没有。取数：nginx `error.log` 在 `20:13:46` / `20:15:49` 记 `upstream prematurely closed connection while reading response header`（**不是超时**），access log 对应两条 `POST /api/admin/backup/run 502`；`pm2 describe` 报 `restarts 1235`；应用日志里 `[myblog] 即将重启进程 {"supervised":true,…}` 出现 1241 次；`data/update-pending.json` 里是 10-02 23:09 的预约，`restartAt` 早已过点。
- ✅ 根因：`lib/scheduler/index.ts` 的 60 秒 tick 里有 `update-due` 检查，`isPendingUpdateDue()` 只看「到点没有」——**过点就永远成立**，于是每趟排一次重启。而真正应用更新的只有 `scripts/boot.cjs`（与 CLI），这台机器在 10-02 的部署里把 pm2 改成**直接起 `next start`**（[linux-deploy-spec.md](linux-deploy-spec.md) §5），boot 不在链路里 → pending 永远不被消费也不被清掉 → **每 ~61.5 秒重启一次，永不停**。两次备份请求正好落在退出点上被腰斩。核算：1235 次 × 61.5s ≈ 21.1h，正好是 10-02 23:10 到发现问题的时长。
- ✅ 规则（代码层已落地）：
  1. **重启要有额度**：`data/update-pending.json` 累计 `restartAttempts`，到 3 次就写 `update-state.json`（`status:"failed"` + 中文原因，更新页显示「上次失败：…可用 `pnpm apply-update --file` 手动应用」）并**取消预约**；恢复同理（`decidePendingRestoreRestart()`）。判定是纯函数，配单测。
  2. 「到点」是**状态**不是事件：任何"到点就做某件有副作用的事"的调度，都要有「做了几次、还做不做」的上限与终态。
  3. 部署方式变了要回头查「谁消费这些预约文件」：`boot.cjs` 不在链路里时，`update-pending.json` 这类文件只剩「触发重启」的作用。
  4. 排障顺序：`pm2 describe`（看 script/restarts/uptime）→ `data/update-pending.json` 内容 → 应用日志里 `即将重启进程` 的**次数** → nginx `error.log` 对时间点。uptime 只有几十秒 + `即将重启进程` 上百次 = 自我重启循环，别再往业务代码里找。
- 📎 案例：2026-10-03 备份页面报 `Unexpected token '<'` 与「本地有、云端没有」（同轮修复：P-157 的诊断口径 + P-158 的后台上传）。止血：`mv /opt/myblog/data/update-pending.json /var/backups/myblog/`，下一个 tick 起不再自动重启。
- 📎 案例：2026-10-02 线上更新（本地打包 → scp → apply），完整步骤见 [linux-deploy-spec.md](linux-deploy-spec.md) §5.1。

### P-134 覆盖前的临时快照别放在项目根：`tsconfig` 的 `**/*.ts` 会把它扫进类型检查
- ❌ 现象：线上 `next build` 编译成功、类型检查阶段爆一屏与本次改动无关的错，报错路径全是 `myblog-pre-update-20261002-202833/src/editor/...`（我为防万一放在项目根的那份覆盖前快照）。
- ✅ 根因：`tsconfig.json` 的 `include` 是 `**/*.ts` / `**/*.tsx`，**不看 `.gitignore`**；把旧代码快照（尤其含 vendor 编辑器源码）放进项目根，等于给类型检查喂了两套互相冲突的类型。
- ✅ 规则：
  1. 迁移/覆盖前的留档一律放**项目之外**：本次统一放 `/var/backups/myblog/`（含旧目录整包 tar）。
  2. 判断口径：构建报错路径如果指向一个"你刚拷进去的备份目录"，先怀疑这一条，而不是业务代码。
  3. 同理适用于任何会被 `next build` 扫到的临时目录（截图、抓板产物）：别放在项目里（Windows 侧另见 P-120 的打包拒绝名单）。
- 📎 案例：2026-10-02 线上 `/root` → `/opt/myblog` 迁移。

### P-135 覆盖层写在祖先里就压不住：祖先有 `z-index` 就建了**层叠上下文**
- ❌ 现象：首页弹窗卡片已经 `position: fixed; z-index: 100`，仍然被 Banner 盖住。`elementFromPoint` 拿到的三层全是 `home-banner__copy`。
- ✅ 根因：`.home-float` 当时是 `.home-shell` 的**后代**，而 `.home-shell`（首页有 Banner 时）带 `z-index: 1` + `position: relative` → **给后代开了一个新的层叠上下文**。弹窗的 `z-index: 100` 只在这个上下文内部比大小，对外整体仍排在 Banner 那个（同样 `z-index:1`、但 DOM 在后面/在别的上下文里）之下。`elementsFromPoint` 的返回顺序把这件事直接摊开了：它把 `home-shell` 排在弹窗**之前**。
- ✅ 规则：
  1. 做覆盖层（弹窗 / Toast / 悬浮球）时，**让它成为带 `z-index` 的那个容器的兄弟**，别做后代。
  2. 排查顺序永远是：`elementsFromPoint(x, y)` 看**谁在最上面** → 打印那个元素的祖先链 `getComputedStyle(...).zIndex / position` → 找第一个建上下文的祖先；**先怀疑层叠上下文，再怀疑 z-index 数值**。
  3. `transform / filter / contain / will-change` 也会建包含块（`fixed` 会变成相对那个祖先定位），所以 `.home-float` 这一层**这些属性一个都不能写**。
- 🔎 验证口径：`elementFromPoint` 在卡片自己的矩形内取样（我第一版把点算到矩形外 24px，白折腾一轮），`top.closest(".home-popup")` 必须为真。
- 📎 案例：2026-10 首页覆盖层模块（弹出模块 / 推荐应用）。

### P-136 `pointer-events: none` 会让元素从命中测试里“消失”：它不能是个常驻态
- ❌ 现象：弹窗的关闭叉叉点了没反应，`elementFromPoint` 在按钮中心返回空串（`className: ""`），`elementsFromPoint` 里也找不到弹窗 —— 但截图里卡片明明画得好好的、`getBoundingClientRect` 也正常。
- ✅ 根因：延迟出场期间给卡片挂了 `is-delayed { pointer-events: none }`，**动画结束后没摘**（组件只用它来表达「还没出来别点」）。`pointer-events: none` 的元素对 `elementFromPoint` 完全不可见，也不接收点击。
- ✅ 规则：
  1. 想表达「还没出现」用 **`visibility: hidden` / `display: none`**，比 `pointer-events: none` 更彻底也更少歧义；非要用它就**必须成对回收**（`setTimeout(delay)` 之后 `classList.remove`）。
  2. **别在入场动画还没跑完时测量**：滑入动效期间 `getBoundingClientRect()` 是运动中的位置，命中测试必然miss（本次两次误判都是这个原因）。先等 `animationend` 或足够长的 `sleep`。
  3. 判据排序：截图对 → `rect` 对 → 命中测试不对时，**先查 `pointer-events` / `visibility` / `z-index` 三个计算值**，再怀疑布局。
- 📎 案例：2026-10 首页覆盖层模块（与 P-135 同处）。

### P-137 覆盖层模块把正文直接返回 = 卡片静默掉进格点流
- ❌ 现象：首页「推荐应用」卡在 `.home-float__slot` 里画出来了，但**没有外层 `.home-popup`** —— 于是 `position: fixed`、出场动画、关闭按钮全部消失，卡片跟着文档流跑；前台截图看着「有内容」，交互与定位全丢。`elementFromPoint` 命中的是后面的 banner 格子（卡片本身还带着 `pointer-events: none`）。
- ✅ 根因：「可编辑内置模块」（推荐应用写了自己的 HTML 时）那条分支**只 return 了 `CustomModuleRuntime`**，没套 `PopupShell`。外壳才是浮层本体，正文只是它的 children。
- ✅ 规则：
  1. 覆盖层的判定**只有一个口子**：`lib/home/types.ts` 的 `isFloatingModule(module)`（内置看在不在 `FLOATING_MODULE_KEYS`，自建看 `config.floating`）。别再在 `HomeGrid` / `HomeFloat` / `ModuleBody` 各写一遍 `builtinDefinition(...)?.floating` —— 三处各判各的，等于三种真相。
  2. 任何「浮层模块的正文分支」都必须包在 `PopupShell` 里返回；`PopupShell` 单独一个文件（`components/home/modules/PopupShell.tsx`），避免与正文组件互相 import 造成初始化顺序问题。
  3. 用模板建出来的「弹出模块 / 推荐应用」是 **`kind: custom` + `config.floating: true`**：以前只按 `builtinKey` 判浮层，这类模块被判成普通模块塞进格子里（同一根因的另一半）。
- 🔎 验证口径：渲染测试断言外壳与内容的**相对顺序**（`markup.indexOf("home-popup") < markup.indexOf("home-custom--")`），比事后肉眼看截图可靠；线上抓一张卡还要量 `getComputedStyle(el).position === "fixed"` + 关掉延迟后 `elementFromPoint` 命中卡片内部。见 [HomeModuleRenderer.test.tsx](../main/src/components/home/HomeModuleRenderer.test.tsx)。
- 📎 案例：2026-10-02 模块编辑器（可编辑内置模块）。

### P-138 dev 下 `allowedDevOrigins` 漏了 127.0.0.1：页面能渲染，但**整页不 hydrate**
- ❌ 现象：`http://127.0.0.1:3000/` 首页 HTML 正常、截图正常，但**所有客户端交互都是死的**（搜索按钮点不开、弹窗关不掉、`useEffect` 一律不执行）。控制台只有一句 React DevTools 提示，没有报错；`document.querySelector(el)` 上连 `__reactFiber$` 都没有。
- ✅ 根因：Next 16 默认拦跨源 dev 资源，`allowedDevOrigins` 里当时只有 `192.168.2.*` / `10.0.2.2`。**`localhost` 与 `127.0.0.1` 不是同源**，用后者访问时 `/_next/static/chunks/*` 与 `/_next/hmr` 全被 403 拦掉 → client chunk 没加载 → 页面只有 SSR 的静态 HTML。服务端日志里其实写得很清楚（`Blocked cross-origin request to Next.js dev resource ... from "127.0.0.1"`）。
- ✅ 规则：
  1. `pnpm shot`（`ui-shot.mjs`）与一切 CDP 截图/量尺寸工具**默认就用 127.0.0.1**，所以 `allowedDevOrigins` 必须包含 `127.0.0.1`，否则本项目的 UI 验证快路径全是假绿。
  2. 判据：**「SSR 对、交互不对、控制台没报错」先查 dev 跨源拦截**，别去改业务代码 —— 服务端日志 grep `Blocked cross-origin`。
  3. 影响面比想的大：`PopupShell` 的「延迟结束摘掉 `pointer-events: none`」也在 effect 里，hydrate 不跑就等于 P-136 复发（卡片永远点不动）。**排查「某个 effect 没执行」之前，先确认整页到底 hydrate 了没有。**
- 🔎 验证口径：在 effect 里挂个可观测标记（例如给根元素加 id），再用 `pnpm shot <url> --selector "#那个id"`：等得到就是 hydrate 了，等不到就是没 hydrate。
- 📎 案例：2026-10-02 模块编辑器验证（同一批截图里 5 个取样点全部"看起来正常"）。

### P-139 高度是「视口百分数」时，调滑块只把格子撑高、模块本身不会长
- ❌ 现象：后台把欢迎卡的高度从 37 调到 60/100，格子确实变高了，但**卡片还是矮矮一条**：正文挤在一起、漂浮泡泡被压成十几像素的扁片、瞬间卡也是空一块。用户原话：「调高度居然不会扩大模块只会扩大它的占用面积」。
- ✅ 根因有三层，缺一层都复现：
  1. **口径错**：`hPct` 是「视口高度的百分数」，`height: calc(var(--cell-h) * var(--h-unit))`（`--h-unit ≈ 1dvh`）。用户心里想的是「这个模块多高」，滑块给的却是「占屏幕多大比例」，谁也调不准。
  2. **百分比高度悬空**：卡片的 `.dash-welcome { height: 100% }` 只有在祖先有**确定高度**时才成立。格子是固定高度、但中间那层（`.home-module` / `.home-custom-module`）没有高度 → `100%` 解不开 → 卡片塌成内容高度，盒子的高度白配。
  3. **弹性子项被挤扁**：`.dash-chips` 是 `height: 100%` 的 flex 列，泡泡没写 `flex-shrink: 0` → 列高不够时 12 颗泡泡被均摊成 `(378-11×12)/12 ≈ 21px` 的扁片；瞬间模块的文案用 `flex: 1`，被压成 60px 后剩下的图轨直接 0 高。
- ✅ 规则：
  1. **高度统一按像素读，0 = 自适应**（`lib/layout/viewport.ts` 的 `moduleHeightCss()` / `isAutoHeight()` / `clampModuleHeight()`）——「自适应」交给内容决定，不再有 `dvh` 换算。滑块 = 模块高度本身，拖多少长多少。
  2. 固定高度的格子必须把高度**一路送到内容**：`--cell-h` 由 `lib/home/grid.ts` 直接产出 CSS 长度（`380px` / `auto`），配 `.home-grid__cell.is-hfixed > * { height: 100% }`。少这一层，卡片的 `height: 100%` 就是空转。
  3. **两个视口的固定高度要分别标记**（`is-hfixed` / `is-m-hfixed`）：共用一个标记时，「只有手机配了高度」也会把桌面钉上高度 + `container-type: size`，两边互相顶。
  4. 装饰性弹性子项**一律 `flex: 0 0 auto`**（泡泡这种）；容器交给 `overflow: hidden` + 自己的滚动动画。
  5. 矮格子的兜底用**容器查询**（`@container home-mod (max-height: …)`），且容器必须是格子：给卡片自己写 `container-type: size` 会被它的 `height: 100%` 绕成循环依赖、直接塌成 0 高。
- 🔎 验证口径：量**四层**才算数 —— 格子高度 = 模块高度 = 内容盒高度，且装饰子项没有被压扁（`chip.h === 86`）。只看格子高度会以为已修好（本次就是这么误判过一轮）。
- 📎 案例：2026-10-02 首页欢迎卡 / 瞬间卡「特别矮、文字挤成一团」。
- ⚠️ **两个连环坑（都在这次踩过）**：
  1. **半迁移的高度**：老数据里桌面有值、手机没值（Banner 就是 `hPct: 100` / `mobileHPct: 0`）。迁移只改「命中的那一侧」会留下 `桌面 0 / 手机 100` 这种状态；而走手机套的断点判断在窄屏下会让手机那个值反过来决定桌面 —— 于是桌面被 100 钉成固定高度。**命中一侧就两侧一起写**。
  2. **`unstable_cache` 骗人**：`getHomeLayout()` 走 `cachedPublic`，**改库不会让缓存失效**。实测库里已经把 banner 的高度改成 0，页面照样吐 `--cell-h:740px`（旧值），清 `.next/dev/cache` 重启才对上。改完布局数据只看到「页面没变」时，先怀疑这层缓存，别急着改 CSS。
  3. **Banner 的高度不属于 `hPct`**：它由自己的 `config.height` 预设（100vh / 70vh / 420px）决定，格点高度必须是 0（自适应）。自适应分支里**什么都别写** —— `height: 100%` 会被祖先的确定高度压成内容高度，`height: auto` 会把 100vh 干掉、只剩 `min-height`（实测塌成 520px）。

### P-140 同一个 SVG 标记在页面上出现两次：`<defs>` 的 id 会串味
- ❌ 现象：内置「推荐应用」卡（React 组件画的 logo）与模块自带的 HTML 版本（同一份出厂代码）同时出现在一页时，两边的渐变/裁切 id 都是 `app-logo-bg` / `app-logo-squircle`，第二份 SVG 会引用**第一份**的定义：渐变指向别人的 `<linearGradient>`，裁切形状也可能套错。
- ✅ 根因：SVG 的 `id` 是**文档级**的，`url(#id)` 永远解析到文档里第一个同名元素；同一段标记被内联两次就撞车。
- ✅ 规则：
  1. 生成内联 SVG 的工厂函数收一个 `suffix`（`appLogoSvgMarkup("-promo")` / `AppLogoMark({ idSuffix })`），id 一律带后缀。
  2. **同一份几何只写一处**：`lib/home/app-logo.ts`（纯数据 + 字符串生成，无 react）同时供 React 组件、模块出厂 HTML、测试断言使用；谁都不许再抄一份路径。
  3. 测试直接断言「出厂 HTML 里的路径 === 组件里的路径」（见 `HomeModuleRenderer.test.tsx`），防止两边慢慢漂。
- 📎 案例：2026-10-02 推荐应用 logo（同时修掉了一份「长得像但不是 App 图标」的近似图形：方形圆角 `rx=24` + 斜向蓝渐变 + 回声气泡/主气泡/尾巴，与 `docs/android/icon.svg` 同源）。

### P-141 `package.json` 的测试清单是**手写文件列表**：粘在一起的路径会被静默跳过，`pnpm test` 照样 exit 0
- ❌ 现象：清单里 `sanitize.test.tsx` 与 `toc.test.ts` 之间**少了一个空格**（实测字符码是 `…115,120,115,114…`，即 `sx` 紧跟 `sr`，两段之间没有任何分隔字符）。于是它被当成**一个不存在的路径**：`pnpm test` 少跑这两个文件，却仍然 `exit 0`、报告「268 tests / 0 fail」。
- ✅ 判据：`npx tsx --test <粘起来的路径>` 单独跑会明确报 `Could not find '…'`（exit 1），但混在一长串参数里只被忽略。所以**看 exit code 与总数不够**，得按测试名确认它真的跑了。
- ✅ 规则：
  1. 新增测试文件后，`grep` 一次 `pnpm test` 的输出里**该文件的测试名**（例如 `collectTocItems`），确认它出现在结果里。
  2. 总数突然变少/变多都要能解释：修掉这个空格后同一份代码从 268 → 283 条（两个文件一直都在，只是从没跑过）。
  3. 这条同样适用于任何「手写的文件/路径清单」（`scripts/check-admin-classes.mjs` 的 FILES 同理：新组件不登记就永远不检查）。
- 📎 案例：2026-10-03 加相册功能时顺手发现；同一次把 `image-group.test.ts`、`slug.test.ts`、`albums.test.ts` 补进清单。

### P-142 mdast 与 hast 的图片节点**形状不同**：rehype 插件拿到的是 `element img`，不是 `image`
- ❌ 错误：给折叠组写「数一数组里几张图」的单测时，我拿 `fromMarkdown()`（mdast）解析出的树去断言，结果数出 0 张 → 两个测试红。当时的直觉是「实现有 bug」，实际是**测试站错了层**。
- ✅ 根因：`mdast` 阶段图片是 `{type:"image", url}`；`remark-rehype` 之后才是 `{type:"element", tagName:"img"}`。`rehypeImageGroups` 是 **rehype 插件**，它只在 hast 上跑。
- ✅ 规则：
  1. rehype 插件的单测用**合成 hast 树**（`element` + `tagName`），与 `sanitize.test.tsx` 的既有写法一致；markdown 往返（幂等/缩进）的断言留在 mdast 层。
  2. 失败先问「我喂给它的树是哪一层的」，再怀疑实现。
- 📎 案例：2026-10-03 `lib/markdown/image-group.test.ts`。

### P-143 这个 shell 是 **Windows PowerShell 5.1**：`Set-Content` / `Out-File` 默认写 ANSI，会把 UTF-8 源码写坏
- ❌ 错误：为了改一个 token 名，我用 `Get-Content -Raw` + `.Replace()` + `Set-Content -NoNewline` 去改 `main/src/app/admin/admin.css`（128KB、大量中文注释）。PS 5.1 读时按 ANSI 解释 UTF-8 字节、写时再按 ANSI 落盘，**601 处字符被替换成 `?`**，文件不再合法 UTF-8 —— Read 工具直接拒读（`invalid UTF-8 text`），类名自查也跟着失真。
- ✅ 判据与修复：`New-Object Text.UTF8Encoding($false,$true)` 严格解码能立刻判定（抛 `DecoderFallbackException`）；坏文件先 `Copy-Item` 到 `%TEMP%` 留档，再 `git checkout -- <file>` 恢复，然后用**编辑工具**重贴改动。恢复后必须复验：严格 UTF-8 + `node scripts/check-admin-classes.mjs` 缺失为 0（它同时守住了「重贴时漏了别的类名」）。
- ✅ 规则：
  1. **不要用 shell 写源码/文档文件**：一律走读写/编辑工具。
  2. 确需 shell 处理文本时显式 `-Encoding utf8`，且**读也要显式指定编码**——PS 5.1 的 `Get-Content`（不带 `-Encoding`）按 ANSI 读 UTF-8 文件，读进来就已经是乱码字符串，写回再"正确"编码也没用。
  3. **严格 UTF-8 校验拦不住这种事故**：乱码（`鏂囩珷` 之类）本身是合法 UTF-8，`Text.UTF8Encoding($false,$true)` 会报 OK。唯一可靠的验收是**用 Read 工具读回来眼看内容对不对**（或按要求的中文串断言）。
  4. 交叉验证输出：`(Get-Content).Count` 实测比真实行数少（同一文件 5400 vs 5516），行数/字符统计一律以 Read 工具为准（P-077 同源）。
  5. **git 只救得回已跟踪的文件**：新建文件被写坏时没有 `git checkout` 兜底，只能重写——所以更要把 shell 排除在编辑手段之外。
  6. **复发（2026-10，轻量级版本）**：这次没写乱码，但 `Set-Content -Encoding utf8` 在 PS 5.1 下会**写 UTF-8 BOM**（文件头多出 `EF BB BF`），Kotlin 源码莫名多出三个字节、diff 里看着像"文件被整体改过"。判据一条命令：`[System.IO.File]::ReadAllBytes(...)` 看前三个字节是不是 239/187/191。修法不是"再写一次"——**用编辑/写入工具重写整个文件**。结论不变：**凡是源码/文档，一律不要用 shell 写**。
- 📎 案例：2026-10-03 加相册后台样式时（`admin.css`，已跟踪 → 从 git 恢复）；同一天改 `ImageGroupView.tsx`（新增文件）时**又踩一次**，只能整份重写。

### P-144 `rehype-sanitize` 对**认不出的节点类型**直接把整棵子树丢掉：正文里内容凭空消失、控制台一行报错都没有
- ❌ 现象：正文里写了 `<ImageGroup title="花期">…</ImageGroup>`，页面上**整段内容和图片一起消失**，没有报错、没有占位。
- ✅ 根因：`rehype-sanitize` 的 `transform()` 只认 `comment`/`doctype`/`element`/`root`/`text`，其余类型 `return undefined` —— 而 MDX 的 JSX 节点在 hast 里是 `mdxJsxFlowElement`，于是被整棵丢弃。现有的 `<Video />` / `<Audio />` 之所以活着，是因为 `rehypeAllowVideo` 在 sanitize **之前**把它们换成了真元素。
- ✅ 规则：**任何新的正文 JSX 组件都必须先挂一个 rehype 转换插件**（把 `mdxJsxFlowElement` 变成白名单元素），并排在 `rehypeSanitize` 前面；转换后**继续递归子节点**，否则组内嵌套的 `<Video />` 会被一起吃掉。转换函数写成纯函数（`lib/markdown/image-group.ts`）并配单测，断言「转出来的是 `details` + `summary` 且张数正确」。
- 📎 案例：2026-10-03 文章折叠组（`<ImageGroup>` → 原生 `<details>`）；同源先例见 P-020。

### P-145 可选的云存储别做成常规流程的卡点：没配 COS 时媒体库上传必然 503
- ❌ 现象：纯本地站点（没填 COS）在后台上传文件报「请先在设置里填写腾讯云 COS 配置后再发布」，上传不成功。
- ✅ 根因：`finalizeUpload()` 的 `replicate` 步无条件 `requireCos()` → 抛 503。而这一步的调用方有**三条常规路**：媒体库上传（`UploadsToolbar`，它不带 `defer`）、文章保存发布、发瞬间（后两者走 `finalizeAdminUploads`）。`defer:true` 只把上传推迟到发布，并没有绕开这一步——所以三条路都会在纯本地站点上失败。
- ✅ 规则：
  1. **COS 是可选的**（`docs/api-contracts.md` 的 `/api/upload` 写着「未配 COS 时也可入库」）。缺它就**跳过那一步并如实返回 `{skipped:true}`**，不要报错；只有「用户显式要求 COS」的动作（迁移到 COS、COS 连接测试、备份上云）才该 503。
  2. 判断「配没配」要 `await loadCosSettings()`（真去读配置），**不要用 `peekCosSettings()`**：后者读的是内存缓存，新进程里可能是空的，会把配了 COS 的站点误判成没配 —— 那会**静默漏传**（比报错更难发现）。原来那行 `if (!isUploadPending(row) && peekCosSettings())` 正是这个隐患。
  3. 顺带确认过的邻居（都已经是安全的，别改坏）：`pruneLocalMedia()` 没 COS 直接 return（**永不删唯一副本**）、`regenerateThumbs()` 用 `cosConfigured ? getDriver("cos") : null`、`CosDriver` 的方法都是 `async`（内部 `await requireCosSettings()` 会 reject 而不是同步抛），所以 `cos.delete(...).catch()` 兜得住。
  4. 副作用要讲清楚：没有 COS 时「本地媒体上限」不会清任何文件（因为清的前提是有云端副本），磁盘只会涨 —— 媒体库页面对此有一句明示。
- 📎 案例：2026-10-03 用户报「上传媒体库提示必须配置 COS」。修法：`lib/uploads/finalize.ts` 用 `shouldSkipCosStep(step, Boolean(cos))` 短路 + `lib/uploads/steps.ts` 纯函数与单测（steps.test.ts）把这条规则钉住。

### P-146 MDX 只把「大写开头」的名字当组件：显式 JSX 转出来的小写标签会被静默跳过映射
- ❌ 现象：`<ImageGroup>` 由 rehype 插件转成 `<details class="post-image-group">`，又在 `compileMDX({components:{details: 我的组件}})` 里注册了——前台渲染出来的是**原生 `<details>`**：摘要、图片、样式全都在，**一行报错都没有**，只是"组件那套交互"（叠放卡、滑动、展开动画）完全不出现。极容易被当成"功能没做"，其实做了、只是没生效。
- ✅ 根因（`@mdx-js/mdx` 的 `lib/plugin/recma-jsx-rewrite.js`，三个分支）：

  | 标签名 | MDX 怎么处理 |
  |---|---|
  | 大写开头（`Foo`） | **组件**：从 `_components` 取 → 命中 `components.Foo` ✅ |
  | 小写 + markdown 产出（`# 标题` → `h1`） | HTML 标签，**会**查 `components.h1` ✅ |
  | 小写 + **显式 JSX 产出** | 源码注释原文 `Do not turn explicit JSX into components from _components`（判据是节点上的 `_mdxExplicitJsx`）→ **保持原生标签** ❌ |

  折叠组是用户写的显式 JSX，转成小写 `details` 正好落进第三类。
- ✅ 规则：转换层把 `tagName` 写成**大写**的组件名（`IMAGE_GROUP_TAG = "ImageGroup"`），`sanitizeSchema.tagNames` 放行它、`attributes.ImageGroup = ["className"]`，组件注册到 `components.ImageGroup`。大写名走组件分支，与 `_mdxExplicitJsx` 无关，稳。
- ✅ 判据（两条独立、都很快）：
  1. **抓一次页面看 SSR**：`fetch` 文章页搜"只有组件才会产出的类名"（本例 `ig__viewport`）。搜不到、只有转换后的原生标签 ⇒ 映射没生效。比读源码快得多，也不会被"样式齐全"骗过。
  2. **单测守卫**：`image-group.test.ts` 断言「标签名必须大写 + sanitize 必须放行 + attributes 必须是 `["className"]`」，改回小写直接失败。
- ✅ 附带教训：`components.img / video / audio` 能用**不代表**别的标签也能——`rehypeAllowVideo` 那条路整个 DOM（`figure`、视频标记）都是在 HAST 里搭好的，从不依赖 `components`。拿它当"组件映射一定生效"的先例是错的推断。
- 📎 案例：2026-10-03 用户问「折叠效果呢？」。SSR 里是 `["$","details",null,{...}]`（原生标签），而同页 Lightbox 是 `["$","$L16e",...]`（客户端组件引用）——一眼定性。修后 SSR 里出现 `ig__viewport` / `ig__card` / `ig__backdrop`，`pnpm shot` 量到 `.ig__viewport` 818×433（不是 SSR 兜底的 320px，说明客户端 layout effect 也跑了）。

### P-147 给布局属性加过渡前，先确认两个端点都是可插值长度：`auto` 不参与补间，会当场跳到终值
- ❌ 现象：点开相册里的一叠照片时，整叠**先瞬移一下再滑动**——首帧就跳到半路（实测：点击后 2ms 内 `width 508→260`、`y 0→-45`），之后才连续。
- ✅ 根因：折叠态卡片靠 `left: 0; right: 0` 撑出宽度 → `width` 的**计算值是 `auto`**；`auto → 401px` 不可插值，浏览器**直接把该属性跳到终值**，而同一帧里 `left/top/transform` 还在正常补间 → 视觉就是"瞬移 + 滑动"两段。**"声明了 transition" ≠ "会补间"。**
- ✅ 规则：凡是要补间的盒子，两个端点的几何都写成**可插值的长度**（`left: 0; right: auto; width: Npx`）；能写显式长度就别依赖两只定位边撑开。
- ✅ 判据（可量）：`requestAnimationFrame` 逐帧**同时**采 x/y/w/h（只采一个轴会漏掉纵向与尺寸的跳变），用「单帧位移 ÷ 该元素总行程」与缓动函数的理论单帧峰值比（easeInOutCubic 在 16ms/340ms 下约 7%）。修前 **48%** → 修后 **5.6%**；列表"第一张不动"也要用硬断言（`left` 起止相同 + `offsetWidth` 恒定），别靠眼睛。
- 📎 案例：2026-10-03 相册详情展开（`components/album/PhotoPile.tsx`；版式原型是 `demo/album-page/pile.js`，同一套几何）。

### P-148 Windows 上 Prisma 的 generate / migrate 与运行中的 dev server 互斥：别用 `--no-engine` 绕，更别 reset
- ❌ 现象：dev server 在跑时 `npx prisma generate` 报 `EPERM: operation not permitted, rename ... query_engine-windows.dll.node.tmpXXXX -> query_engine-windows.dll.node`；`npx prisma migrate deploy` 报 `SQLite database error / database is locked`（而此时用 better-sqlite3 开写事务是**通的**，0ms 就能拿到锁）。
- ✅ 根因：前者是 dev server 进程加载着 native query engine，Windows 不允许替换被加载的 DLL；后者是 Prisma schema engine 自己的锁竞争，与 `busy_timeout` 无关。
- ✅ 规则：
  1. **先停 dev server，再 generate / migrate deploy，然后立刻把 server 起回来**（带新模型的版本本来也要重启才生效）。停之前按命令行匹配确认是**本项目的进程**（`Win32_Process` 里含项目路径），别误杀其它服务。
  2. **不要用 `prisma generate --no-engine` 绕 DLL 锁**：项目用 driver adapter（`lib/db.ts` 的 `PrismaBetterSQLite3`），Prisma 会直接拒绝——`PrismaClientValidationError: Prisma Client was configured to use the adapter option but prisma generate was run with --no-engine`，运行时必炸；更坑的是 `--no-engine` 已经改写了 client 的 JS，必须整目录还原（处置：先把 `.prisma/client` 复制一份到仓库外做备份）。
  3. **drift 提示不要顺着走**：`migrate dev` 会提示 "We need to reset the SQLite database"（本仓 `Post` 表有既有 drift），**reset = 清空开发库**，绝不能点。要么用 `migrate deploy`（不做 drift 检测），要么按既有迁移的写法**手写迁移**再 deploy。
  4. 手写迁移照 `prisma/migrations/20261003090000_album/migration.sql`：**外键内联在 `ADD COLUMN` 上**（SQLite 不支持 `ADD CONSTRAINT`；影子库走"空库 → 应用 migrations"，只认内联的 REFERENCES）。
- ✅ 判据：`prisma migrate status` 说 up to date **不代表新表在库里**——用 better-sqlite3 直接查 `sqlite_master`（表 / 列 / 索引）与 `_prisma_migrations` 的行才算证据。**路径**：`DATABASE_URL=file:../data/blog.db` 是相对 `prisma/` 的 → 实际文件在 `main/data/blog.db`（不是 `main/../data/`）。
- 📎 案例：2026-10-03 相册分卷批次（`20261003113000_album_volume`：新表 + 新列 + 2 索引 + 迁移登记行都做过物理核对）。生产仍走 `boot.cjs` 的 `migrate deploy`（Linux，无此 DLL 问题），带新模型的版本补一次 `prisma generate`，见 P-124。

### P-149 脚本"清理自己刚创建的东西"前必须证明归属：`order by id desc limit 1` 不是证据
- ❌ 现象：一个验收脚本先 POST 上传、再"删掉我刚创建的那条记录"——上传其实**失败**了（HTTP 403 `CSRF_INVALID`，`/api/upload` 的 CSRF 校验在 `handleUpload()` 里，只 grep 路由看不见），而清理仍按 `.order by id desc limit 1` 取"最新一行"删掉：**真实用户照片的行 + 6.3MB 原图被永久删除**（`fs.rmSync` 不进回收站）。相册张数 4 → 3、卷内 2 → 1。
- ✅ 根因：把「查询到的最新一条」当成了「我这次创建的」，且**没有先看响应状态**就进入清理分支；破坏性操作与业务结果之间没有断言。
- ✅ 规则：
  1. **先判响应，再谈清理**：`if (!response.ok) { 记录状态并直接放弃，不执行任何清理 }`。
  2. **清理只认可证明归属的标识**：用响应体里的 id / key，或写入前记录的前后差集，**不要用** `order by id desc limit 1`、`max(createdAt)`、"最新的那张"这类推断。
  3. **删文件前打印并核对绝对路径**：`console.log(path.resolve(target))` 打出来，人眼过一遍再删（本次就是没做这一步）。
  4. 脚本要按"能失败得安全"写：只增不删优先；确需删除时，删除范围尽量由**本次自己生成的唯一标记**圈定。
- ✅ 出事后的正确动作（本次实际走的路）：**立刻停手、只做只读取证**（`data/backups/`、回收站、CDP 浏览器 HTTP 缓存、`_prisma_migrations` / 剩余缩略图）→ 判断可恢复边界 → 用**只增不删**的方式重建（新内容算新 sha256、沿用原 id、重建库行）→ 前台复核（组头张数、`img` 分层、三个 URL 状态码）。
- 📎 案例：2026-10-03 相册分卷验收。原图**不可恢复**（扫了 20,842 个缓存文件 / 593 个 ≥16KB 的 JPEG 段，无一命中其 sha256；`data/backups/` 为空、回收站无），只能用保留下来的 **1280×853 一级缩略图**降级重建（`images/original/93/93afd49f….webp`，63KB），相册/卷归属与顺序复原。教训一句话：**验收脚本的"清场"是破坏性代码，要和业务写操作一样对待**。

### P-150 blob URL 谁创建谁回收：在下游组件的 effect 清理里 revoke，开发模式首屏就把图撤销掉
- ❌ 现象：媒体库「上传预览」弹窗里的本机缩略图**整片加载不出来**（`<img src="blob:…">` 解码失败、自然宽高 0），而文件名、体积、「移除」按钮、相册/卷下拉全都正常 —— 看起来像"图片读取失败"，其实是被撤销了。
- ✅ 根因：预览地址由 `UploadsToolbar.toPending()` 创建，而 `UploadPreviewDialog` 里写了 `useEffect(() => () => items.forEach(revokeObjectURL), [items])`。调用方为了复位选择状态给弹窗按批 `key`（换一批文件就重挂载），React **开发模式**还会「挂载 → 清理 → 再挂载」→ 清理函数首屏即执行、把刚创建的 blob 全部撤销 → 图片必然空。**生产模式不双跑，所以这是"只有 dev 复现"的一类坑。**
- ✅ 规则：**谁创建谁回收**。blob / objectURL 的所有者只能是创建它的那个组件；下游只负责渲染 URL，**不要**回收别人的。卸载兜底回收要写在所有者里，且**不能用会变的依赖**（`[items]` 这种写法等于"每次变化都撤销一批"）。
- ✅ 工具：用 `useRef` 镜像最新值时，**写 ref 必须放在 effect 里**（`useEffect(() => { ref.current = value }, [value])`）——渲染期间直接 `ref.current = value` 会触发 `react-hooks/refs`（本次 lint 当场抓到）。
- ✅ 判据（真浏览器，零数据风险）：给 `<input type=file>` 用 `DOM.setFileInputFiles` 塞两张不同比例的测试图（脚本生成、只放 `%TEMP%`），断言 `.admin-upload-item__preview img` 每张 `complete === true && naturalWidth > 0`（本次 `320×200` / `200×320` 全过；修前首屏就被撤销）。**不要点「确定上传」**，取消即可（`onCancel` → `discardPending()`）。
- 📎 案例：2026-10-03 用户报「上传前的本地预览图无法正常加载」。同类排查陷阱：`AdminDialog` 是 **portal + `div.admin-dialog`**（`role="dialog"`），**不是原生 `<dialog>`** —— 用 `dialog[open]` 查会得出"弹窗没打开"的错误结论（我第一轮就踩了）。

### P-151 要抢占的全局键（Esc 等）必须注册在 `document` 的 **capture 阶段**：冒泡里的 `stopPropagation` 拦不住先注册的兄弟监听
- ❌ 现象：媒体库上传预览弹窗里展开相册下拉，按一次 Esc —— **下拉和弹窗一起关了**。以为「在面板的 React `onKeyDown` 里 `preventDefault` + `stopPropagation`」就够（旧实现就是这么写的，注释还写着"不拦住会把弹窗一起关掉"），实测不够。
- ✅ 根因：`AdminDialog` 的 Esc 监听 `document.addEventListener("keydown", …)` 注册在**冒泡**阶段，`AdminSelect` 的同类监听也在冒泡；两者谁先注册由**挂载顺序**决定（弹窗先开、下拉后开时弹窗那条先注册）→ 弹窗先执行 `onClose()`，事件到下拉时弹窗已经没了。React 合成事件同样不可靠：它挂在容器根上，与直接挂 `document` 的原生监听没有顺序保证。
- ✅ 规则：**要抢占的全局键（Esc / 方向键等）注册在 `document` 的 capture 阶段**：`document.addEventListener("keydown", handler, true)`，命中就 `preventDefault()` + `stopPropagation()` —— capture 在冒泡之前的**整条路径**上跑，弹窗的冒泡监听注定收不到这次按键。同时给浮层自己挂一个 `onKeyDown`（哪怕只处理方向键），让 React 的委托监听挂上，避免"capture 拦掉了、React 侧却没收到"的错觉。
- ✅ 判据（真浏览器）：弹窗内展开下拉 → `Input.dispatchKeyEvent` 发 Esc → **50ms 内**断言 `document.querySelectorAll('.admin-dialog__panel').length === 1` 且下拉已收起；修前同一断言是 0（弹窗关掉）。想定位 listener 顺序就 patch `Document.prototype.addEventListener` 记 stack，别猜。
- 📎 案例：2026-10-03 媒体库「相册 / 卷」下拉改浮层。诊断输出（`AdminDialog.useEffect` 注册在前、`AdminSelect.useEffect` 在后）直接把根因钉死；改成 capture 后同一脚本 19/19 通过。

### P-152 浮层几何别放进 React state：effect 里 `setPos()` 就是 `react-hooks/set-state-in-effect`，直写 DOM 才是唯一不报错的写法
- ❌ 现象：`useLayoutEffect`（或 `useEffect`）里量完触发按钮的 `getBoundingClientRect()` 想 `setPos({...})` → eslint 直接报 `react-hooks/set-state-in-effect: Calling setState synchronously within an effect can trigger cascading renders`（Next 16 的 `eslint-config-next` 带这条，**不是警告是 error**）。写成 `setPos(current => …)` 绕一下照样报。
- ✅ 规则（本项目已有先例：`PhotoPile` / `ImageGroupView` 的几何都归 DOM）：**位置/尺寸这类几何直接写 DOM**——面板初始 `style={{ visibility: "hidden", position: "fixed" }}`，在 `useLayoutEffect`（渲染后、绘制前同步执行，不闪）里量好 rect、必要时向上翻（`top` 换 `bottom`）、按可用空间夹 `maxHeight`，最后 `panel.style.visibility = ""`。**React state 只装数据**（`open` / 值），不装坐标。
- ✅ 附带两条：① 面板**必须在 `rAF` / 二次 effect 之后再量**是不必要的——`useLayoutEffect` 里 portal 节点已经挂上，直接量最准；② 每次量之前先把上一次的 `maxHeight` 清空，否则量到的是被夹过的矮面板（会越开越矮）。
- 📎 案例：2026-10-03 `AdminSelect` 浮层定位（`left`/`top`/`width`/`maxHeight` 全走 inline style 直写）。同一轮还顺手确认：`document.documentElement.scrollHeight` 在展开前后不变（`position: fixed` 的面板不参与文档流），这是"浮层不挤压布局"的可复现判据。

### P-153 一个盒子同时被「flex 高度」和「宽高比」夹住时，几何就变成了循环依赖：量一次、写成一个变量
- ❌ 现象：首页相册卡片模块里，封面的「一叠」要让照片**按原比例铺满封面区** —— 叠高 = 封面区宽 ÷ 宽高比。可封面区的宽来自 flex（卡片宽 = 行高 × 卡片宽高比），于是宽度依赖高度、高度又依赖宽度。硬写 CSS 公式（`height: calc(100% / var(--ar))`、给叠加 `max-height: 100%`、或让层按 `aspect-ratio` 反推宽度）都会**静默**给出错的尺寸：实测第 0 张只剩叠宽的 51.6%（211 宽的卡里照片 109 宽，像块小邮票贴在中间），而 `getComputedStyle` 里每条声明看着都"生效了"。
- ✅ 规则：这类几何**在 layout effect 里量一次、写成一个 CSS 变量**（本项目同 `PhotoPile` / `ImageGroupView`，见 P-152）：`--album-vh = min(0.9, 封面区宽 ÷ 宽高比 ÷ 封面区高)`，高度写成 `calc(100% * var(--album-vh))`。宽度继续由父级决定，只有那一个比例是量出来的。
- ✅ 三件事定死之后再动：① **谁决定谁**只能有一个方向（这里是"叠宽由封面区宽决定、层高由宽高比决定"），反过来写就是把整叠缩一半；② 层宽走 `calc(100% * var(--pile-w))`（乘数，不是百分比字面量 —— `calc` 里混百分比字面量会让声明非法被静默丢掉，P-132）；③ 顺序是 `position:absolute` + `top:0`，别写 `bottom`（不同高度的层底不会齐，露出的边会错位）。
- ✅ 验证口径：别只看截图（这个模块首屏被 Banner 盖住，图里根本看不到）。用 CDP 取 `getBoundingClientRect()`，一次打印**桩高 / 叠盒 / 每层盒 / 每层内联变量**，再拿"按公式应得的值"对比 —— 本轮就是靠这份数据当场定位到"第 0 张只有 51.6% 宽"。
- 📎 案例：2026-10-03 首页「相册卡片」模块（`lib/albums/pile.ts` + `components/home/modules/AlbumCardsModule.tsx` + `globals.css` 的 `.home-album-cards__*`）。同轮顺带确认：抽出的几何与 `/albums` 列表卡**只写一处**（`pileLayer()`），两处只差一个 `shrink`。

### P-154 「客户端是不是 App」只认一次判定：藏在最里层 `return null` 会留下空壳子（空格子 / 贴边空浮层）
- ❌ 现象：首页要在 App 里藏掉「推荐应用」卡。最自然的写法是在卡片组件里 `if (appMode) return null` —— 内容确实没了，但**外面那层壳还在**：格点里的模块格子照旧占位（版式里多一个空盒子、还能接住点击），浮层更糟——`HomeFloat` 已经画好了一个 `position: fixed` 的贴边 `<aside>`，透明但**照样压住那块区域的点击**（同 P-135/P-136 那类"内容在、定位与交互全丢"的变种）。
- ✅ 规则：**能决定"渲不渲染"的地方就是判定点，且必须全部走同一个函数**。本轮落地：`lib/client/detect.ts` 的 `isModuleHidden()`（含自建模板卡的 HTML 特征判定，因为模板建出来的浮层没有 builtinKey），三处调用——`HomeGrid`（`items.filter` 里，**在 `toAreas()` 分组之前**摘掉）、`HomeFloat`（同样在 map 之前）、`HomeModuleRenderer`（兜底）。任何一处漏了都会留下空壳子，而且是**静默**的。
- ✅ 判定输入要一次取全：`appMode` 是服务端按 UA 算的（`app/page.tsx` 读 `headers().get("user-agent")`），逐层当 prop 传下去；**预览态（`preview`）必须优先**，否则后台画布/模块编辑页里站长看不到自己配的内容 —— 检验方法就是 `pnpm shot` 对首页截图，再对 `/admin/modules/<id>` 截图，两边的可见性必须不一致。
- 📎 案例：2026-10-03 App 内不弹「推荐应用」+ 推送抑制的客户端标识（`lib/client/detect.ts` / `HomeGrid` / `HomeFloat` / `HomeModuleRenderer`；服务端契约见 docs/api-contracts.md 的 `/api/client/status`）。

### P-155 归一化时「补默认协议」之前，先确认输入不是别的协议：`ftp://x` 会静默变成合法的 `https://ftp://x`
- ❌ 现象：地址归一化只判 `startsWith("http://") || startsWith("https://")`，不满足就补前缀 → 输入 `ftp://bruccese.com` 被当成"没写协议"，拼成 `https://ftp://bruccese.com`。而 `URI()` 解析它时 **host 恰好非空**（是 `ftp`），于是校验全部通过、**静默存下一个永远打不开的地址**。这个 bug 是被单测当场抓出来的，不是靠肉眼看代码。
- ✅ 规则：补协议前先判"已经带了协议"：`^[A-Za-z][A-Za-z0-9+.\-]*://`，命中就**原样交给下游校验**（别的协议自然被拒）。同类"补默认值"的归一化（补端口、补路径、补 www）都适用这条：**先证明输入不属于另一类，再补。**
- ✅ 验证口径：把这类纯逻辑从 Android 代码里抽出来（`androidapp` 的 `AppUrl.kt`，无 Android 依赖）写 JVM 单测 —— `gradlew :app:testDebugUnitTest` 秒级返回，不需要模拟器；否则这种"看着合理、跑起来打不开"的 bug 只能靠真机手敲才发现。
- 📎 案例：2026-10-03 Android 客户端「首启直达默认站点」改造（`AppUrl.normalize()` + `AppUrlTest`，共 6 条用例覆盖默认地址/迁移/归一化/UA）。

### P-156 `GeckoSession.getDefaultUserAgent()` 是静态方法；实例上的 `getUserAgent()` 返回的是 `GeckoResult<String>`
- ❌ 现象：要在 UA 后面追加 App 标识，写成 `GeckoSession.getUserAgent()`（当成静态用）→ 编译期直接 `Unresolved reference 'getUserAgent'`。查 AAR 才发现两个 API 长得几乎一样但完全不同：`public static String getDefaultUserAgent()` 与 `public GeckoResult<String> getUserAgent()`（后者要 `open()` 之后异步查内核）。
- ✅ 规则：GeckoView 这类"同名不同形"的 API **一律 `javap` AAR 里的 classes.jar 实读再写**，别按印象补。取默认 UA 只用静态那个。
- ✅ 附带：UA 覆盖要在 `GeckoSessionSettings.Builder().userAgentOverride(...)` 里、`open()` **之前**设好，否则网络栈第一次请求用的还是默认 UA。要验证"到底发出去的是什么"，别只看 logcat 里自己的日志 —— 起一个只回显 `user-agent` 的临时服务当靶子，用 `adb` 改 `shared_prefs/smartblog.xml` 让 App 指向它（改前必须 `am force-stop`，否则退出时内存里那份会覆盖回去），实测结果见 docs/android/architecture.md §2b。
- 📎 案例：2026-10-03 SmartBlog UA 标记（`AppUrl.withSmartBlogTag()` ↔ `lib/client/detect.ts`）。

### P-157 `response.json()` 会把网关的 HTML 错误页翻译成 `Unexpected token '<'`，用户与排障者都拿不到任何线索
- ❌ 现象（2026-10-03 生产）：后台点「立即备份」，等了十几秒弹出 `Unexpected token '<', "<html> <h"... is not valid JSON`。刷新后**本地包在**、云端没有。前端只有这一句话：没有状态码、没有 URL、看不出是应用还是代理。
- ✅ 根因：请求走 nginx。上游进程在响应前退出（本例是被 61 秒一次的重启循环打断，见 P-133），nginx 没拿到响应头，就回它**自己的 HTML 错误页**（`<html>\r\n<head><title>502 Bad Gateway</title>…`）。客户端 `await response.json()` 直接把这段 HTML 丢给 `JSON.parse`，于是报出来的"错误"是 HTML 的第一个字符。判据：报错前缀就是 `<html>`（不是 Next 错误页的 `<!DOCTYPE html>`）→ 是**网关**发的，不是应用；再去 `/var/log/nginx/error.log` 对时间点找 `upstream prematurely closed connection` / `upstream timed out`。
- ✅ 规则：客户端读 JSON 只有一条路 —— `lib/client/http.ts` 的 `readJsonResponse()`：先 `text()` 再 `JSON.parse`，失败时抛「HTTP 状态 + 内容类型 + URL + 响应片段」，502/503/504 额外说明「反向代理没拿到响应，应用可能正在重启，先刷新确认结果再决定重试」。`adminJson()`、`fetchCsrfToken()`、备份/更新包两个 multipart 上传都必须走它，别再各写一次 `response.json()`。
- ✅ 配套：**长活不要挂在一次请求上**（备份上云改后台队列，见 P-158）；后台的"刷新确认"比"盲目重试"安全——重试可能重复执行已经在服务端跑完的动作。
- 📎 案例：`src/lib/client/http.ts` + `http.test.ts`（含 502 话术断言）。

### P-158 备份上云挂在请求里：一次进程重启就变成「本地有包、云端没有」，而且没人知道
- ❌ 现象（2026-10-03 生产）：手动备份返回 502，刷新后本地包 78,947,575 B 完好（列表里看得见、能下载），COS 里没有这个对象；`[myblog] 备份已完成` 这行日志也没写——进程是在**上传那一步**被杀的，连失败日志都来不及写。旧实现 `replicateBackupToCos()` 的结果只有一个 boolean，且"没配 COS"与"传失败"不可区分，UI 上没有任何提示，也没有任何补传入口。
- ✅ 规则：
  1. **请求只负责本地落盘**：`runBackup()` 打完包就把任务排进 `lib/backup/uploads.ts` 的队列并返回（`cosUploadQueue`），上传在响应之后跑。60–80MB 的包在这台机器上要几十秒，谁都不该陪着等；同一条规则适用于导入备份包。
  2. **状态先落盘再上传**：`data/backup-uploads.json` 是唯一事实源（`queued`/`uploading`/`failed` + 次数 + 原因），60 秒 tick 与启动补偿按指数退避续传，连试 5 次停手。**只在内存里记"正在传"是错的**——进程重启正是这条链路最常见的打断方式。
  3. **失败要看得见、能补救**：「位置」列写清 `本地 · 上传中…` / `本地 · 上云失败` / `本地 + COS` / `仅 COS`，只在本机的包给「上传到 COS / 重试上传」按钮（`POST /api/admin/backup/push`）。
  4. **本地副本先别删**：轮转清理放过还在队列里的包（那是它上云前的唯一一份）；`failed` 的不挡清理（否则磁盘会被撑满）。
  5. 文件被删 / COS 被关掉时**清掉记录**，不留永远传不完的幽灵。
- 📎 案例：`lib/backup/uploads.ts` + `upload-view.ts` + `uploads.test.ts` / `uploads-io.test.ts` / `upload-view.test.ts`；方案见 [cos-storage-spec.md](cos-storage-spec.md) §5a。

### P-159 Kotlin 注释里的 `/*` 会再开一层注释；反引号测试名不能带 `/`；JVM 单测里 `org.json` 是空桩
- ❌ 现象（同一轮里三连踩）：
  ① KDoc 里写了 `main/src/lib/feed/*`（想表达"这个目录下的文件"）—— **`/*` 在 Kotlin 块注释里又开了一层注释**，报 `Syntax error: Unclosed comment`，而且**报错行是文件末尾**（真正的问题在几十行之前）。
  ② JUnit4 测试方法名写 `` fun `解析增量：/api/feed/updates 的载荷`() `` —— 反引号名里**不能带 `/`**：`Name contains illegal characters: /`。
  ③ 单测一调 `JSONObject.optString()` 就 `Method optString in org.json.JSONObject not mocked` —— `android.jar` 里的 `org.json` 只有**桩**，JVM 单测跑的是空实现。
- ✅ 规则：
  ① 注释里永远别写 `/*`：通配路径写成 `lib/feed/ 目录`，或直接点文件 `` `lib/feed/updates.ts` ``。
  ② 反引号测试名只用字母/数字/中文/空格/`_`，别放 `/ \ . [ ]`。
  ③ 要解析 JSON 就加 `testImplementation("org.json:json:20240303")`（真实现，仅测试期、不进 APK）。**别用** `unitTests.isReturnDefaultValues = true` 糊过去——那会让 `JSONObject` 返回 `null`/`0` 这类假值，测试看着绿、实际什么都没验证。
- ✅ 附带两条同类构建坑（同一轮踩到）：
  - **改 `-PstartUrl` 后必须 `--no-build-cache --no-configuration-cache`**（或 `--rerun-tasks`）：Gradle 会拿旧缓存里那份 `BuildConfig` 重建 APK，**参数看着生效、装的却是旧地址**（实测 `pm clear` 后 App 进了 `https://bruccese.com` 而不是 dev server）。
  - **手改 `shared_prefs/*.xml` 不牢靠**：App 进程活着时内存副本会在退出/被唤醒时覆盖回去，`sed` 还可能把引号吃掉（`name=" push_admin_mode value=	rue`）。要复位状态就用 `pm clear` + 构建期 `-PstartUrl`；真机上"管理员态"这类判定别靠改文件，宁可用界面操作走真实路径。
  - GeckoView 的 `onLocationChange` **4 参数签名在 Kotlin 侧容易 `overrides nothing`**（不定型 `java.util.List<ContentPermission>`），且 `GeckoSession` **没有** `getUri()`（`javap` 实读）。要跟踪当前地址，走 `NavigationDelegate.onLoadRequest` 的 `request.uri`。
- 📎 案例：2026-10-03 App 通知层（`PushRules.kt` + `PushRulesTest.kt` + `AppNotifier.kt`）。

### P-160 「一叠照片」抽出看不见，八成不是动画没写，是**首帧就把终态写进了 DOM**，或者**整叠铺满画框把后面几张盖死了**
- ❌ 现象（2026-10-05 用户报「手机相册预览没有展开动画」，电脑视图同样没有。两处**同时**中招，根因是两个不同的坑）：
  - ① **首页「相册卡片」模块**：每一层的内联样式直接用了 `pileLayer()` 算出的**终态** `left`（`16.13% / 32.26% / 48.39%`）。逐帧实测首帧就是抽出后的位置、整段 `distinctPositions=2`（0 → 终值），**从头到尾没有补间** —— 打开页面看到的就是"已经铺开"的封面。
  - ② **`/albums` 列表卡**：过渡确实在跑（逐帧 53~88 个中间位置），但 `pileLayer()` 让每张都宽 **100%**：叠放态所有张压在同一个左缘、第一张在最上面，于是**第一张把后面几张整张盖住**（再被 `overflow: hidden` 裁掉）—— 390px 三张截图（t=1.0s / 1.25s / 2.6s）**完全一致**，"抽"是一个看不见的动作。顺带 `transform` 不在 `transition` 里，倾斜是**一帧跳过去**的。
- ✅ 规则：
  1. **首帧 = 叠放态，只能由组件渲染**（SSR 就得是叠放态）。终态只能由**写入即过渡**的那一次写进 DOM：`useEffect`/`useLayoutEffect` → 提交起点 → `requestAnimationFrame` 里写终帧。**延迟到点直接写终值 = 瞬移，不是动画**；把终值写进首帧 = 连瞬移都没有。
  2. **叠放态"看得见的那张"必须比画框窄**：同心叠放 + 第一张在最上面 ⇒ 第一张的宽度就是可见照片的宽度。它要铺满画框（100%），后面的张永远被盖住 —— 想要"整叠 = 一张满幅照片 + 抽出可见"是**几何上不可能**的。做法：让铺开后**最后一张的右缘正好落在 100%**（`pileStackWidth()`），左边那一格是整叠、右边那一格是抽出的行程。
  3. **两处用同一个动作就得共用一份几何 + 一个执行器**（`lib/albums/pile.ts` 的 `pileSpread()` + `lib/albums/use-pile-spread.ts`）：各写一套必然漂移 —— 这次就是一边"首帧写终态"、另一边"整叠满幅"，两个坑还互相掩盖。
  4. **过渡属性要覆盖所有会变的属性**（`left` **与** `transform`）：只写 `left` 的话，同一时刻写进去的倾斜是**瞬跳**的（看着像"滑到一半突然歪一下"）。
  5. `prefers-reduced-motion` 要**直接给终态**：终态位置/角度作为**内联变量**（`--pile-left` / `--pile-rotate`）由组件写一遍、CSS 那边 `left: var(--pile-left, 0%) !important` 取用（内联 `left: 0%` 只有 `!important` 能盖掉，P-128 同类）；否则首帧是叠放态、水合后才跳到终态 —— 对关掉动效的人反而是一次跳动。
- ✅ 验证口径（**只能逐帧**，看截图和量尺寸都证不了）：`pnpm pile:frames [路径]`（`scripts/pile-frames.mjs`，对着已在跑的 server）逐帧读 `getBoundingClientRect()`（相对一叠容器）+ 计算样式，直接给判定：**首帧叠放 / 第一张不动 / 逐张补间 / 顺序递增 / 终态递增 / 过渡属性**；`--width` 可重复（390 与 412 各跑一遍）、`--reduced-motion`（应变成"首帧即终态、每个层只有 1 个位置"）、`--block "*thumbs2*"`（二级缩略图全 404 时动画与节奏必须不变）。**别读内联 `style.left`**：那是声明值，触发瞬间就跳到终点。
- 📎 案例：2026-10-05 相册封面「一叠照片」（`lib/albums/pile.ts` + `use-pile-spread.ts` + `components/album/AlbumCard.tsx` + `components/home/modules/AlbumCardsModule.tsx`）。证据：逐帧采样 390/412/1400 各一遍（第一张 `distinctLefts=1`，其余 53~94 个中间位置、按 70ms 递增）、390px 四阶段截图、rAF 冻结 3s（后台）期间内联 `left` 仍是全 `0%`、恢复后照常抽。

### P-161 画框里跑的是**前台**：后台自己的类名规则会漏进预览
- ❌ 现象（2026-10-06）：后台画布的模块几何与前台对不上 —— 文章卡模块整块高 **1874 vs 1868**（差 6px）。根因是 `admin.css` 里给**共用组件**写的规则：`.admin-workspace .pagination a/span { min-height: 44px }`（媒体库列表的触控区），而首页画布也在 `.admin-workspace` 里、画布里那个分页是**前台**的分页组件（38px / grid）→ 被抬成 44px / inline-flex。
- ✅ 规则：
  1. 后台给**共用组件**（`Pagination` / `PostCard` / `Widget` / `heo-*`）写的样式，选择器必须把画框排除掉：`.admin-workspace .pagination:not(.home-editor__device *)`。
  2. 判断口径是**几何比对**，不是眼睛：`node scripts/home-layout-check.mjs --section s2` 逐模块比「预览 / 前台」的宽高（宽度必须一致，高度按视口各自一致），漏一条就会被点出来。
- 📎 案例：`src/app/admin/admin.css` 的 `.admin-workspace .pagination`（两处）。

### P-162 `calc(var(--cell-h) * var(--h-unit))` 是非法值 —— 后台画布的「固定高度」从来没生效过
- ❌ 现象：模块高度改成像素口径（P-139）之后，`--cell-h` 本身就是 CSS 长度（`380px`），而画布还写着 `height: calc(var(--cell-h) * var(--h-unit))`（旧口径是「数字 × 1cqh」）。`calc()` 里**两个长度相乘**是无意义的 → 整条声明被丢弃 → 画布里"固定高度"既没落到盒子、更没送到内容（前台反而是对的，所以只在后台看得见）。
- ✅ 规则：
  1. 高度的口径只有一份：`lib/layout/viewport.ts` 的 `moduleHeightCss()`。画布**复用前台的同一套格子 CSS 变量与规则**，不要自己再算一遍（`--h-unit` 已随旧口径删除）。
  2. 改口径时要 grep 全项目找旧口径的残留（`--h-unit` / `calc(--cell-h` / `dvh`），别只改一处。
- 📎 案例：`src/app/admin/admin.css` 的 `.home-editor__module.is-fixed`（已删）。

### P-163 画框要装回**前台的基础排版**：后台的 14px 字号会继承进预览
- ❌ 现象：预览里"侧栏 widget"比前台矮 7~8px —— `.admin-workspace { font-size: var(--admin-body) }`（14px）被子孙继承，画布里所有**继承字号**的模块都比前台小一号 → 文字换行不同 → 自适应高度跟着差。
- ✅ 规则：
  1. 画框 = 前台视口的替身，要显式声明前台 `body` 那套基础排版（font-family / **font-size: 16px** / line-height 1.6 / color），别指望继承。
  2. **`rem` 不吃这一套**（它永远按 `html` 算），所以别去改 `html` 的字号去对齐；只能挡继承。
  3. 顺带：画框里滚动条的占位也必须是**设计 px**（`padding-right: 15px` + 隐藏真滚动条）—— 经典滚动条是 15 *视觉* px，画框是缩放过的，由它占位会让内容宽度随 zoom 变（0.5 时吃掉 30 设计 px），模块宽度直接对不上前台。
- 📎 案例：`src/app/admin/admin.css` 的 `.home-editor__device`。

### P-164 拖拽落定要**连同格顺序一起写**：只比 row/col/span 会把「同格中间插入」整个丢掉
- ❌ 现象（2026-10-06 用户报「同格堆叠中的任意位置」）：落点模型明明算对了（实测 `{kind:"stack", index:2}`），HUD 却显示"第 1 位"、松手后顺序没变。两处都是同一个思路的漏洞：
  - ① 把「落点规划」的结果贴回客户端状态时只 `mergeBox` 了**行列跨度与高度**，`sort` 没带过来 → 预览与落库的顺序都不动。
  - ② `finishMove()` 用 `samePlacement(origin, planned)` 判「落回原位就什么都不做」→ 同格内上下挪一位时 row/col/colSpan **全都没变**，只有 `sort` 变了 → 直接被 `return` 丢掉。
- ✅ 规则：
  1. `sort`（同格堆叠顺序）是**两个视口共用**的一列（数据库里只有一份），合并计划时不能挂在 `mergeBox()` 里按视口分流。
  2. 「什么都没变」必须**连 `sort` 一起比**（或直接比整份 entries），不能只看位置。
  3. 服务端也要能收到它：`PUT /api/admin/home/layout` 的 item 带 `sort`，`saveHomeLayout()` 有 sort 时按 sort 排、没有再退回「payload 顺序」。
- ✅ 验证口径：`node scripts/home-layout-check.mjs --section s4`（同格中间插入 → 列内顺序必须是 `7 → 8 → 6 → 9 → 10`）+ `--section s7`（保存刷新后同格顺序一致）。
- 📎 案例：`components/admin/HomeLayoutEditor.tsx` 的 `displayEntries` / `finishMove`。

### P-165 冻结的落点模型 vs `position: sticky` 的格子：画布必须关掉 sticky
- ❌ 现象：往右侧 widget 列（窄堆叠格）拖东西时，落点会掉进**别的格子**。落点模型是「按下那一刻冻结的设计视口坐标」，而 sticky 的格子在滚动时 rect 会跟着钉住 → 模型里读到的坐标比布局位置偏 **1300+px**（实测：滚动 1201 时第一块 widget 的模型坐标是 1277，刚好等于 `scrollTop + 76`）。
- ✅ 规则：`.home-editor__device .home-grid__area.is-sticky { position: static }` —— 画布里不需要"侧栏跟随滚动"这个观感，**几何一致 + 落点稳定**更重要；前台照旧 sticky（这条不改任何布局位置，只改滚动行为）。
- 📎 案例：`src/app/admin/admin.css` + `HomeLayoutEditor.measureDropModel()`。

### P-166 挂在格子外面的手柄「画得出来、点不到」（`overflow: hidden` 连命中测试一起裁掉）
- ❌ 现象：宽度/高度拖拽手柄原本写 `right: -5px` / `bottom: -5px`（贴在格子外面）。固定高度的格子是 `overflow: hidden` → 外面那半截被裁掉，**渲染看不见、`elementFromPoint(中心)` 也返回别的元素或 null** → 手柄整个拖不动（实测 `colSpan` 纹丝不动，而 handler 里连一次 pointermove 都收不到）。
- ✅ 规则：
  1. 编辑辅助手柄一律落在**格子可见范围内**（`right: 0` / `bottom: 0`），不靠负偏移"贴边"。
  2. 自查口径：`document.elementFromPoint(手柄中心)` 必须命中手柄本身（`scripts/home-layout-check.mjs` 的 s5 就带这一条）。
- 📎 案例：`src/app/admin/admin.css` 的 `.home-editor__resize`。

### P-167 Banner 的「负外边距叠压」只在它**独占那一格**时成立
- ❌ 现象：把一个模块拖到首页大图上（并入同一格）之后，它和下一行的模块出现 **27px 纵向重叠** —— `.home-grid__area:has(.home-grid__cell--banner) { margin-bottom: calc(-48px - var(--grid-gap)) }` 是无条件拉的，而这时格子里已经有两块，整行被往上拽 64px，压进后面的格子。
- ✅ 规则：叠压是**版式意图**，只对「Banner 单独占格」成立 —— 选择器加 `:not(.is-stack)`（同格堆叠时不再拉）。别用「禁止拖到 Banner 上」去躲：那样是把版式问题变成操作限制，用户仍然可能从别处造出同样的数据。
- 📎 案例：`src/app/globals.css` 的 `.home-grid__area:has(.home-grid__cell--banner)`。

### P-168 「侧面栏目」必须钉在**这些列里最后一格**上，否则下面同列的模块会滚上来压在它身上
- ❌ 现象（2026-10-06 用户报）：分类 / 标签 / 最近发布（同一格、钉住跟随滚动）在划到页面底部时，和公告 / 站点（同样是侧栏那几列、但在**下面几行**）叠到一起。
- 🔍 根因：`.home-grid__area.is-sticky` 的老判据只有「同格堆叠 + 宽度 ≤ 6 列」，**完全不看列里还有谁**。钉住的格子停在视口里不动，而它下面占着同样那几列的格子会一路滚上来 —— 两者必然重叠（`position: sticky` 的包含块是网格容器，钉住的元素不会被"挡"在行带里）。实测复现：`scrollY=2400 / 2666` 时出现 `86×121`、`288×128` 的相交对。
- ✅ 规则：
  1. **按列判定能不能贴**：`lib/home/grid-model.ts` 的 `resolvePinnable()` —— 后面只要还有一格的列与它相交，这一格就只能「固定（随页面滚）」，并给出 `sideBlockedBy` 让编辑界面解释原因。
  2. **真正的侧面栏 = 把这些格子拖进同一格**（或点编辑界面里的「把下面这一列的模块并进来」，`mergeColumnBelow()`），让它成为这些列里的最后一格。这也是用户自己试出来的正确用法。
  3. 手机档一律不启用侧面（`.home-grid:not([data-vp]) .home-grid__area.is-sticky { position: static }` + `[data-vp="mobile"]` 同款）：屏幕太窄，钉住只会挤在一起。
  4. 栏位（`config.pin`：`auto` / `side` / `flow`）跟格点一起保存（`saveHomeLayout()` 写模块 `config`），不引数据库列也不要求用户点两次保存。
- ✅ 验证口径：`node scripts/home-layout-check.mjs --no-seed --section s10`（前台首页从头滚到底，逐屏比对模块矩形，多出来的重叠必须为 0）。
- 📎 案例：`src/lib/home/grid-model.ts`、`src/lib/home/drop.ts`、`src/components/admin/HomeLayoutEditor.tsx`、`src/app/admin/admin.css`。

### P-169 顶栏进度条把「React 自建表单的提交」当成导航，于是永远跑不到 100%（卡在 76%）
- ❌ 现象（2026-10-06 用户报）：点「发布瞬间」之后顶部那条 2px 蓝色进度条动了一下就**停在 70% 左右**，直到 8 秒兜底才消失。
- 🔍 根因：`NavigationProgress` 在 `document` 的**捕获阶段**监听 `submit`，判据只有「`form.method === "get"` + 不是新窗口」。而后台所有发布/保存表单都是 React 自建表单（`onSubmit` 里 `preventDefault()` + fetch），`<form>` 没写 `method` 时 `form.method` **也是 `"get"`** → 被当成导航。捕获阶段跑在 React 的 root 容器之前，`event.defaultPrevented` 还是 `false`，区分不出来；而这些提交只走 `router.refresh()`（pathname 不变），`finish()` 要等 pathname/searchParams 变化 → 等不到。真正的原生 GET 表单（列表筛选、搜索）确实要导航，不能一刀切删掉判定。
- ✅ 规则：`submit` 的监听挂**冒泡**阶段（React 的监听在 root 容器上，冒泡早于 `document`），并加 `if (event.defaultPrevented) return;` —— 到这一步被 React 接管的表单已经 `preventDefault` 过，原生导航表单还是 `false`。`click` 那条仍留在捕获阶段（`<Link>` 的点击也要先开进度条）。
- ✅ 验证口径：真浏览器里 `form.requestSubmit()` 一个 React 表单 → `.nav-progress` **不得**出现 `is-on`；再对一个原生 GET 表单派发 `submit` → 必须出现 `is-on`。
- 📎 案例：`src/components/layout/NavigationProgress.tsx`。

### P-170 COS SDK 的 `putObject` 对 Buffer body 几乎不报进度：要真进度得给它一条**自计数的流**
- ❌ 现象：上云那一步的进度条只会在「开始」和「结束」跳两下，中间一动不动 —— 用户看到的就是「卡在 55%」。
- 🔍 根因：SDK 的简单上传把进度挂在请求对象的 `drain` 事件上（`sdk/base.js`：`sender.on('drain', …)`，用 `socket.bytesWritten - 头部长度` 反推）。**实测（同一 SDK 版本 + 4 MB Buffer body）只回调 2 次：0 与整长**，慢消费者也一样。
- ✅ 规则：需要真实进度时，把 body 换成**自计数流**（`lib/storage/progress-stream.ts`）：流是按 socket 回压一段段被 SDK 读走的，同一实验里被读走 **64 次**（每次 64 KB），「已读字节」就是真实传输进度。两个必须知道的代价：
  1. **SDK 对「流」body 不做自动重试**（`base.js` 里 `!(params.body && params.body.pipe)` 才重试）→ 调用方自己重试，且**每次重试都要重建流**（流是一次性的）。
  2. 流 body 必须自带 `ContentLength`，否则会走到「服务端流式上传」的另一套语义。
  反过来：不需要进度的上传（备份包、缩略图、双写）继续用 Buffer，保留 SDK 自带的重试。
- ✅ 验证口径：本地起一个"慢消费者"HTTP 端点当靶子，用同一 SDK 版本跑 `putObject`，断言流被读走的次数 ≥3 且字节数单调递增（真桶不必参与）。
- 📎 案例：`src/lib/storage/progress-stream.ts`、`src/lib/storage/cos.ts` 的 `CosDriver.put()`。

### P-171 后台「点一下立刻保存」的三件事：令牌别多要一跳、别拿 props 当已存值、别等整页刷新
- ❌ 现象（2026-10-06 用户报）：瞬间的「全局可见期」点档位后**经常不保存**，要过一会儿才有反应。
- 🔍 根因（三条叠在一起）：
  1. 每次写请求前都先 `GET /api/auth/csrf` 取令牌 —— 一个动作两个往返；公网延迟下这一跳就是"点了没反应"。
  2. 面板拿 `props.initialDays`（服务端值）当"已保存值"比对，而那个值要等 `router.refresh()` 回来才变：**在那之前再点另一个档位，`next === savedDays` 会静默 `return`，这次点击根本没发请求**。
  3. 并发 PUT 的到达顺序不保证 → 连点两下可能被前一个请求覆盖；而"已生效"的显示也要等整页 RSC 刷新。
- ✅ 规则：
  1. CSRF 令牌**优先复用 cookie**（`myblog.csrf` 本来就是非 HttpOnly、服务端就是拿它跟请求头比对的，同一会话内一直有效），只在 cookie 缺失或明确 `refresh` 时（登录 / 创建）才去服务端取；遇到 `CSRF_INVALID` 自动换成新令牌**重试一次**（`lib/client/admin.ts`）。
  2. "已保存值"只认**服务端确认过的**状态（写成功后立刻更新本地 `confirmed`），不拿 props 当判据。
  3. 保存**串行 + 合并**：正在写时新点击只更新"待写值"，写完再写最后一个；成功即更新显示，`router.refresh()` 只用来刷新其它区域、不挡着显示。
- ✅ 验证口径：浏览器里点一下档位 → 断言的 PUT 在前 100ms 内发出、整个过程 **0 次** `/api/auth/csrf`、"当前生效"在 1.5s 内更新；连点两个档位 → 落库值是**最后一次**那个。
- 📎 案例：`src/lib/client/csrf.ts`、`src/lib/client/admin.ts`、`src/components/admin/MomentVisibilityPanel.tsx`。

### P-172 传完图还回源取一遍做预览：本机明明有文件，却让浏览器再下载一次原图
- ❌ 现象（2026-10-06 用户报）：瞬间页面选完图片，预览要等一会儿才出来 —— 那张图是从服务器重新拉回来的。
- 🔍 根因：上传走的是「先入库本地原图、发布时才上云」（P-056，`defer: true`），服务端返回的地址是站内中转 `/api/uploads/…`。预览直接用它 → 一张 3–5 MB 的原图再走一次网络，白花流量、也白占服务端带宽（慢网下要等几秒）。正文编辑器同理：插图后 `ImageEditor` 渲染的就是服务端地址。
- ✅ 规则：上传成功时把「服务端地址 → 本机 `URL.createObjectURL(file)`」登记进 `lib/client/local-preview.ts`，预览处 `resolveLocalPreview(url) ?? url` 取值：
  - 瞬间九宫格：`toGrid()` 里取，删除/发布/卸载时按登记键回收（谁创建谁回收，见 P-150）。
  - 正文图：走 `imagePlugin({ imagePreviewHandler })`（`ImageEditor` 渲染前会 await 它）。**handler 必须定义在模块作用域**：`imagePlugin` 每次渲染都会把新函数 pub 进 realm，而预览 effect 依赖它，每次新建函数会让每个图片节点重跑 effect。
  - **写进 markdown / 发出去的必须是服务端地址**（blob 只在显示层用），否则刷新即失效、读者也拿不到图。
- ✅ 验证口径：真浏览器里插图/选图后断言 `<img src>` 以 `blob:` 开头、且期间**没有**对 `/api/uploads/media/` 的请求；再存一次草稿，断言请求体里是服务端地址、不含 `blob:`。
- 📎 案例：`src/lib/client/local-preview.ts`、`src/components/admin/MomentCompose.tsx`、`src/components/admin/MdxEditorClient.tsx`、`src/components/admin/PostEditorForm.tsx`（封面）。

### P-173 相册详情「一叠照片」：折叠态高度只看当前那张、比例只看标签、方向别加"看照片"的特例 —— 三个都会让图片「看不见」
- ❌ 现象（2026-10-07 用户报）：①手机竖屏的相册详情**不是从上到下堆叠**；②**横过来的图点开没有展开动画**。
- 🔍 根因（三条，都会表现成"看不到动作"）：
  1. **折叠态高度只看当前那张**：堆叠会把后面几张整张往下推，按"当前那张"定高时，
     366 宽下自然高 549 的竖图排在 244 高的横图底下 → 容器 266，后一张下缘 571 被 `overflow: hidden` 切掉一多半
     （实测 `scroller 366×571` vs `容器 266`）；同理"点开后容器高差只有 15px"——**动画行程被切没了**，看着就是没动画。
  2. **比例只看 `img` 标签**：入库时 `width`/`height` 可能被横版兜底（853×1280 的竖图写成 `width=1280 height=853`），
     读标签算比例会把竖图当横图 → 横向展开时行高算错、图片被裁。
  3. **方向被加了"看照片"的特例**（2026-10-06 试的一版，用户当场驳回）：无论写成"有横图就走横向"还是
     "横图在竖屏也横着展开"，都等于把用户要的**竖屏版式**推翻 —— **竖屏就是竖屏，与照片方向无关**。
- ✅ 规则：
  - **方向只看视口**：竖屏 / ≤720px → 一律**竖向**（折叠态从上到下堆叠、展开一行一张往下）；
    横屏 / 宽屏 → 横向版式（同心叠放、向右展开成一行）。**与照片横竖、与它在不在卷里都无关**。
  - **堆叠高度按整叠最高那张定**，且各层的缩放是**统一**的（别逐层递减：缩放以中心为原点，逐层缩会把"每层露 22px"变成 17.2px）。
  - **比例只认图片自己**：`naturalWidth/naturalHeight` → 量到的盒子 → `width`/`height` 属性 → 3:2。
- ✅ 验证口径：`node scripts/pile-detail-check.mjs`（真浏览器、逐叠）：折叠态每层档位按**视觉盒**（走 `offsetTop` + 缩放补正）判、容器装得下最深那层；
  展开动画**按帧判**（位移 ≥120px、补间层 ≥2 才算"看得见"，实测竖屏 1782px / 横屏 1579px），不按终态判 —— "算对了但看不见"就是这类坑的通病。
  另：`getBoundingClientRect()` 已经含 transform，**不能**再乘一次 scale（会缩放算两遍）；Chrome 会把 `-0.00px` 序列化成 `0px`，
  判定别写死小数位；堆叠是**自然重叠**的，别断言"下层整张在上一层之下"。
- 📎 案例：`src/lib/albums/photo-pile.ts`（几何）、`src/components/album/PhotoPile.tsx`（量 + 写样式）、`scripts/pile-detail-check.mjs`（验收）。

### P-174 `jsonData()` 的 `{ data }` 信封被当成对象用：新建相册后跳到 `/admin/albums/undefined`
- ❌ 现象（2026-10-07 用户报）：后台新建相册成功，但**自动跳到一个不存在的页面**。
- 🔍 根因：`lib/admin/http.ts` 的 `jsonData()` 一律把返回值包一层 `{ data }`，而 `AlbumManager` 的新建分支写成了
  `const album = await adminJson<AdminAlbumView>(...)`（**没解信封**）→ `album.id === undefined` →
  `router.push("/admin/albums/undefined")`。同族页面（`NewModuleButton` / `StaticPagesManager` / `AlbumVolumePanel`）
  都是 `const { data } = await adminJson<{ data: { id: number } }>(...)`，只有这一处漏了。
- ✅ 规则：**后台 API 的返回值一律 `{ data }`**。客户端类型写成 `adminJson<{ data: T }>` 并解出 `data` 再用
  （`jsonPage()` 的 `{ data, total, page, pageSize }` 同理）。
- ✅ 验证口径：新增/编辑页的跳转断言**拿到的是数字 id**（`Number.isFinite(id)`），不是 `undefined`/`NaN`；
  或直接比对上一步 `POST` 响应体里确实有 `data.id`。
- 📎 案例：`src/components/admin/AlbumManager.tsx`（新建分支）、`src/lib/admin/http.ts`。

### P-175 在 `ResizeObserver` 回调里"先量后写尺寸"= 自激：整叠诡异地往下慢慢长 + 抽搐
- ❌ 现象（2026-10-07 用户报）：相册详情竖屏堆叠「诡异地往下慢慢延申并且在抽搐」——文档高与容器高每 100ms 长 1px，卡片高度在两态间来回翻。
- 🔍 根因：`PhotoPile` 的 `apply()` 既是 ResizeObserver 的回调，又在里面**写卡片高度**（给竖图限高）：
  ```
  write vh=624  fp=…244,366,366,244,244,366   ← 限高生效，量到 366
  write vh=459  fp=…244,549,549,244,244,549   ← 下一轮又量到未限高的 549，写回高度 → 再回调…
  ```
  9 秒内 **3750 次写 / 56 次跳过**，两态无限震荡。**"指纹不变就不写"能挡掉重复写，挡不掉"写 → 量 → 又不一样"的循环**。
- ✅ 规则：
  1. **尺寸别在观察器回调里改**。能用 CSS 表达的限高就用 CSS：卡片加 `aspect-ratio: 1`（`.pile[data-capped="true"]` + `img { height:100%; object-fit:cover }`），盒子随宽度出高度，几何拿到的直接是限高后的 `offsetHeight`，不需要二次写。
  2. 不得已要在回调里写时，写完的那一份状态必须**同时**作为下一轮测量的输入（否则"量的是 A、写的是 B"，永远收敛不了）。
  3. 组件的 `apply()` 仍保留"指纹不变就不写"的静默写（见 `PhotoPile` 的 `lastFingerprintRef`）：文案同步不碰几何，避免无意义的重算。
- ✅ 验证口径：**从 document start 起按帧采样**（`requestAnimationFrame` 记录 `document.scrollHeight`、各叠容器 `clientHeight`、各卡 `offsetHeight`）。
  判据是「动画结束后 N 秒内这些值**一次都不变**」——只看"稳定后的 3 秒"会漏掉加载期的震荡（这次就是这么漏的）。
- 📎 案例：`src/components/album/PhotoPile.tsx`（`useLayoutEffect` 设置 `aspect-ratio`）、`src/app/albums/albums.css`（`.pile[data-capped]`）、`src/lib/albums/photo-pile.ts`（`VERTICAL_HEIGHT_RATIO`）。

### P-176 Android 三页轮播：改完子页宽度**当轮**就 `scrollTo`，会被"轨道只有几像素"夹回 0 —— 预览黑屏
- ❌ 现象：点缩略图进预览，顶栏「1 / 3 / 完成(0)」都对，中间**全黑**（页面上只留一个小白点）。
- 🔍 根因：三页窗口初始宽度是 **1px**（布局期才知道页宽）。`onSizeChanged()` 里把三页改成屏宽、`track.requestLayout()`，然后马上 `scroller.scrollTo(pageWidth, 0)` —— 但 `onSizeChanged` 与 `onLayout` 在**同一次**布局里先后发生，这一轮轨道还只有 3px 宽，
  `scrollTo` 被 clamp 回 **0**（实测日志：`预览尺寸：1080 x 2091` / `预览归位：pageWidth=1080 轨道=3 实际 scrollX=0`）→ 停在左边那张**空页**上。
  下一轮布局把页宽改成 1080 时，"待归位"标记已经被消费掉了，再也没人把滚动位置挪回中间。
- ✅ 规则：**量够了才归位**。`onLayout` 里判 `track.width`（本次实现是 `< pageWidth * 2` 就 `track.requestLayout()` 再来一轮，并留一个尝试次数上限兜底），确认三页真的量成页宽后再 `scrollTo(pageWidth, 0)`。同类"子 View 尺寸要等下一轮布局才生效"的活都适用：**改布局参数与读几何不要放在同一次遍历里**。
- ✅ 验证口径：`adb logcat -s SmartBlog:I` 必须出现 `轨道=3240 实际 scrollX=1080`（轨道 = 3 × 页宽）；截图上能看到照片，而不是黑屏。
- 📎 案例：`androidapp/app/src/main/java/com/smartblog/app/PhotoPreviewView.kt`（`onSizeChanged` / `onLayout`）。

### P-177 Kotlin 块注释**可嵌套**：注释里写 `*.jpg` 会让整文件报 `Unclosed comment` + 一串假"未解析引用"
- ❌ 现象：一个新文件编译报 `Syntax error: Unclosed comment`（指向文件尾），同时其它文件里对它的引用**全部**变成 `Unresolved reference`（十几条，看着像"类找不到"）。
- 🔍 根因：KDoc 里写了路径通配 `cacheDir/edited/*.jpg` —— 那个 `/*` 在 Kotlin 里会**开一个嵌套块注释**（Kotlin 与 C/Java 不同，块注释可以嵌套），于是注释再也合不上；文件没解析出来 → 里面所有声明都不存在 → 引用方集体报错。
- ✅ 规则：注释里要写通配路径就绕开 `/*`（写 `edited/ 下的 jpg`，或 `x.jpg`），别让字符序列意外成对；遇到"一个文件语法错、别处一堆未解析"时**先修那个文件**，别去改引用方。
- 📎 案例：`androidapp/app/src/main/java/com/smartblog/app/PhotoEditStore.kt`。

### P-178 自定义字段叫 `background` / `foreground` 会与 `View.getBackground()/getForeground()` 撞名
- ❌ 现象：`setTextColor(foreground)` / `setBackgroundColor(background)` 报「没有匹配的重载」——`foreground` 被当成 `Drawable`，而期望是 `Int`。
- 🔍 根因：`View` 有 `getBackground(): Drawable?` / `getForeground(): Drawable?`，Kotlin 合成属性 `background` / `foreground` 与你声明的同名字段冲突；在子类里引用同名字段时解析到的是 **Drawable**，不是那个颜色 Int。
- ✅ 规则：宿主配色字段别用这两个名字（本次改成 `bgColor` / `fgColor`）。同理别用 `tag`、`alpha`、`visibility` 这类 View 属性名装自己的数据。
- 📎 案例：`PhotoEditorView.kt` / `PhotoPreviewView.kt`。

### P-179 浮点误差会让 `coerceIn(min, max)` 拿到**空区间**并抛异常
- ❌ 现象：`java.lang.IllegalArgumentException: Cannot coerce value to an empty range: maximum 0.19999999 is less than minimum 0.2` —— 由单测当场抓到（矩形按比例取最大内接框时 `right - width` 比 `left` 小了一点点）。
- 🔍 根因：`coerceIn(a, b)` 要求 `a <= b`；几何计算里算出来的上界可能因浮点误差比下界小 1e-7。
- ✅ 规则：几何裁切一律写成 `coerceIn(low, max(low, high))`（先把上界抬到不小于下界），别假设算出来的区间一定非空。裁剪框、等比缩放这类"夹回边界"的活都适用。
- 📎 案例：`PhotoEditState.withAspect()`（纯逻辑，有单测）、`PhotoEditorView.fitAspectInRect()`。

### P-180 「落笔即画」的画笔必须**同时**记进时间线：少一行 → 撤销回不去、"完成"还判定成"没编辑"
- ❌ 现象：编辑器里明明画了一笔（画面上看得到），点「完成」退回预览**没有「已编辑」标记**，`cache/edited/` 里也没有文件，上传的还是原图；「撤销」也按不动。
- 🔍 根因：涂鸦为了零延迟是"落笔直接画进当前位图"（`PhotoEditRenderer.drawDoodleStroke()`），但**忘了把这一笔 `state.add(EditOp.Doodle(...))`** —— 画面上有、时间线里没有。于是 `isDirty()` 为 false（`finishEditing()` 走了"没编辑"分支）、撤销无从回退，任何一次整张重渲染（旋转 / 裁剪 / 撤销）也会把它抹掉。旁边的马赛克分支写了 `add()`，两处代码长得几乎一样 —— 少一行，肉眼看代码很容易漏过去。
- ✅ 规则：凡是"直接改位图 + 还想被撤销 / 重放"的操作，**画与记必须成对**（画完立刻 `add`）。验收也必须走"画一笔 → 完成 → 检查产物文件"，只截图看画面**不算数**（这次就是截图全对、产物是空的）。
- ✅ 验证口径：`adb shell run-as com.smartblog.app ls -l cache/edited` 必须出现 `edited-<时间戳>.jpg`；测试页显示的文件名 / 字节数必须是编辑版（实测 `edited-1791640992256.jpg · 5888 B`，而不是原图 `pic2.jpg · 4115 B`）。
- 📎 案例：`androidapp/app/src/main/java/com/smartblog/app/PhotoEditorView.kt` 的 `onPaintTouch()` ACTION_UP 分支。

### P-181 ffmpeg-kit 已退役：坐标、ABI 与 Java API 形状全都不在原版文档里，**必须 javap 实读 AAR**
- ❌ 事实：`com.arthenica:ffmpeg-kit-*`（含 `-min` / `-full` / `-gpl`）2025-04 退役并**从仓库下架**，照老文章写的坐标一定解析失败（`Could not find com.arthenica:ffmpeg-kit-full:6.0-2`）。原版文档里那套「LTS 版本」也不再维护，且**不支持 16 KB 页对齐**（新设备/新商店要求）。
- ✅ 规则：
  1. 用社区维护的 drop-in 包 **`dev.ffmpegkit-maintained:ffmpeg-kit-<variant>:8.1.x`**（Maven Central，SDK 35、16KB 对齐、同 `com.arthenica.ffmpegkit` 包名/API）。**只发布 `arm64-v8a` 与 `x86_64`**：`-PgvAbi=armeabi-v7a` 的构建要在 Gradle 里**条件跳过**该依赖（置 `BuildConfig.FFMPEG_ENABLED=false`、功能降级），否则构建直接失败。
  2. **编码器按包名分档**：要 libx264 就得选 `*-gpl`（GPL-3.0 ⇒ **整个 App 按 GPL-3.0 分发**）；LGPL 档（`min` / `full`）没有 x264，只能用系统 MediaCodec 硬件编码。选之前先想清楚许可证，别等发版才发现。
  3. **API 形状以 `javap classes.jar` 为准**（本次实测：`executeWithArgumentsAsync` 只吃 `String[]` 与 `FFmpegSessionCompleteCallback`/`LogCallback`/`StatisticsCallback`；**没有** `cancel(FFmpegSession)`，只有 `cancel()` / `cancel(long sessionId)`；`Statistics.getTime()` 是 `double` 毫秒）。Kotlin 里按记忆写 `executeWithArgumentsAsync(List<String>, …)` / `cancel(session)` 都会编译不过。
  4. 参数用**参数数组**形式传（`String[]`），不要拼 shell 字符串；`-vf` 的表达式能避开就避开（filtergraph 里逗号要转义，少一层引号就静默变成两个滤镜）——缩放直接按 MediaStore 给的宽高算成 `scale=1920:-2` / `scale=-2:1920`，源比目标小就整个不写 `-vf`。
- 🔎 取证方式：`ffmpeg-kit-*.aar` 解开后对 `classes.jar` 跑 `javap -classpath`；`.so` 里搜 `libx264` 字符串确认编码器真的在包里。
- 📎 案例：2026-10 瞬间视频压缩（见 [moment-video-spec.md](moment-video-spec.md)）：`CompressPolicy.kt` + `VideoCompressor.kt`，AAR 实测 `jni/{arm64-v8a,x86_64}`、`libavcodec.so` 内含 `libx264`。

### P-182 zod 对象一旦挂了 `refine` / `superRefine`，`.partial()` 就调不动：跨字段规则要抽成纯函数、基础对象单独留
- ❌ 错误：瞬间原来只有 `momentWriteSchema`，PATCH 直接 `momentWriteSchema.partial()`。这次加了「文字或媒体至少一个」「视频 ≤ 1 个」两条**跨字段**规则，很自然地写成 `momentWriteSchema = base.superRefine(...)` —— 于是 `momentPatchSchema = momentWriteSchema.partial()` 立刻不成立（`ZodEffects` 上没有 `partial()`），编译期报错。
- ✅ 规则：
  1. **基础形状（字段级）与跨字段规则分层**：`momentBaseSchema`（纯 `z.object`，供 `.partial()`）+ `momentWriteSchema = base.superRefine(...)`（POST 用）+ `momentPatchSchema = base.partial()`。
  2. **partial 场景的跨字段判断放到写库前**：PATCH 拿不到"另一边的现状"，由 `updateAdminMoment()` 把「入参 + 现有行」合并后调用**同一个纯函数**（`lib/moments/compose-rules.ts` 的 `momentContentError()`）。规则只写一处，POST / PATCH / 前端按钮禁用三边共用同一句话。
  3. 文案与规则放在**不依赖 zod / prisma 的纯模块**里，client 组件才能引它而不用把整条校验链拖进浏览器包。
- 📎 案例：2026-10 瞬间视频（`lib/validation/post.ts` + `lib/moments/compose-rules.ts` + `lib/moments/admin.ts`）。

### P-183 「点压缩就闪退」不是 ffmpeg 编不动，是**依赖缺了一个类**：维护版 AAR 的 POM 里没有 `<dependencies>` 段
- ❌ 现象：App 里选中视频、点「完成」，**进程直接消失**（用户口径「闪退」），界面上没有任何异常提示；`pidof com.smartblog.app` 为空、产物 0 字节。看起来非常像"HEVC 太大把内存搞爆了"，很容易往线程/内存/分辨率方向排查（我先走了这条弯路：加 `-threads 2`、加空间闸门，都没治好）。
- 🔍 真因（`adb logcat -d -b crash` 一看就明白）：
  ```
  FATAL EXCEPTION: Thread-9
  java.lang.NoClassDefFoundError: Failed resolution of: Lcom/arthenica/smartexception/java/Exceptions;
      at com.arthenica.ffmpegkit.FFmpegKitConfig.<clinit>(FFmpegKitConfig.java:134)
      at com.arthenica.ffmpegkit.FFmpegKit.executeWithArgumentsAsync(FFmpegKit.java:102)
      at com.smartblog.app.VideoCompressor.runPass(VideoCompressor.kt:147)
  ```
  用的是社区维护的 drop-in AAR `dev.ffmpegkit-maintained:ffmpeg-kit-min-gpl:8.1.7`：它的 `classes.jar` 里只有 41 个 `com/arthenica/ffmpegkit/*` 类，**没有 `com/arthenica/smartexception/*`**，而它的 **POM 里根本没有 `<dependencies>` 段** —— 原厂 POM 那条 `com.arthenica:smart-exception-java` 没被声明，Gradle 自然也拉不到。于是 `FFmpegKitConfig` 静态初始化缺类 → 抛 `Error`（不是 `Exception`）→ 调它的工作线程没人接 → **进程死**。
- ✅ 修法（两件都要做）：
  1. **显式补依赖**：`implementation("com.arthenica:smart-exception-java:0.2.1")`（类的实现仍在 Maven Central，未随 Arthenica 一起下架；它又会带 `smart-exception-common`）。放进 `build.gradle.kts` 里 ffmpeg 那个 `if (ffmpegEnabled)` 块内。
  2. **调用点接 `Throwable`**：`FFmpegKit.executeWithArgumentsAsync(...)` 外面包 `try { } catch (error: Throwable)`。`NoClassDefFoundError` / `ExceptionInInitializerError` / `UnsatisfiedLinkError` 都是 `Error`，**只接 Exception 等于没接**（`runCatching` 接 Throwable，但当时那句是裸调用）。接住之后最差是"这一遍没压成 → 交原文件"，绝不让 App 被带走。
- ✅ 判据（下次遇到同类"闪退"直接照此定位）：`adb logcat -d -b crash` 找 `FATAL EXCEPTION` + `Caused by: ClassNotFoundException`；**crash buffer 空**才去怀疑内存/native。"`pidof` 为空 + 无产物"是进程级死亡，不是"编得慢"。
- 📎 案例：2026-10-11 瞬间视频压缩。修复后同一条 34 秒 H.265 mkv：`开始压缩：2293457 字节` → **12 秒**后 `文件选择完成：1 个`，产物 `compress-*.mp4` 2029529 字节、`video/mp4`（页面确认收到），进程存活。

### P-184 `adb push` 进相册的文件在 MediaStore 里是 **pending 行**：应用看不见，`_size`/`_duration` 还是 NULL
- ❌ 现象：两个 mkvs `adb push /sdcard/Movies/` 之后 `ls` 看得见、`content query` 也查得到，但 App 的自有相册里**只显示 3 张旧图**、视频一个没有；而且视频行的 `_size`/`_duration` 全是 `NULL`（读出来是 0）。更隐蔽的后果：压缩判据拿到体积 0 → 判"不用压" → 大文件原样交给页面，站点只收 mp4/webm，上传必然失败（"选择时看着一切正常"的静默失败）。
- 🔍 真因：`adb push` 只在文件系统里放了文件，MediaProvider 给它建的是**待提交（`is_pending=1`）**的行；**pending 行只有属主/shell 看得见**，普通应用查不到。实测：44 张图里 41 张、3 个视频全部 `is_pending=1`；App 侧日志 `相册载入：图片=3 视频=0 合计=3` 与此完全吻合。
- ✅ 修法：让 MediaProvider 做一次真正的卷扫描把行提交掉：
  ```powershell
  adb shell content call --uri content://media/external/file --method scan_volume --arg external_primary
  ```
  跑完同一个查询就变成 `is_pending=0`、`_size`/`_duration` 也齐了（实测 3 个视频：2687561 / 2293457 / 237000852 字节，27.5s / 34.1s / 2521.2s）→ App 侧立刻变成 `图片=44 视频=3`。
  ⚠️ 试过但**不管用**的两条路：`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///…`（`result=0`，没人接）、`content call … --method scan_file --arg <path>`（返回 `Bundle[{…STREAM=null}]`，行建了但不提交）。别在这两条上耗时间。
- ✅ 顺带的产品结论（已落进代码）：**别信 MediaStore 一定有值**。`MediaProbe.fillMissing()` 只在缺字段时才补（`AssetFileDescriptor.length` 补体积、`MediaMetadataRetriever` 补时长/宽高/码率），字段齐了就**一次 native 都不调** —— 大 H.265 文件上 `MediaMetadataRetriever` 本身就是最重的一步。
- 📎 案例：2026-10-11 把 `D:\Screenrec\*.mkv` 导入模拟器相册；同一条知识写进了 [android/architecture.md](android/architecture.md) §6b-3。

### P-185 从 adb 改 SharedPreferences 会被**别的进程用内存里的旧快照覆盖**（多进程 SharedPreferences）
- ❌ 现象：为了让 App 指向 dev server，我 `force-stop` 后用 `run-as … sed -i` 改 `shared_prefs/smartblog.xml` 的 `site_url`，`cat` 回读**是对的**；但下次冷启动日志里却是 `进入站点：https://bruccese.com` —— 改动"自己变回去了"。
- 🔍 真因：App 有多个进程（GeckoView 的 `:tab*` 子进程 + 通知层）。SharedPreferences 写入是"整文件序列化"，某个进程（这里是 `AppNotifier` 写 `push_last_result`）手里还握着**改之前的整份内存快照**，它一写就把编辑覆盖掉。不是权限问题，`cat` 回读也发现不了。
- ✅ 规则：
  1. 验证期要改站点地址，**别 sed 偏好文件**：要么走 App 内 UI（右下角 ⋮ →「修改网站地址」），要么用**构建期默认值** —— `gradlew :app:assembleDebug "-PstartUrl=http://10.0.2.2:3000"` 配 `adb shell pm clear com.smartblog.app`（清数据后 `site_url` 为空，首启就用 `BuildConfig.START_URL`）。这条最确定。
  2. `pm clear` 会**收回运行时权限**，记得补：`adb shell pm grant com.smartblog.app android.permission.READ_EXTERNAL_STORAGE`（≤32 走这枚；33+ 是 `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO`）。
  3. 推广：**跨进程共享的配置文件不要用外部工具直接改**；要么走 App 自己的写入口，要么在 App 完全没在跑时改（做不到就按第 1 条）。
- 📎 案例：2026-10-11 模拟器验证 dev 环境连接。

### P-186 自绘「胶囊」按钮的选中态若是**构建期写死**的，点了另一项就必须重建那一栏——三行并排、只漏了一行
- ❌ 现象（用户报的）：图片编辑器里点「模糊」，**高亮还停在「马赛克」** —— 实际画出来的是模糊（状态变了），但看上去像没选中，用起来像"点了没反应"。
- 🔍 根因：`PhotoEditorView.chipRow()` 把选中态**在构建期**写进控件（文字色 + 背景 + 底色），创建之后不会自己更新。同一个文件里三处用法：
  - 涂鸦颜色行 → 点击后调了 `rebuildSecondaryBar()` ✅
  - 裁剪比例行 → 点击走 `surface.setCropAspect()`，而它内部调了 `rebuildSecondaryBar()` ✅
  - **马赛克种类行 → 只改了 `mosaicKind`，没有重建** ❌（漏的那一处）
  于是只有马赛克这一行的两种类型之间切换时高亮不动。这类 bug 的特点：**代码看着都对**（状态确实改了、绘制确实换了），只有"看屏幕"才发现。
- ✅ 修法：改选中态的那次点击里补一次 `rebuildSecondaryBar()`；并且在 `chipRow()` 上写明契约——「任何会改变"哪一项选中"的 `onClick` 都必须自己重建二级栏；纯触发型按钮（旋转 / 取消裁剪 / 确定裁剪）不受此约束」。**重建不丢状态**：滑杆初值取自 `currentBrushWidth()`（读的还是 `mosaicWidth` 本身），实测笔宽位置不变。
- ✅ 判据与验收：**点完立刻看高亮**（截图对比两张状态），别只验"功能生效"。本次验收就是两张截图：选中「马赛克」时蓝底在马赛克上、点「模糊」后蓝底移到模糊上、笔宽滑杆不动。
- 📎 案例：2026-10-11 `androidapp/app/src/main/java/com/smartblog/app/PhotoEditorView.kt`（`Tool.MOSAIC` 分支 + `chipRow()` 的契约注释）。

### P-187 GeckoView 的 `FilePrompt.capture` 是 **`int` 字段**、不是 `String`：靠"印象里的 API"写代码，编译期就炸
- ❌ 现象：给宿主加「录音请求」判定时，按印象写成 `isVoiceRecordRequest(prompt.mimeTypes, prompt.capture)`，形参类型 `String?` —— `:app:compileDebugKotlin` 直接报 `Argument type mismatch: actual type is 'Int', but 'String?' was expected`。同一个项目的 `javap` 教训（P-156 / P-181）又踩了一次。
- 🔍 真因：GeckoView 157 的 `GeckoSession.PromptDelegate.FilePrompt` 只有三个 public 字段：`type: int`、`mimeTypes: String[]`、**`capture: int`**；AAR 里**没有任何 `CAPTURE_*` 常量**，所以只能判"非 0 = HTML 里带了这个属性"。它也不是 getter（`getCapture()` 不存在）。
- ✅ 规则：
  1. 用宿主 API 之前**先 `javap` 实读 AAR**：`javap -cp <解出来的 classes.jar> 'org.mozilla.geckoview.GeckoSession$PromptDelegate$FilePrompt'`（AAR 是 zip，`Expand-Archive` 后里面有 `classes.jar`）。字段类型、常量、是字段还是方法，一次就能看清。
  2. 认不出的语义（这里 capture 的枚举值）**别自己编**：退化成"非 0 即存在"这种保守判据，并把不确定性写进注释。
- 📎 案例：2026-10-11 `androidapp/.../MediaKinds.kt` 的 `isVoiceRecordRequest(types, capture: Int)`；判定逻辑与站点常量 `VOICE_RECORD_MIME` 成对。

### P-188 **音频-only 的 WebM / MP4 会被 `file-type` 判成 `video/*`**：上传录音必然 400，而且报的是"类型不匹配"
- ❌ 现象：浏览器 `MediaRecorder` 录出来的是 `audio/webm;codecs=opus`（音频-only），Android 录的是 MPEG_4/AAC —— 两个都被 `handleUpload()` 拒掉 `MEDIA_KIND_MISMATCH`（"上传类型与文件内容不匹配"）。功能死在最后一步，前端只看到一句莫名其妙的错。
- 🔍 真因（读 `file-type@22.0.2` 源码确认）：
  - MP4 只按 `ftyp` **主品牌**判：`M4A ` → `audio/x-m4a`，其余（Android `MediaRecorder`/`MediaMuxer` 写 `isom`/`mp42`）→ **`video/mp4`**；
  - WebM 只看 EBML DocType `webm`：**音频-only 的 WebM 照样是 `video/webm`**。
  也就是说"容器扩展名/MIME 声明"根本救不了它 —— 只有看容器里的**轨道结构**才知道有没有视频。
- ✅ 修法：`lib/upload/audio-container.ts` 两个**有界**解析器 —— MP4 走 box（`moov > trak > mdia > hdlr` 的 `soun`/`vide`），WebM 走 EBML（`Segment > Tracks > TrackEntry > TrackType`：1 = 视频、2 = 音频）。**只在调用方明确声明 `kind=audio` 时启用**，解析失败/截断/畸形一律返回 null 走原拒绝路径（失败关闭，不给"把视频伪装成音频"开后门）。
- ✅ 判据：单测用合成夹具覆盖「纯音频 / 含视频轨 / 截断畸形」三类；**再加一条真文件证据**——Edge headless 假麦克风真录一段 WebM 走 `POST /api/upload`（`node scripts/voice-e2e-check.mjs` 第 3 步），跑通才算修复。
- 📎 案例：2026-10-11 语音瞬间；同一条也解释了为什么 Safari 的 `audio/mp4` 录音此前从没被验过（媒体库当年只收过磁盘上的 `.m4a` 文件，主品牌就是 `M4A `）。

### P-189 「按钮点不动」先查有没有挂监听：**画出来的按钮不会自己找活干**
- ❌ 现象（用户报的）：App 里语音小窗的「取消」「停止」点了没反应。第一轮我按"0 宽"去修（见下），真机复测**还是点不动**。
- 🔍 真因（两个叠在一起，只修一个都不行）：
  1. **`VoiceRecorderView.kt` 里 5 个按钮一个都没 `setOnClickListener`** —— 全文件搜 `click` 零命中。按钮是纯装饰，布局再对也不会响应。
  2. 顺带发现的布局坑：按钮用 `LinearLayout.LayoutParams(0, h, 1f)`（weight + 0 宽），但装它的行用 `card.addView(row)` 加进去 —— **不给 LayoutParams 时默认 `WRAP_CONTENT`**，父容器按 WRAP_CONTENT 量的时候加权子项只能分到 **0 宽**：按钮既看不见、也命中不到。修法是给行 `MATCH_PARENT`（`header` 那行同理，否则时间戳贴着标题而不是靠右）。
- ✅ 规则：
  1. 新增按钮必须在集中的 `wireActions()` 里接线（别散在各处），或者让构造 helper **强制传回调**；只画不接 = 摆件。
  2. 「看得见」不等于「点得动」。验收必须**逐条点一遍**：`adb shell input tap` 之后看状态真的变了（我也用 `uiautomator dump` 看 bounds/clickable，但波形一直重绘时它拿不到 idle，别把它当唯一证据）。
  3. 用 `width=0 + weight=1` 的按钮/输入框，父容器一律 `MATCH_PARENT`；`WRAP_CONTENT` 父容器 + 加权子项 = 0 尺寸。
- 📎 案例：2026-10-11 `androidapp/.../VoiceRecorderView.kt`（接线在 `wireActions()`，行宽在 `noteActions()`）。

### P-190 用户口径的"方向/手感"要在对话里当场钉成**常量 + 单测**，别靠描述词猜
- ❌ 现象：语音波形的滚动方向，用户说了三次（"一行只显示十秒钟""整个波形向右滑动""也就是从右边开始长"），我前两版都实现反了（先是"越录越细"，再是"最新在左、往左滑"），每次都要重新编译 + 装机才知道错。
- 🔍 真因：中文里"向右滑动"既能指"内容整体往右移"，也能指"新的一根从右边进来"——**这两种在固定窗口里是相反的**（最新贴右边 ⇒ 满了之后整条往左滑；最新贴左边 ⇒ 满了之后整条往右滑）。光靠读描述没法消歧，而"看一眼就知道"的验证成本被拖到编译+装机之后。
- ✅ 规则：
  1. 把口径写成**可测的算式**：最终口径是 `liveSlot(数组下标) = 数组下标`（窗口只保留最近 100 根，越靠数组头越旧），配 JVM/TS 单测断言"3 秒时占用槽位 0…29（从左往右长）""满窗后数组头被丢掉、同一槽位显示后一根（= 整条向左滚）"。方向错了单测当场红。
  2. 两个平台同一套算式，注释里写清楚"**从左边开始长、满了从左边掉出去**"，并互相指认（`VoiceRecorderPolicy.liveSlot()` ↔ `liveSampleIndexFor()`）。
  3. 拿不准就问一句，但**问之前先把两种可能各自的样子写出来**（谁贴哪边、谁从哪边出去），别问"你要哪种滚动"。
- 📎 案例：2026-10-11 语音瞬间的实时波形。**2026-10-17 用户明确纠正为"从左边开始向右长、到右边后整条向左滚"**；旧版"最新贴右"已废弃，两端单测同步改成 0…29 与丢头断言。

### P-191 `Permissions-Policy` 是顶层文档策略：漏页面、以及软导航继承旧策略，都会让麦克风"没权限且不弹窗"
- ❌ 现象：网页端点录音，卡片直接显示"没拿到麦克风权限"，浏览器连权限弹窗都不弹；控制台 `Permissions policy violation: microphone is not allowed in this document`。用户去地址栏也找不到已拒绝记录。
- 🔍 真因（两层）：①浏览器在 `getUserMedia()` 之前就按**响应头**拒绝，最初只在 `/admin/moments` 放 `microphone=(self)`，但 `/admin` 概览页也渲染同一个 `MomentCompose`；②`Permissions-Policy` 属于**顶层文档**，Next `<Link>` 软导航不换文档。从公共页（`microphone=()`）点进后台、或在后台从 `/admin/posts` 软导航到 `/admin/moments`，都会继续沿用进入时那份旧策略，后一个页面的响应头根本没生效。
- ✅ 规则：整个 `/admin` 路径树放行 `microphone=(self)`，公共页面保持 `()`；前台进入后台的 Footer / Navbar 外观入口必须用 `<a>` 做**文档级跳转**。判定收口在 `lib/security/permissions-policy.ts` + 单测。验证不要只看 UI：先看响应头（`/admin/posts` 也必须是 `microphone=(self)`、`/moments` 必须关闭），再跑 dev server 点一次录音。
- 📎 案例：2026-10-17 首修只按“渲染入口的页面”列白名单；2026-10-17c 按文档策略与软导航重新收口。

### P-192 扩展名校验别逐字匹配：图床会把 WebP/AVIF 命名成 `.jpg`
- ❌ 现象：从微博等图床下载的图片，扩展名 `.jpg`、大小正常，上传却报“格式不支持/扩展名不匹配”；文件名还很长（例如 `img-179219…f56b.jpg`），更像“文件名问题”。
- 🔍 真因：服务端要求 `file-type` 嗅探到的扩展名与文件名后缀**逐字一致**。图床把 WebP/AVIF 内容命名为 `.jpg` 时必然 400；长文件名不是根因（只影响临时副本落盘）。
- ✅ 修法：真实类型以魔数/容器为准；文件名后缀只要求**同属图片/视频/音频**（`lib/upload/file-name.ts` 的 `suppliedExtensionMatchesKind()`），跨媒体类型仍拒绝。客户端与 Android 临时副本同时把超长名压到 80 字符。验收必须用“WebP 字节 + `.jpg` 长文件名”真上传，断言 200 且入库 `image/webp`。
- 📎 案例：2026-10-17；临时库实测 90+ 字符文件名返回 200。

### P-193 视频首帧不能只写 `preload="metadata"`：浏览器可能只给时长不给画面
- ❌ 现象：首页瞬间视频瓦片是纯黑块，用户以为没有封面。
- 🔍 真因：`preload="metadata"` 只保证元信息；不 seek / 不播放时浏览器不保证解码并绘制首帧。直接给深色背景 + ▶ 就是“永远黑”。
- ✅ 修法：`<video preload="metadata" src="….#t=0.1">`，在 `loadedmetadata` 时 seek 到 0.1s，`loadeddata/seeked` 后再淡入；加载前用渐变占位。播放器另做，关闭原生 `controls`，自绘播放/暂停、进度、音量；移动端可点目标至少 44×44。验收要读 `readyState / videoWidth / currentTime` 并截图，不能只看 DOM 里有没有 `<video>`。
- 📎 案例：2026-10-17 `MomentVideoPlayer`；390×844 实测面板 374×411、全部按钮/滑杆高度 44。

### P-194 封面与 Banner 不能共用一套 style：改 Banner 的纯色/混色会把列表封面一起改掉
- ❌ 现象：文章编辑里给 Banner 切「纯色/混色」，列表卡封面也变成了色块；用户无法只改 Banner，删除封面也会牵扯 Banner。
- 🔍 真因：`Post.bannerStyle/bannerColor` 同时被 `PostCard` 和 `PostHero` 读取——一个字段承担了两个独立展示面的配置。
- ✅ 修法：拆成两套唯一判定：`coverStyle` + `coverColor/Color2`（列表卡）与 `bannerStyle` + `bannerImage` + `bannerColor/Color2`（详情顶图）；`PostCard` 只看 `resolveCoverVisual()`，`PostHero` 只看 `resolveBannerVisual()`。Banner 的 `cover` 模式只是“复用封面”，不是“覆盖封面”。Banner 删除后写随机渐变色，绝不留白。
- 📎 案例：2026-10-17；迁移 `20261017120000_post_cover_banner_split` 把历史 `bannerStyle` 的展示复制成封面配置，旧文章外观不变。

### P-195 后台「真预览」里的链接必须失活，否则拖拽/点选会把管理员带走
- ❌ 现象：首页管理画布渲染真实文章卡后，点卡片会跳去前台文章页，正在编辑的布局丢失。
- 🔍 真因：预览节点里的 `<a>` 仍是浏览器默认行为；画布只处理了拖拽手柄，没拦链接。
- ✅ 修法：在画框层统一 `onClickCapture/onAuxClickCapture` 拦截 `<a>` 的默认跳转（同时 stopPropagation），拖拽手柄的 pointerdown 不受影响。不要给整个预览容器 `pointer-events:none`，那会把拖拽手柄一起关掉。
- 📎 案例：2026-10-17 `HomeLayoutEditor` 画框。

### P-196 手机底部设置 sheet：父高必须是确定的，`height:auto` 和 `height:0` 都会翻车
- ❌ 现象：文章编辑手机视图切换封面/Banner 后，设置页像“白色消失”，或者整页下翻到空白区。
- 🔍 真因：sheet 是 `max-height + flex` 结构。rail-body 用 `height:auto` 时，内容长短会把滚动位置甩到内容区外；只把 rail-body 改成 `height:0; flex:1` 而外层 rail 仍只有 `max-height`（父高 auto），flex 子项直接算成 0，设置内容整块消失。另：编辑器页的 `html/body` 在手机档是 `overflow:auto`，文件选择器把焦点还给 input 时会把外层 body 滚到 sheet 下方空白。
- ✅ 修法：① 移动端 sheet 的 rail 写**确定高度** `height: min(86dvh, calc(100dvh - 56px))`（同时保留 max-height）；② rail-body 用 `height:0; min-height:0; flex:1 1 auto; overflow:auto; overscroll-behavior:contain`；③ `html:has(.post-workspace), html:has(.post-workspace) body` 锁 `height:100%; overflow:hidden; overflow:clip; overscroll-behavior:none`（`hidden` 只挡用户滚动，`clip` 连 `scrollIntoView`/代码滚动一起挡；旧浏览器退回 hidden），sheet 打开时再用内联 overflow 锁一次；④ 文件选择器/输入框的焦点只允许滚 rail-body，不能滚外层页面。
- 📎 案例：2026-10-17 `admin.css` 的 `.post-workspace.is-sheet .post-workspace__rail` / `__rail-body`，以及 `PostEditorForm` 的 sheet 滚动锁。**2026-10-17e 补充**：sheet 高度与 rail-body 修好后，选择封面仍可能复发；那是外层 rail 被文件 input 的程序化滚动顶走，见 P-198，不要只反复改 sheet 高度。

### P-197 Prisma 报 `The column ... does not exist`：先查迁移是否执行，不要改查询去绕
- ❌ 现象：`pnpm dev` 打开首页/文章管理，Prisma 在 `post.findMany()` 处抛 `PrismaClientKnownRequestError`，例如 `The column main.Post.coverStyle does not exist in the current database`。
- 🔍 真因：代码与 `schema.prisma` 已包含新列，但当前 `DATABASE_URL` 指向的 SQLite 库还没执行对应迁移。报错来自数据库，不是 TypeScript、缓存或 Prisma Client 版本；删 `.next`、重新 `prisma generate` 都不会补列。
- ✅ 规则：先跑只读的 `pnpm prisma migrate status`，按缺失的迁移名执行 `pnpm prisma migrate deploy`，然后重启 dev server。迁移执行属于用户亲自完成的高成本操作；AI 只能用临时库验证，不能擅自改用户的 `main/data/blog.db`。不要用 `select` 动态跳过新字段来“修好”（写路径仍会炸，且会掩盖部署阻断）。
- 📎 案例：2026-10-17c 开发库缺 `20261017120000_post_cover_banner_split` 的 `coverStyle/coverColor/coverColor2/bannerImage`。

### P-198 `overflow:hidden/clip` 都挡不住 focus/scrollIntoView 的程序化滚动：固定 sheet 或 window 会被顶走
- ❌ 现象：手机文章编辑器里点封面/Banner 的“选择图片”，原生文件选择器关闭后整个设置 sheet 往下/往上错位，露出白色空白，用户手动滚也回不到原位；桌面端则表现为整个 window 向下滚 49px。
- 🔍 真因（两层）：①`.post-workspace__rail` 是固定高度 sheet，原来是 `overflow:hidden`。`hidden` 只挡用户滚动，不挡浏览器的程序化滚动：文件 input 被 focus / `scrollIntoView` 时，浏览器会同时滚 `rail-body` 和**外层 rail**。实测选封面后 `rail-body.scrollTop=915`（正常）但 `rail.scrollTop=37`；rail 自身 `overflow:hidden`，用户无法把这个 37px 手动滚回去。②桌面端即使 `html/body` 计算样式已是 `overflow:clip`，Chrome 仍可能让 `scrollIntoView()` 把 window 滚 49px（固定编辑器页不该有 window 滚动）。
- ✅ 修法：①`.post-workspace__rail` 用 `overflow:hidden; overflow:clip`（`clip` 连程序化滚动也禁止，旧浏览器回退 hidden）；②`rail-body` 加 `overflow-anchor:none`，图片预览变高时不触发滚动锚定；③封面/Banner 不再直接暴露 `<input type=file>`，改为隐藏 input + 自绘“选择/更换图片”按钮；选完把焦点还给按钮并 `focus({preventScroll:true})`；④打开选择器前记录 `rail.scrollTop` / `rail-body.scrollTop`，上传结束后恢复，并把 window 明确恢复到 0；⑤`PostEditorForm` 挂载期间监听 window `scroll`，一旦被程序化滚走立即拉回 0，卸载时恢复进入编辑器前的位置。
- 📎 案例：2026-10-17e。390×844 真文件选择器（CDP 拦截 `Page.fileChooserOpened`）实测：封面和 Banner 选完后 `rail.scrollTop=0`、`rail-body.scrollTop` 与选前一致、`window.scrollY=0`、焦点回到触发按钮。1440×900 桌面实测：选前/选后 `window.scrollY=0`、rail 0、railBody 942 不变；即使再对触发按钮执行 `scrollIntoView()`，window 仍被锁在 0。
