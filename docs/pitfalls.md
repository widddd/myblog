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
- 📎 案例：2026-02 同一处卡片改动，前几轮验证动辄几分钟（还被掐断两次），换成 ui-shot 后 2.6s。

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
- ✅ 顺带结论：**空白截图 ≠ 页面坏了**。本次两张"内容区全白"的截图与折叠箭头、按钮无反应是同一个根因（未水合），换 `localhost` 后一切正常且交互全通过。
- 📎 案例：2026-09 瞬间发布区改版（朋友圈式）验收时，为了验证 popover/抽屉交互才发现；此前两轮"headless 动画不跑"的猜测是错的方向。

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

