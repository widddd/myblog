# Spec：M4 评论系统

- 日期：2026-08-29
- 提案人：AI
- 状态：已实施（用户本会话要求完成 M4；方案对齐 PLAN.md 原批准稿）

### 1. 目标

自建评论：游客提交待审、两级嵌套、管理员回复直接可见；前台文章/瞬间/留言板三处接入；后台审核（通过/拒绝/删除/回复）；XSS payload 纯文本展示；三种 target 互不串。

**本里程碑不做**：邮件通知、第三方评论、评论弹幕、搜索/点赞/定时发布（M5）、备份（M6）。不改 schema（沿用现有 Comment 表）。无新依赖。

### 2. 设计方案

| 项 | 做法 |
|---|---|
| 存储 | 现有 `Comment`：`targetType=post\|moment\|board`，board 的 `targetId` 固定 0 |
| 游客提交 | zod → pending；频控 1 条/60s/IP（复用 `rateLimit`）；蜜罐非空 **200 且不落库** |
| 前台列表 | 仅 `approved`；两级树（`buildCommentTree`）；纯文本渲染，禁止 `dangerouslySetInnerHTML` |
| 管理员回复 | `POST /api/admin/comments`：`isAdmin=true`、直接 `approved` |
| 审核 | PATCH `approved` 通过；PATCH `rejected` 删除待审（schema 无 rejected 状态）；DELETE 级联子回复 |
| 接入 | 文章（解锁后）、每条瞬间、留言板；密码文未解锁不展示评论 |
| 后台 | `/admin/comments` 筛选 + 待审红点（layout count） |

复用：`requireAdmin`、CSRF（`proxy.ts`）、`rateLimit`、`getClientIp`、`fetchCsrfToken`、`adminJson`、Prisma 参数化。不新造限速/鉴权模块。

### 3. 影响面分析

- **涉及模块**：`lib/comments/*`、`lib/validation/comment.ts`、公开/管理 API、`components/comment/*`、后台评论页、文章/瞬间/留言页、`AdminNav`、`PostDetailModel.id`
- **新增/变更配置字段**：无
- **是否破坏红线**：否。评论纯文本；SQL 走 Prisma；无 Redis；vendor 未动；无新依赖
- **是否新增依赖**：无

### 4. 输入输出边界

公开：`GET/POST /api/comments`（GET 仅 approved 树；POST 游客 → pending，蜜罐静默成功，限速 429）。
管理：`GET/POST /api/admin/comments`；`PATCH/DELETE /api/admin/comments/[id]`。
公开投影不含 email/ip。错误格式仍为 `{ code, message }`。

### 5. 实施步骤

1. service + tree + zod
2. 公开与管理 API
3. 前台三处 + 后台审核 UI
4. 单测（蜜罐/两级树/XSS 纯文本）+ 文档同步

### 6. 验收标准

- 游客提交后前台不可见，后台待审 → 通过后可见
- 回复只能挂在顶层；第三层被拒绝
- `POST` 带 honeypot 非空：200 且库中无新行
- 同一 IP 60 秒第二条：429
- XSS：`content`/`nickname` 含 `<script>`/`onerror` 时 HTML 源码为转义文本，无执行
- `targetType=post|moment|board` 列表互不混入
- 未登录 POST 无 CSRF：403；未登录访问 `/admin/comments`：307

### 7. 审批

- [x] 用户已要求完成 M4
- [x] 实施完成
- [x] 文档已同步（见交付回复）
