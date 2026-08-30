# api-contracts.md — API 路由契约

> 新增/修改路由时同步本文件。错误响应统一：`{ code: string, message: string }`，不透传堆栈。
> 状态：M1 认证、M2 上传/解锁/浏览量、M3 后台管理、M4 评论、M5 搜索/瞬间点赞/定时发布、M6 备份已落地。前台列表/详情由 RSC 直查 Prisma；公开文章/Setting REST 属可选预留，仍未实现。

## 通用约定

- 管理端（`/api/admin/*`、`POST /api/upload`）第一个语句 `await requireAdmin()`，未登录返回 401
- 所有**非 GET/HEAD/OPTIONS**请求须携带 `x-csrf-token` 头（double-submit 校验，Next 16 `proxy.ts` 执行）
- 分页参数：`page`（1 起）、`pageSize`；响应：`{ data: T[], total: number, page, pageSize }`
- 鉴权失败 401；CSRF 失败 403；校验失败 400（zod 首个错误信息）；限速 429；未找到 404

## 公开端点

| 方法 | 路径 | 请求 | 响应/行为 | 状态 |
|---|---|---|---|---|
| POST | `/api/auth/login` | `{username, password}` + CSRF 头 | `{data:{username},csrfToken}` + session cookie；限速 5 次/15 分/IP | ✅ |
| POST | `/api/auth/logout` | CSRF 头 | 销毁 session 与 CSRF cookie | ✅ |
| GET | `/api/auth/csrf` | — | `{token}`（HMAC 绑 session）；`Cache-Control: no-store` | ✅ |
| GET | `/api/posts` | `?page&pageSize&category&tag&q` | 已发布文章列表（密码文无 content/excerpt）；RSC 已覆盖，REST 可选 | 📋 |
| GET | `/api/posts/[slug]` | — | 详情；RSC 已覆盖，REST 可选 | 📋 |
| POST | `/api/posts/[slug]/unlock` | `{password}` + CSRF | `{data:{unlocked:true,expiresIn:7200}}` + slug 专属 HttpOnly cookie；错误 401；5 次/15 分/IP+slug | ✅ |
| POST | `/api/posts/[slug]/view` | CSRF | `{data:{views,counted}}`；IP+slug 60s 内重复返回 200 且不增加 | ✅ |
| GET | `/api/moments` | `?page` | 瞬间流（含点赞数/是否已赞） | ✅ |
| POST | `/api/moments/[id]/like` | CSRF | `{data:{liked,likeCount}}`；fingerprint 去重翻转；20 次/分/IP → 429 | ✅ |
| GET | `/api/comments` | `?targetType&targetId&page` | 仅 approved 树形两级；`data` 为顶层+replies；不含 email/ip | ✅ |
| POST | `/api/comments` | `{targetType,targetId,nickname,email?,content,parentId?,honeypot?}` | → pending；频控 1 条/60s/IP → 429；蜜罐非空仍 200 且不落库；父评论必须同对象且为顶层 | ✅ |
| GET | `/api/search` | `?q&page` | 标题+公开正文命中；密码文仅标题；空 q 空列表；60 次/分/IP | ✅ |
| GET | `/api/settings/public` | — | 公开配置子集；RSC 已覆盖，REST 可选 | 📋 |
| GET/HEAD | `/api/uploads/[...path]` | 可选 `Range: bytes=...` | 流式文件；Range 206；hash immutable；路径穿越 400 | ✅ |

## 管理端点（requireAdmin + CSRF）

| 方法 | 路径 | 说明 | 状态 |
|---|---|---|---|
| GET | `/api/admin/session` | 当前管理员信息 `{data:{username}}` | ✅ |
| GET | `/api/admin/stats` | 文章分状态计数、瞬间数、pending 评论数 | ✅ |
| GET/POST | `/api/admin/posts` | 列表（含 draft/scheduled，`?status&q&page`）/ 新建（含 `bannerStyle`/`bannerColor`/`bannerColor2`/`recommend`） | ✅ |
| GET/PATCH/DELETE | `/api/admin/posts/[id]` | 详情（含 content，`hasPassword`，无 hash，含 banner 与 `recommend`）/ 更新 / 删除（顺带删该文评论） | ✅ |
| POST | `/api/admin/preview` | `{content}`（≤200_000 字）→ `{data:{html}}`；走 `renderMdx` + sanitize，供写文章预览 | ✅ |
| GET/POST | `/api/admin/categories`、`/api/admin/tags` | 分类/标签列表与新建 | ✅ |
| GET/POST | `/api/admin/moments` | 瞬间列表/发布 | ✅ |
| PATCH/DELETE | `/api/admin/moments/[id]` | 编辑/删除（顺带删该瞬间评论） | ✅ |
| GET | `/api/admin/comments` | `?status=pending\|approved&targetType=post\|moment\|board&page`；扁平列表含 email/ip/targetLabel | ✅ |
| POST | `/api/admin/comments` | `{targetType,targetId,content,parentId?}` 管理员回复，直接 approved + isAdmin | ✅ |
| PATCH/DELETE | `/api/admin/comments/[id]` | PATCH `{status:approved\|rejected}`（rejected=删除待审）；DELETE 含级联子回复 | ✅ |
| POST | `/api/upload` | multipart `file` 单文件、可选 `kind=image\|video`；魔数+扩展+大小白名单；返回 `{data:{id,hash,kind,mime,width,height,size,original,thumb,content}}`，图片三档、视频仅 original | ✅ |
| GET | `/api/admin/uploads` | 媒体库分页 | ✅ |
| DELETE | `/api/admin/uploads/[id]` | 删除；正文/封面/瞬间 JSON 仍引用则 409 | ✅ |
| GET/PUT | `/api/admin/settings` | 全量 KV；PUT 只接受已知可写 key，不含 `lastBackupAt` | ✅ |
| POST | `/api/admin/backup/run` | 手动触发备份；同步执行后 `{data:{name,size,createdAt}}`；已有任务 409 | ✅ |
| GET | `/api/admin/backup/list` | `{data:{files:[{name,size,createdAt}],running,lastBackupAt}}` | ✅ |
| GET | `/api/admin/backup/download/[file]` | 下载；文件名须匹配 `^myblog-\d{8}-\d{6}\.tar\.gz$`，越界 400，缺失 404 | ✅ |
| DELETE | `/api/admin/backup/[file]` | 删除备份；白名单与路径校验同下载 | ✅ |
