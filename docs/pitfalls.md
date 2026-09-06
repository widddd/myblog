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
- ✅ 规则：vendor 冻结。在 `globals.css` 用 `[data-theme="dark"] .admin-mdx-editor`（及 popup/select）覆盖 `--base*` / `--slate-*`，让工具栏与正文跟 Heo 深色 token。不要给 html 乱加 `.dark` 以免波及前台
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
- ✅ 规则：时长只用 `--admin-fast/mid/slow`（160/220/280ms）和 `--admin-ease`。标题 18px、分组 16px、正文 14px。非编辑页顶栏由 `AdminWorkspace` 按路径出当前页标题，页面内 h2 只写分组名。切页时顶栏只做标题透明度交叉渐变，卡片向下跳出再从下方浮现；禁止整页（含顶栏）一起位移。删除/覆盖/重启等必须用 `.admin-danger`（`#D93025` 加粗）。后台卡片 hover 不要 `translateY`
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
- ✅ 规则：频道与展示文案只出自 `lib/release.ts`（当前 `APP_CHANNEL=alpha`、`APP_VERSION=0.1.0`、标签「0.1.0」）。前台页脚左下角 `ReleaseMark`，后台侧栏左下角同一文案。备份包 `meta.json` 写入 channel/version，列表展示 `backupReleaseLabel()`。改版本号只改这一处。
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
- ✅ 规则：内置 `uptime` 登记 `lib/home/builtins.ts` + `HomeModuleRenderer`。开始时间只进 Setting KV `siteStartedAt`（三处同步，见 P-004），并进入 `getPublicSettings`。空或解析失败则 `HomeGrid` 不渲染该格；后台画布显示「未设置开始时间，前台不显示」。计时精确到秒，走 `lib/home/uptime.ts`。
- 📎 案例：首页底部运行时间（2026-09-04）

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
- ✅ 规则：打包遍历 `main/`，只拒绝 `data/`、`.env*`、`node_modules/`、`.next/`、`.git/`、`coverage/`、测试文件与路径穿越。overlay 按包内**顶层目录**同步删除，不删包外顶层散文件。GitHub 仓库写在 Setting `updateGithubRepo`，只在后台「更新」点检查时请求公开 Releases，资产名必须 `myblog-update-*.tar.gz`。`siteName` 默认空，创建站点页 / `pnpm setup` 手填；未创建完成前公开标题用中性「博客」。`POST /api/auth/setup` 仅当零管理员且无半钥时可写，与登录同套 CSRF/限速
- 📎 案例：0.1 发行（2026-09-04）

---

## 追加模板

```markdown
### P-0XX 标题
- ❌ 错误：（实际做了什么）
- ✅ 规则：（正确做法，含文件路径）
- 📎 案例：（关联里程碑/日期）
```
