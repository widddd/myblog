# Spec：续完 M2 前台能力

- 日期：2026-08-29
- 提案人：AI
- 状态：已实施

## 1. 目标

完成 M2 强制范围 A～E：本地存储与上传、安全 MDX/TOC/Video、密码文章解锁、Bing 每日一图、灯箱/阅读进度/浏览量，使 M2 验收闭环。

本轮不实现公开 REST、编辑器 vendor、评论、搜索、定时发布与备份。

## 2. 设计方案

1. 实现可插拔 StorageDriver。用户已批准在既定 `put/getUrl/delete/stat` 基础上增加 `get`，确保公开文件读取也遵守 StorageDriver 红线。
2. LocalDriver 独占 `data/uploads` 物理路径；上传层使用 file-type、SHA-256、sharp 和 Upload 表完成校验、三档图片与去重。
3. MDX 使用 next-mdx-remote v6，并显式禁用 JavaScript 表达式。`<Video>` 先转换为只含字面量白名单属性的 HAST，再经过 rehype-sanitize；未知 JSX 不进入输出。
4. 管线顺序为 remark-gfm → Video 转换 → sanitize → slug/autolink → TOC 收集 → Shiki。sanitize 先于 heading id 生成，避免 clobber 前缀破坏目录锚点。
5. 密码文章先查无正文元信息，验证 2 小时 HMAC cookie 后才读取 content/excerpt；所有列表投影继续隐藏密码文摘要。
6. Bing 元数据采用最多 2 项的进程内按日缓存与失败短缓存；浏览量采用最多 2000 桶的既有限速表做 IP+slug 60 秒去重。

## 3. 影响面分析

- 涉及模块：`lib/storage`、`lib/upload`、`lib/markdown`、`lib/posts`、`lib/banner`、文章详情组件与四条 M2 API。
- 新增/变更配置字段：无。复用 `uploadMaxSizeMB` 与 `SESSION_SECRET`。
- 是否破坏红线：否。文件只经 StorageDriver；SQL 只经 Prisma；正文必须 sanitize；密码正文不进入未解锁查询；不改 vendor；缓存均有上限。
- 是否新增依赖：仅 `@shikijs/rehype`。它是 Shiki 官方 unified 适配层；只初始化 2 个主题和固定语言集合。sharp 并发限制为 1，满足 1GB RAM 约束。
- 数据模型：现有 Post/Upload 字段足够，不改 schema、不执行迁移。

## 4. 输入输出边界

- `POST /api/upload`：管理员 + CSRF；multipart 单文件；返回 original/content/thumb URL 与元数据。
- `GET|HEAD /api/uploads/[...path]`：公开流式读取；支持合法 Range；hash 文件 immutable。
- `POST /api/posts/[slug]/unlock`：CSRF；接收 `{password}`；成功写 2 小时 HttpOnly 签名 cookie。
- `POST /api/posts/[slug]/view`：CSRF；60 秒去重；返回最新 views 与是否计数。
- 未解锁页面、列表、归档、侧栏与相关推荐均不得返回密码文章 content/excerpt/passwordHash。

## 5. 实施步骤

1. 安装官方 Shiki Rehype 适配，并实现 StorageDriver、上传处理与文件读取路由。
2. 实现 sanitize/MDX/TOC/Shiki/Video、正文灯箱与阅读进度。
3. 收紧文章查询，完成密码解锁 API、cookie 与详情分支。
4. 完成 Bing 缓存与浏览量 API/客户端计数。
5. 运行 Windows 类型检查、测试、lint、build 和 HTTP 冒烟。
6. 同步模块注册表、架构、API、数据模型、pitfalls、README、PLAN、AGENTS 与交接摘要。

## 6. 验收标准

- seed 场景前台只投影 7 篇公开文章与 1 篇密码标题；草稿/定时文 404。
- 未解锁 `locked-garden` 响应不含摘要、正文、演示密码或 passwordHash；正确密码可阅读，错误密码 401，cookie 约 2 小时。
- `sanitize-probe` 无 script/onerror/javascript/表达式，Video 保留。
- 图片上传生成 original/content/thumb，文件可读取，Range/缓存头正确，路径穿越被拒。
- Bing 成功使用日图，失败回退本地图，缓存命中不重复请求。
- 同 IP/slug 60 秒内浏览量只增加一次。
- `pnpm exec tsc --noEmit`、安全测试、`pnpm lint`、`pnpm build` 通过。

## 7. 审批

- [x] 用户已批准
- [x] 实施完成
- [x] 文档已同步：AGENTS、PLAN、README、handoff2gpt、docs/README、architecture、api-contracts、data-models、ai/module、pitfalls
