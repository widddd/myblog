# AGENTS.md — MyBlog AI 协作总纲

## 0. 地位说明

| 维度 | 说明 |
|---|---|
| **是什么** | 项目根目录的 AI 协作总纲：角色定位、架构红线、目录索引、工作流摘要；每个新会话第一份必读 |
| **不是什么** | 不是百科全书、不是 API 手册、不是运行报告合集 |
| **与 docs/ 的关系** | 本文件 = 规章封面 + 必须遵守的底线；docs/ = 按任务按需翻阅的详细手册 |
| **与 README 的关系** | README 面向人类（安装用法）；本文件面向 AI（协作约束）；互补不替代 |
| **与 reference/rules.md 的关系** | rules.md 是只读施工图纸（本项目规则体系由它搭建），日常协作不读它；与用户口头要求冲突时，**以用户要求为准** |
| **单一事实源** | 全局硬性规则以本文件为准；与 docs/ 冲突时以红线为准并修正 docs/ |
| **篇幅与增量** | ≤400 行；新增前自问「缺了会不会导致 AI 立刻违反底线？」——否则只写 docs/ 并加链接 |

## 1. 项目概览

- **任务**：个人博客系统（前台：主页/瞬间/文章/搜索/留言板；后台：文章管理、发布编辑器、评论、备份）
- **技术栈**：Next.js 16 App Router + React 19 + TypeScript + Tailwind 4；Prisma 6 + SQLite（better-sqlite3 adapter）；next-mdx-remote v6 + Shiki；mdx-editor v4.2.3 源码 vendor；iron-session；sharp；Node.js ≥22
- **核心命令**（在 `main/` 下执行）：`pnpm dev` / `pnpm build` / `pnpm start`；`pnpm prisma migrate dev`；`pnpm prisma studio`
- **语言约定**：与用户沟通用中文；代码注释与 commit message 用英文或中文均可，日志输出中文
- **角色定位**：你是**资深经验的全栈工程师**。AGENTS.md 与 docs/ 是项目规章与手册，凭专业判断做事，但**未经确认不得擅自改架构、引依赖、动已验证的决策**

### 硬性资源约束（用户钦定）

1. **开发调试在 Windows 上进行**（Win11）。一切脚本、路径处理、原生依赖（sharp/better-sqlite3）必须先保证 Windows 可用，再考虑 Linux 部署兼容。
2. **运行时轻量：1GB RAM 必须能跑起来**。禁用重量级方案（重型ORM引擎以外的、Redis、MQ、大型监控）；生产用 pm2 fork 单实例；内存缓存要有上限。

## 2. 架构红线（违反即返工）

1. **复用优先**：新增任何功能前先查 `docs/ai/module.md` 模块注册表；已存在则复用或扩展，严禁平行重写。
2. **目录不变量**：应用代码只在 `main/`；文档在 `docs/`；`reference/` 只读不动；`main/src/editor/` 是 vendor 冻结子树——**禁止升级其依赖版本或随手重构**，改动必须先说明理由。
3. **SQL 安全**：一律走 Prisma 参数化查询；唯一原生 SQL 在 `lib/search`，LIKE 通配符必须显式转义；严禁字符串拼接 SQL。
4. **评论纯文本**：评论/昵称链路禁止 `dangerouslySetInnerHTML`；正文 MDX 必须过 `lib/markdown/sanitize.ts`（管理员内容也过）。
5. **存储可插拔**：所有文件读写只经 `lib/storage` 的 StorageDriver 接口，禁止直接拼 `data/uploads` 路径。
6. **SQLite 单写者**：pm2 只允许 fork 单实例（cluster 多进程写 SQLite 会损坏数据）；备份只用 better-sqlite3 `.backup()` API，禁止直接拷 db 文件。
7. **资源红线**：新依赖引入前评估内存与包体积，必须满足 1GB RAM 运行约束；开发须在 Windows 上实际验证通过。
8. **文档同步**：禁止只改代码不更文档；交付前必须按 `docs/agents-maintenance.md` 触发表同步 docs/README/AGENTS 索引。

## 3. 目录导航

| 路径 | 内容 | 详情 |
|---|---|---|
| `main/src/app/` | 前台路由 + `/admin` 后台 + `/api` 路由 | [docs/architecture.md](docs/architecture.md) |
| `main/src/instrumentation.ts` / `proxy.ts` | 首启/scheduler 注册；Next 16 安全头/CSRF/乐观拦截/限速 | [docs/architecture.md](docs/architecture.md) |
| `main/src/lib/` | db/auth/client/storage/upload/markdown/posts/banner/comments/search/scheduler/backup | [docs/ai/module.md](docs/ai/module.md) |
| `main/src/editor/` | mdx-editor vendor 源码（冻结） | [docs/architecture.md](docs/architecture.md) |
| `main/src/components/` | UI 组件（layout/home/post/moment/comment/common/admin） | [docs/ai/module.md](docs/ai/module.md) |
| `main/prisma/` | schema + migrations + seed | [docs/data-models.md](docs/data-models.md) |
| `main/data/` | 运行时数据：blog.db、uploads/、backups/（gitignore） | [docs/architecture.md](docs/architecture.md) |
| `docs/ai/module.md` | **模块注册表（写代码前必读）** | — |
| `docs/pitfalls.md` | 已知陷阱 P-001 起递增 | — |
| `docs/api-contracts.md` | API 路由契约 | — |
| `docs/collaboration-workflow.md` | 任务隔离、操作授权、Spec 流程 | — |
| `docs/agents-maintenance.md` | 文档同步触发表（交付前必读） | — |
| `docs/spec-template.md` | 大改动 Spec 空白模板 | — |
| `docs/readme-requirements.md` | README 必备章节清单 | — |
| `PLAN.md` | 里程碑计划（人为主、AI 辅助） | — |
| `HANDOFF.md` | 历史交接快照（只读，不再维护） | — |

## 4. pitfalls 高频摘要（全文见 [docs/pitfalls.md](docs/pitfalls.md)）

- **P-001 重复造轮子**：不查注册表就新写平行模块
- **P-004 配置多源不同步**：Setting KV 新增字段漏改读写路径
- **P-005 vendor 目录漂移**：升级 editor 依赖或用 `@/` 引项目代码
- **P-006 路径分隔符**：Windows 开发用了 `\` 或 `split('\\')`，Linux 部署炸
- **P-007 高成本操作未授权**：长任务/大量写入未请示
- **P-011 SQLite 并发误用**：cluster 模式 / 直接拷 db 文件备份
- **P-013 模糊措辞**：报告里写「大概/应该」而不给具体数值
- **P-015 改代码未同步文档**：交付前没走 agents-maintenance 触发表
- **P-016 原生驱动双版本**：Prisma adapter 带入旧 better-sqlite3，Windows Node 24 缺 binding
- **P-017 Next 16 约定**：使用 `src/proxy.ts`；关闭 `agentRules` 防止生成第二套规则
- **P-020 MDX JSX 消毒**：Video 先转白名单 HAST 再 sanitize；组件禁展开未知 props
- **P-021 vendor tsc**：`src/editor` 排除出应用 tsc；Turbopack 别名用相对路径
- **P-022 编辑器全局 CSS**：只从 admin layout 引入 vendor `globals.css`
- **P-023 评论蜜罐/pending**：蜜罐 200 不落库；游客不直接可见
- **P-024 搜索 LIKE**：通配符必须 `escapeLike`；原生 SQL 只在 `lib/search`
- **P-026 备份**：只用 `.backup()`；文件名白名单；uploads 走 StorageDriver
- **P-027 编辑器工具栏**：必须纵向 flex，禁止工具栏与正文并排占 1/3
- **P-028 正文视频**：`insertJsx$` + 可更换删除；保存前归一成 `<Video />`
- **P-029 编辑器深色**：只在 globals.css 覆盖 `--base*`，禁止改 vendor 换肤
- **P-030 编辑器预览**：不要平行重写；标题字号写 `.admin-mdx-prose`；成稿预览走 `/api/admin/preview`
- **P-031 文章目录**：必须收 h1–h6（编辑器「标题 1」是 `#`）；点击平滑滚动，禁止只收 h2–h4
- **P-032 媒体插入**：弹窗 portal 到 body；禁止工具栏内 absolute 下拉（会被编辑器挡住）

## 5. 工作流底线

- **先读后动**：新会话 = 第一天上班。动手前读本文件 + 按任务读 `docs/ai/module.md` + `docs/pitfalls.md`；不清楚就提问或复述理解待确认，不得自作主张。
- **任务隔离**：同一会话不混做设计/实现/修 bug/写报告；纠缠超 ~10 轮仍不清晰 → 拆分任务。
- **影响面分析**：改代码前先输出涉及模块、配置同步点、是否破坏红线、将更新哪些文档。
- **交接文档冻结**：`HANDOFF.md` 仅作历史参考，不再修改；其他文档仍按 `docs/agents-maintenance.md` 触发表维护。
- **高成本操作授权**：生产部署、数据库迁移执行、批量删除、大文件操作——只给命令，用户亲自执行；smoke test 可做但须标注。
- **Spec 驱动**：大改动（触及 ≥3 源码文件 / 改数据流 / 新增依赖 / 新增档案产物）先写 Spec 获批再写代码。

## 6. 状态摘要

- 当前阶段：M6 备份系统已完成（`.backup()` + archiver + 滚动保留 + `/admin/backups`）；下一里程碑为 M7 打磨与部署
- 已证伪/否决路线：Lucia（停止维护）、自写 JWT、Drizzle、public 目录运行时写上传文件、系统 tar 打包、pm2 cluster、整包拷贝 theme-hao 的 zhheoblog.css
- 编辑器 vendor 基线：mdx-editor v4.2.3（MIT）

## 7. 文档体系与人机分工

| 事项 | AI | 用户 |
|---|---|---|
| 读文档、写代码、smoke test、文档同步 | ✅ | — |
| 高成本操作（部署、迁移、批量删除） | 只给命令 | ✅ 亲自执行 |
| 大改动 Spec、方案落档 | 起草 | ✅ 确认后执行 |
| 需求不清 | 提问、复述 | ✅ 澄清 |
| 计划方向（PLAN.md） | 辅助 | ✅ 主责 |

## 8. 交付前检查清单

**代码**
- [ ] 已查 `docs/ai/module.md`，未重复造轮子
- [ ] 未破坏红线（存储接口/SQL 参数化/评论纯文本/vendor 冻结/单实例）
- [ ] 新配置字段已同步全部读写路径
- [ ] Windows 上 `pnpm dev` 实际跑过、功能验证过
- [ ] 未私自执行高成本操作

**文档同步**（对照 `docs/agents-maintenance.md` 触发表）
- [ ] 已更新本任务触发的全部 docs
- [ ] 用户可见功能已更新 README
- [ ] 新坑已写入 `docs/pitfalls.md`（P-0XX 递增）
- [ ] 新增/删除源码文件已同步 `docs/ai/module.md` + AGENTS §3 导航
- [ ] 回复中列出已同步的文档路径
