# PLAN.md — 实施计划与进度

> 完整计划原文见会话批准稿；本文件是可勾选的任务清单与变更记录。用户可随时手改，AI 以此为任务依据。

## 里程碑

### M0 — 规则体系文档 ✅（2026-08-29）
- [x] AGENTS.md（角色=资深全栈工程师、红线 8 条、导航、交付清单）
- [x] docs/ 全套（README/architecture/ai/module.md/pitfalls/collaboration-workflow/agents-maintenance/spec-template/readme-requirements/api-contracts/data-models）
- [x] 根 README.md、PLAN.md、.gitignore、.gitattributes

### M1 — 骨架与认证（代码完成；仅待用户执行 migrate reset）
- [x] create-next-app 初始化（src 目录、@/* 别名、Tailwind 4）
- [x] Prisma 全量建模 + migration + 幂等 seed（管理员初始化、默认 Setting）
- [x] 管理员首启初始化（instrumentation）
- [x] iron-session + 登录/登出 API + 登录页 + admin 服务端 layout 守卫
- [x] Next 16 proxy：安全头、CSRF、后台乐观拦截、登录限速
- [x] Heo CSS 变量 token 体系 + 毛玻璃导航/Footer/主题切换
- [x] scheduler 骨架（instrumentation 幂等注册）
- [x] pm2 ecosystem.config.cjs（fork 单实例、700MB 重启线）
- 已验收：Windows dev 启动；首启管理员 1 个/Setting 8 项；未登录 307；登录/退出均 200；限速序列 401×5→429；主题防闪脚本位于 head；lint/build/seed 通过
- 待用户验收：`pnpm prisma migrate reset`（破坏性命令，AI 不代执行）

### M2 — 前台页面 ✅（2026-08-29）
- [x] 前台玻璃 UI 骨架：Heo token 补全、毛玻璃导航/卡片/侧栏、主页 Banner（本地回退图）+ 仪表盘 + 横向文章卡、文章/分类/标签/归档/瞬间/留言/搜索路由壳（2026-08-29）
- [x] 前台查询层 `lib/posts/query.ts`（`publishedAt<=now` + 密码文列表不回 excerpt/content）；幂等 seed 10 篇（含密码/定时/草稿）
- [x] StorageDriver + LocalDriver + sharp 缩略图 + /api/upload + /api/uploads/[...path]
- [x] MDX 渲染管线 + sanitize + TOC + shiki + Video + 灯箱
- [x] 主页 Bing 每日一图（服务端按天缓存、失败回退 `/banner-fallback.svg`）
- [x] 详情页 TOC/阅读进度/灯箱/浏览量 60 秒去重
- [x] 密码文章真正解锁（PasswordGate + 2h HMAC cookie）
- 已验收：seed 10 篇场景中前台列表 8 篇（7 公开 + 1 密码标题），draft/scheduled 404；未解锁响应零敏感正文；sanitize 探针/Video、三档上传/Range/穿越拦截、Bing、解锁与浏览量通过；Windows test/lint/build 通过

### M3 — 编辑器 vendor + 后台管理 ✅（2026-08-29）
- [x] 首日最小渲染验收（vendor + 别名 + 依赖锁定 + build 过）
- [x] EditorLoader（client + dynamic ssr:false）
- [x] imageUploadHandler → /api/upload；jsxPlugin Video
- [x] 后台文章 CRUD / 媒体库 / 瞬间发布 / 设置页 / 仪表盘
- 验收：Windows `tsc`/`lint`/`test`/`build` 通过；编辑器仅经 EditorLoader 动态加载；写文章 API 走 requireAdmin + CSRF

### M4 — 评论系统 ✅（2026-08-29）
- [x] service（pending/树形两级/管理员回复）+ 三处接入 + 频控蜜罐 + 后台审核
- 验收：XSS payload 纯文本展示；三种 target 隔离；蜜罐 200 不落库

### M5 — 搜索 / 瞬间互动 / 定时发布 ✅（2026-08-29）
- [x] LIKE 转义搜索 + ⌘K SearchDialog + 结果页
- [x] 瞬间瀑布流/九宫格/点赞去重/评论
- [x] scheduler 定时发布（补偿扫描）
- 验收：密码文搜索仅标题；到期文章自动上线；重启补偿
- 同期：发文导入 md；文章顶 Banner 封面/纯色/混色；导航进度条与滑动底色；首页 Banner 滚动固定模糊 + 主题按钮延后出现

### M6 — 备份系统 ✅（2026-08-29）
- [x] .backup() 快照 + archiver 打包 + 滚动保留 + 互斥锁 + 后台管理页
- 验收：解包恢复冒烟通过；定时自动备份；文件名白名单拦截穿越

### M7 — 打磨与部署
- [x] 安全复查与修复（CSRF/穿越/伪造类型/强制改密 API/XFF/密码文评论/登录计时）
- [x] SEO（generateMetadata / sitemap / robots / RSS，密码文排除正文）
- [x] 缓存（`unstable_cache` + `revalidateTag`；密码文页 `noStore`；next/image 透传 loader）
- [x] 动效打磨（骨架屏 / 空状态入场；404 已有）
- [ ] Linux 部署演练（方案已写：更新包 + `install.sh` 一次，以后只换包；上机由用户执行，见 [docs/linux-deploy-spec.md](docs/linux-deploy-spec.md)）
- 验收：安全手测与单测已做；备份恢复沿用 M6；pm2 24h / Lighthouse ≥90 / Linux 演练待部署时补

### M8 — 首页模块化 ✅（2026-08-30）
- [x] `HomeModule` / `HomePlacement` + 12 列格点（同格堆叠；桌面两侧留白；电脑/手机两套几何）
- [x] 9 个内置模块抽出；侧栏五块与首页共用 `components/widgets/*`
- [x] 后台 `/admin/home`（左设置 + 右真实数据画布，电脑/手机画框，可拖动/改宽/改高）与 `/admin/modules`（积木 + HTML/CSS/JS 注入）
- [x] 双视口自适应：电脑/手机两套几何、盒子决定内容；内页侧栏下沉；瞬间单张高度上限；横屏矮视口仍走手机套
- 验收：默认布局与改造前视觉一致；关模块后其它格不乱；自定义 HTML/CSS 注入生效且评论仍纯文本
- 方案：[docs/home-modules-spec.md](docs/home-modules-spec.md)

### M9 — 程序更新（0.1.0 本地发行，2026-09-04）

目标：后台导入一份新的博客程序包（`tar.gz`），预约重启后自动换上程序文件；`data/`、`.env`、备份密钥不动。方案：[docs/app-update-spec.md](docs/app-update-spec.md)。

**已落地（0.1.0）**
- [x] 更新包格式：`meta.json`（`kind: app-update`）+ 拒绝名单打包（`data/` `.env` `node_modules/` `.next/` 等不进包；新目录自动进包）
- [x] `lib/update/*`：打包、检视、解包、覆盖、预约、应用（dev 不构建；`start` 才 `prisma migrate deploy` + `next build`）
- [x] 单测：更新包拒绝名单、临时目录往返覆盖、含 `data/` 的包被拒、relaunch 走 `boot.cjs`、GitHub 仓库解析
- [x] 启动统一入口：`scripts/boot.cjs`（先应用到期更新再拉起 Next）；`pnpm dev` / `pnpm start` / pm2 / relaunch 都走它
- [x] 后台 `/admin/updates`：打包当前程序、导入包、从 GitHub 检查公开 Release、下载/删除、预约应用、设定重启时间或立刻重启
- [x] API：`/api/admin/update` 列表/打包/上传/下载/删除/预约；与预约恢复互斥
- [x] scheduler 到期后走同一套进程重启；`queueAppRestart` 与恢复共用

**收尾（做完才算 M9 交付）**
- [x] 文档同步：`docs/ai/module.md`、`docs/api-contracts.md`、`docs/architecture.md`、`docs/pitfalls.md`（P-064）、`docs/README.md`、根 README、AGENTS §3/§6 与命令行
- [x] Windows 上 `pnpm dev` 经 `boot.cjs` 能起来（启动前会检查预约更新；tsx CJS 下脚本禁止顶层 await）
- [x] 后台更新页手测：打开 `/admin/updates` → 打包 → 列表出现包（本机 `myblog-update-20260904-220534.tar.gz`，509 文件）；含 `data/` 的包被 `inspectUpdatePackage` 拒绝（`INVALID_ARCHIVE`）。**不要在正在开发的这份 `main/` 上点「立刻重启并更新」**
- [ ] 整包冒烟（另开目录或用户确认后再做）：`pnpm pack:update` 打出含 editor 的包，在副本目录应用后 `data/blog.db` 与 `.env` 仍在

**已知风险（收尾时可收紧，不挡文档）**
- 覆盖 `src/` 时会删掉包里没有的文件：正规包必须是完整 `src/` 树；残缺小包可能掏空源码。可考虑「仅当包内 src 文件数超过阈值才同步删除」。
- Windows 上正在跑的 `boot.cjs` 覆盖可能 EBUSY，当前是尽量覆盖、失败记日志。
- 生产 `next build` 在 1GB 上可能 OOM；失败会尝试把 `.next.bak` 拷回。

**本轮不做**
- [ ] Linux 生产机上的 `start` + migrate + build（1GB RAM 下构建可能紧；随 M7 部署演练一起做）
- [ ] 更新包上 COS、自动从上一包回滚（失败时手动再导入上一份即可）

**建议执行顺序**
1. 补文档（不改行为，先让下一会话能按规章接着做）
2. `pnpm dev` 确认 boot 入口
3. 登录后台走更新页（打包/列表/非法包），不点立刻应用
4. 需要真机换程序时：先打包并下载当前包，再在副本或停服后的生产机上应用

## 变更记录

| 日期 | 变更 | 来源 |
|---|---|---|
| 2026-08-29 | 计划创建（M0~M7） | 用户批准的计划 |
| 2026-08-29 | 新增硬约束：Windows 调试、1GB RAM 运行 | 用户口头要求 |
| 2026-08-29 | 实装使用 Next 16.3.3；请求入口由 middleware 更新为 `src/proxy.ts` | 框架实际版本约定 |
| 2026-08-29 | Prisma adapter 的 better-sqlite3 统一覆盖到 13.0.3；运行环境改为 Node.js ≥22 | Windows Node 24 构建验证 |
| 2026-08-29 | M2 主页背景 Banner 改用 Bing 每日一图，并保留失败回退图 | 用户 |
| 2026-08-29 | M2 先落地前台玻璃 UI 与查询壳；存储/MDX/解锁/Bing 交 GPT 续作（handoff2gpt.md） | 用户 |
| 2026-08-29 | M2 A～E 完成；浏览量最小版从 M5 前移并删除重复待办；公开 REST F 保持可选规划 | 用户批准的 M2 完成 Spec |
| 2026-08-29 | M3 编辑器 vendor + 后台 CRUD/媒体库/瞬间/设置完成 | 用户批准 docs/m3-spec.md |
| 2026-08-29 | M4 评论系统：游客 pending、两级树、三处接入、后台审核；主页浅色主色改为天蓝、文章卡整卡点击+涟漪 | 用户 |
| 2026-08-29 | M5 搜索/瞬间点赞/定时发布；发文导入 md、文章 Banner 纯色/混色、导航进度条与滑动底色、首页滚动模糊幕布 | 用户 |
| 2026-08-29 | M6 备份系统；首页幕布更透并去掉欢迎卡接缝；后台左侧竖栏 + 写文章左右分栏 | 用户 |
| 2026-08-29 | 后台仪表盘改卡片；深色模式幽灵按钮对比度；写文章工具栏改回编辑区顶部；Post.recommend 首页推荐；视频节点可更换；图片/瞬间多选与拖拽排序 | 用户 |
| 2026-08-29 | 深色模式覆盖 mdx-editor 浅色 token：正文浅字、工具栏深底（不改 vendor） | 用户 |
| 2026-08-29 | 编辑器标题字号、成稿预览、图片/视频上传或外链、顶部拖动换位、外链视频标记 | 用户 |
| 2026-08-30 | 后台各栏收起按钮改到右上角 chevron 图标；各栏独立滚动 | 用户 |
| 2026-08-30 | 否决替换为 Halo 编辑器：Vue 3 + GPL-3.0，产出 HTML 与本项目 MDX 管线不兼容 | 评估结论 |
| 2026-08-30 | M8 首页模块化（新增里程碑）：首页拆成可注册模块 + 12 列格点，后台新增首页管理与模块管理；自定义 HTML/CSS/JS 按用户决策直接注入 | 用户批准 docs/home-modules-spec.md |
| 2026-08-30 | M7 打磨：安全复查修复 + SEO/RSS + 公开查询缓存；Linux 演练按用户要求暂缓 | 用户 |
| 2026-08-30 | 腾讯云 COS：CosDriver + 加密备份上云 + 新媒体原图/音视频上 COS、本地缩略图 | 用户批准 docs/cos-storage-spec.md |
| 2026-08-30 | 媒体目录对齐 + 本地限额 + 访客 thumb 走 COS + 文章 `/posts/{publicId}/{name}` | 用户批准媒体目录与文章 URL Spec |
| 2026-08-30 | 首页双视口自适应：电脑/手机两套几何，盒子决定内容；内页侧栏下沉；瞬间单张高度上限 | 用户批准计划稿 |
| 2026-09-04 | Linux 精简安装：发版只换 tar.gz，不改 install.sh；`apply-update --file` 预约重启 | 用户要简易更新 |
| 2026-09-04 | 发行 0.1.0：拒绝名单更新包、GitHub 检查、开箱创建页、站长手册；清空内容数据 | 用户批准计划 |
