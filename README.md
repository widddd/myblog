# MyBlog — 个人博客系统

基于 Next.js 16 的个人博客：前台（主页/瞬间/文章/全局搜索/留言板）+ 后台（文章管理、mdx-editor 富文本发布、评论审核、自动备份）。设计风格参考 theme-hao（Heo 风格圆角卡片 + 丝滑动效）。

> 当前进度：M6 备份系统已完成。下一里程碑为 M7 打磨与部署，见 [PLAN.md](PLAN.md)。

> AI 协作请先读 [AGENTS.md](AGENTS.md)；文档索引见 [docs/README.md](docs/README.md)。

## 特性

- **前台**：主页（毛玻璃导航 + Bing/自定义 Banner 滚动固定模糊 + 仪表盘 + 横向文章卡 + 侧栏 widget）、文章列表/分类/标签/归档、瞬间（瀑布流/九宫格/点赞）、留言板、⌘K 搜索（密码文仅标题）
- **文章能力**：安全 MDX、目录（h1–h6 分层，点击平滑滚动到对应标题）、双主题代码高亮、Video、图片灯箱、阅读进度、浏览量 60 秒去重，2 小时签名 cookie 的密码文章；详情顶 Banner 可选封面/纯色/混色；后台可导入 Markdown
- **评论**：游客昵称两级嵌套、提交后待审；管理员回复直接显示；XSS 按纯文本转义
- **瞬间**：九宫格图片、fingerprint 点赞去重、评论沿用文章同一套
- **上传存储**：管理员 CSRF 上传；file-type 魔数校验；sharp 生成原图/content/thumb；LocalDriver 流式与 Range 读取，预留 OSS driver
- **后台**：`/admin` 登录后可写文章（mdx-editor 可视化编辑 / 预览 / 导入 md）、管理瞬间/评论/媒体库/备份/站点设置；写文章页左侧栏目与设置可收起，右侧为顶部工具栏 + 正文；标题按字号显示；点「图片 / 视频」弹出插入框（上传或外链），按住顶部「拖动」换位；外链视频下方标域名；文章可勾选「首页推荐」；瞬间图片为四宫/九宫格并可拖动排序
- **安全**：SQL 注入/XSS/CSRF/暴力破解/点击劫持/上传攻击/路径穿越防护
- **备份**：自动周期备份（可配置，默认 3 天）数据库+上传资源 → tar.gz，可下载（OSS 上传规划中）
- **轻量**：1GB RAM 可运行；SQLite 单文件数据库

## 技术栈

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 · Prisma 6 + SQLite · mdx-editor v4.2.3 (vendor) · iron-session · sharp

## 目录结构

```
myblog/
├── main/        # 应用代码（Next.js 项目根）
├── docs/        # 文档（含 docs/ai/ 机器维护文档）
├── reference/   # 只读参考资料（rules.md、theme-hao）
├── AGENTS.md    # AI 协作总纲
└── PLAN.md      # 实施计划与进度
```

## 环境要求

- Node.js ≥ 22（开发基线 Node 24），pnpm ≥ 9
- **开发调试在 Windows**（Win11）；生产部署 Linux（pm2 fork 单实例）
- 内存：1GB RAM 可运行（资源红线，见 docs/architecture.md）

## 快速开始（开发）

```powershell
cd main
pnpm install
Copy-Item .env.example .env # 填 SESSION_SECRET、ADMIN_INIT_PASSWORD
pnpm prisma migrate dev     # 建库
pnpm db:seed                # 演示 10 篇文章（已有文章则跳过）
pnpm test                   # M2 sanitize/解锁 token/路径边界测试
pnpm dev                    # http://localhost:3000
```

首次启动自动用 `ADMIN_INIT_PASSWORD` 初始化管理员；后台入口 `/admin`。登录后：文章列表/编辑器、瞬间、评论审核、媒体库、备份、站点设置。编辑器为 client-only，请勿在 Server Component 中直接 import `src/editor/`。

## 构建与部署

```bash
cd main && pnpm build
pm2 start ecosystem.config.cjs   # fork 单实例（禁 cluster，SQLite 单写者）
```

nginx 反代建议：HTTPS + `client_max_body_size 20m`。详见部署章节（M7 补全）。

## 备份与恢复

- 自动备份周期在后台「设置」中配置（默认 3 天，保留 5 份），存于 `main/data/backups/myblog-YYYYMMDD-HHMMSS.tar.gz`
- 后台「备份」页可手动触发、下载、删除
- 恢复（须先停进程）：
  1. 解包 tar.gz，得到 `blog.db` 与可选的 `uploads/`
  2. 用解包出的 `blog.db` 覆盖 `main/data/blog.db`
  3. 删除旧的 `blog.db-wal` / `blog.db-shm`（快照是完整独立库）
  4. 若包内有 `uploads/`，覆盖回 `main/data/uploads/`
  5. 重新启动进程

## 数据与配置

| 位置 | 说明 |
|---|---|
| `main/.env` | SESSION_SECRET、ADMIN_USERNAME、ADMIN_INIT_PASSWORD、DATABASE_URL；可选 DATABASE_PATH/FINGERPRINT_SECRET |
| `main/data/blog.db` | SQLite 数据库（WAL 模式） |
| `main/data/uploads/` | 上传的图片/视频（含缩略图） |
| `main/data/backups/` | 备份压缩包 |

## FAQ

- **图片存在哪？** 本地 `data/uploads`（经 StorageDriver 抽象，后续可切腾讯云 OSS）
- **忘记管理员密码？** 停服 → 删 AdminUser 行 → 用 `.env` 中 ADMIN_INIT_PASSWORD 重启重新初始化
- **演示密码文章？** slug `locked-garden`，开发环境密码 `demo-lock`；验证后写入 2 小时 HttpOnly cookie
- **定时发布没生效？** 前台以 `publishedAt<=now` 为准；进程启动会补偿扫描，之后每 60 秒再扫一次。检查服务器时间与 pm2 进程是否存活

（章节清单对照 docs/readme-requirements.md 维护）
