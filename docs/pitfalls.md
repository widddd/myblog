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
- ✅ 规则：频道与展示文案只出自 `lib/release.ts`（当前 `APP_CHANNEL=alpha`、`APP_VERSION=0.1.1`、标签「0.1.1」）。前台页脚左下角 `ReleaseMark`，后台侧栏左下角同一文案。备份包 `meta.json` 写入 channel/version，列表展示 `backupReleaseLabel()`。改版本号只改这一处。
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

## 追加模板

```markdown
### P-0XX 标题
- ❌ 错误：（实际做了什么）
- ✅ 规则：（正确做法，含文件路径）
- 📎 案例：（关联里程碑/日期）
```
