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
- [ ] 安全渗透手测 / SEO / 缓存优化 / Linux 部署演练 / 动效打磨
- 验收：pm2 24h 稳定；Lighthouse ≥90；备份恢复成功

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
| 待办 | 腾讯云 OSS：用户提供 apikey 与用法后实现 OssDriver + 备份上传 OSS + 编辑器直传 OSS | 用户 |
