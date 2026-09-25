# api-contracts.md — API 路由契约

> 新增/修改路由时同步本文件。错误响应统一：`{ code: string, message: string }`，不透传堆栈。
> 状态：M1 认证、M2 上传/解锁/浏览量、M3 后台管理、M4 评论、M5 搜索/瞬间点赞/定时发布、M6 备份、M8 首页模块化、M9 程序更新、M10 更新页数据清理已落地。前台列表/详情由 RSC 直查 Prisma；公开文章/Setting REST 属可选预留，仍未实现。

## 通用约定

- 管理端（`/api/admin/*`、`POST /api/upload`）第一个语句 `await requireAdmin()`，未登录返回 401
- 所有**非 GET/HEAD/OPTIONS**请求须携带 `x-csrf-token` 头（double-submit 校验，Next 16 `proxy.ts` 执行）
- 分页参数：`page`（1 起）、`pageSize`；响应：`{ data: T[], total: number, page, pageSize }`
- 鉴权失败 401；CSRF 失败 403；校验失败 400（zod 首个错误信息）；限速 429；未找到 404

## 公开端点

| 方法 | 路径 | 请求 | 响应/行为 | 状态 |
|---|---|---|---|---|
| POST | `/api/auth/login` | `{username, password}` + CSRF 头 | `{data:{username},csrfToken}` + session cookie；限速 5 次/15 分/IP，**成功登录会清掉该 IP 的记账**（策略源 `lib/auth/login-limit.ts`） | ✅ |
| POST | `/api/auth/setup` | 服务端按状态分派：无管理员且无主机半钥时接收 `{siteName,siteUrl?,subtitle?,username,password,passwordConfirm}` 并创建站点；无管理员但已有主机半钥时仅接收 `{username,password,passwordConfirm}` 重建管理员，不改站点配置或备份口令；已有管理员一律 409。两种模式均带 CSRF、限速 5 次/15 分/IP | ✅ |
| POST | `/api/auth/logout` | CSRF 头 | 销毁 session 与 CSRF cookie | ✅ |
| GET | `/api/auth/csrf` | — | `{token}`（HMAC 绑 session）；`Cache-Control: no-store` | ✅ |
| GET | `/api/posts` | `?page&pageSize&category&tag&q` | 已发布文章列表（密码文无 content/excerpt）；RSC 已覆盖，REST 可选 | 📋 |
| GET | `/api/posts/[slug]` | — | 详情；RSC 已覆盖，REST 可选 | 📋 |
| POST | `/api/posts/[slug]/unlock` | `{password}` + CSRF | 段名可为 `publicId` 或旧 slug；`{data:{unlocked:true,expiresIn:7200}}` + publicId 专属 HttpOnly cookie；错误 401；5 次/15 分/IP+段名 | ✅ |
| POST | `/api/posts/[slug]/view` | CSRF | 段名可为 `publicId` 或旧 slug；`{data:{views,counted}}`；IP+publicId 60s 内重复返回 200 且不增加 | ✅ |
| GET | `/api/moments` | `?page` | 瞬间流（含点赞数/是否已赞） | ✅ |
| POST | `/api/moments/[id]/like` | CSRF | `{data:{liked,likeCount}}`；fingerprint 去重翻转；20 次/分/IP → 429 | ✅ |
| GET | `/api/comments` | `?targetType&targetId&page` | 仅 approved 树形两级；`data` 为顶层+replies；不含 email/ip；密码文未解锁返回空列表 | ✅ |
| POST | `/api/comments` | `{targetType,targetId,nickname,email?,content,parentId?,honeypot?}` | → pending；频控 1 条/60s/IP → 429；蜜罐非空仍 200 且不落库；父评论必须同对象且为顶层；密码文未解锁 401 `LOCKED` | ✅ |
| GET | `/sitemap.xml` | — | 已发布文章/分类/标签；密码文只给 URL；不含 `/admin` | ✅ |
| GET | `/robots.txt` | — | 允许前台；禁止 `/admin`、`/api/admin`、`/api/auth` | ✅ |
| GET | `/rss.xml` | — | 最近 30 篇**非密码**已发布文；摘要已转义 | ✅ |
| GET | `/api/search` | `?q&page` | 标题+公开正文命中；密码文仅标题；空 q 空列表；60 次/分/IP | ✅ |
| GET | `/api/settings/public` | — | 公开配置子集；RSC 已覆盖，REST 可选 | 📋 |
| GET/HEAD | `/api/uploads/[...path]` | 可选 `Range: bytes=...` | 流式文件；Range 206；hash immutable；路径穿越 400。默认 COS 原图 302；`?proxy=1` 不跳转、本地没有则回源 COS | ✅ |

## 管理端点（requireAdmin + CSRF）

| 方法 | 路径 | 说明 | 状态 |
|---|---|---|---|
| GET | `/api/admin/session` | 当前管理员信息 `{data:{username}}` | ✅ |
| GET | `/api/admin/stats` | 文章分状态计数、瞬间数、pending 评论数 | ✅ |
| GET/POST | `/api/admin/posts` | 列表（含 draft/scheduled，`?status&q&page`）/ 新建（含 `bannerStyle`/`bannerColor`/`bannerColor2`/`recommend`/`showRevisedAt`/`authorName`；`authorName` 留空时服务端用管理员笔名兜底） | ✅ |
| GET/PATCH/DELETE | `/api/admin/posts/[id]` | 详情（含 content，`hasPassword`，无 hash，含 banner、`recommend`、`authorName`、`revisedAt`、`showRevisedAt`）/ 更新（PATCH 是部分更新；`revisedAt` 由服务端判定，客户端传值不生效）/ 删除（顺带删该文评论） | ✅ |
| GET/POST | `/api/admin/pen-names` | 笔名清单（写文章页的作者下拉）/ 新建笔名 `{name}`；重名 400 `CONFLICT`（前端会回查已有记录，不阻断） | ✅ |
| POST | `/api/admin/preview` | `{content}`（≤200_000 字）→ `{data:{html}}`；走 `renderMdx` + sanitize，供写文章预览 | ✅ |
| GET/POST | `/api/admin/categories`、`/api/admin/tags` | 分类/标签列表与新建 | ✅ |
| GET/POST | `/api/admin/moments` | 瞬间列表/发布 | ✅ |
| PATCH/DELETE | `/api/admin/moments/[id]` | 编辑/删除（顺带删该瞬间评论） | ✅ |
| GET | `/api/admin/comments` | `?status=pending\|approved&targetType=post\|moment\|board&page`；扁平列表含 email/ip/targetLabel | ✅ |
| POST | `/api/admin/comments` | `{targetType,targetId,content,parentId?}` 管理员回复，直接 approved + isAdmin | ✅ |
| PATCH/DELETE | `/api/admin/comments/[id]` | PATCH `{status:approved\|rejected}`（rejected=删除待审）；DELETE 含级联子回复 | ✅ |
| POST | `/api/upload` | multipart `file` 单文件、可选 `kind=image\|video\|audio`、音频可带 `duration` 秒；魔数+扩展白名单；**只把原图写入本地**（`driver=local`，`pending`）。图片可先收最大 50MB，再按原格式压到 `uploadMaxSizeMB`（默认 10MB）后作为原图。视频/音频仍直接受 `uploadMaxSizeMB` 限制。未配 COS 时也可入库。上传后按 `localMediaMaxMB` 清本地（无 COS 副本的不删） | ✅ |
| POST | `/api/admin/uploads/finalize` | `{hash, step:"derivatives"\|"replicate"}`；`derivatives` 生成本地一级/二级 thumb；`replicate` 把原图+一级 thumb 传到 COS 并改 `driver=cos`。未知 hash `{skipped:true}`；未配 COS 503；幂等 | ✅ |
| GET | `/api/admin/uploads` | 媒体库分页，默认 `createdAt` 倒序；可选 `?kind=image\|video\|audio` | ✅ |
| GET | `/api/admin/uploads/[id]` | `{file,locations,references}`：本地/COS 各路径 URL 与体积（缺文件 `size=null`）；被哪些文章/瞬间引用 | ✅ |
| DELETE | `/api/admin/uploads/[id]` | 默认删本地原图+一级/二级 thumb + COS 并删库。`{keepCos:true}` 或 `?keepCos=1` 只删本地、保留记录与云端。关联文章不再 409，由面板警告 | ✅ |
| POST | `/api/admin/uploads/thumbs/regenerate` | 按 `thumbMaxPx` 重生成缩略图（先本地后 COS 取源，thumb 写本地+COS） | ✅ |
| POST | `/api/admin/uploads/thumbs2/regenerate` | 删除全部 `images/thumbs2/` 后按 `thumb2MaxPx` 重建；只写本地，不上 COS | ✅ |
| POST | `/api/admin/uploads/migrate` | 把本地尚未上云的原图/音视频/thumb 补传到新目录树；HEAD 已存在跳过；未配 COS 503；进行中 409 | ✅ |
| GET/PUT | `/api/admin/settings` | 全量 KV；PUT 只接受已知可写 key（含 COS 五项、`thumbMaxPx`、`thumb2MaxPx`、`backupLocalMaxMB`、`localMediaMaxMB`、`siteStartedAt`、`updateGithubRepo`、`adminAccent`、`dashboardCards`），不含 `lastBackupAt`；GET 不回显 `cosSecretId`/`cosSecretKey`，另给 `cosSecretIdSet`/`cosSecretKeySet`；空字符串表示不改凭证。`adminAccent` 是枚举（6 套预设之一，非法值 400）；`dashboardCards` 落库前归一（未知键丢弃、缺键补 true、非布尔按默认）。两者都**不进公开设置** | ✅ |
| POST | `/api/admin/settings/usage` | 当场扫一次本机 `uploads`/`backups`，返回媒体合计/分项与各备份包体积；打开设置页不扫 | ✅ |
| POST | `/api/admin/cos/test` | 用当前设置 HEAD/List `backups/`；未配齐 503 | ✅ |
| POST | `/api/admin/backup/run` | 手动触发备份（随加密开关打加密或明文包）；同步执行后 `{data:{name,size,createdAt,encrypted,releaseLabel,cosUploaded}}`；已有任务 409；加密开启且未设定备份口令 409 `HOST_SECRET_MISSING` | ✅ |
| PUT | `/api/admin/backup/encrypt` | `{enabled:boolean}` 手设加密开关；打开加密但无口令 409 `HOST_SECRET_MISSING` | ✅ |
| POST | `/api/admin/backup/restore/upload` | multipart `file`（`.tar.gz` 明文包或 v1/v2 加密包）；校验后加入备份列表（可上 COS），不立刻预约恢复 | ✅ |
| GET | `/api/admin/backup/list` | `{data:{files:[{name,size,createdAt,encrypted,releaseLabel,format,channel,version,keyFingerprint,local,cos}],running,lastBackupAt,pendingRestore,passphraseConfigured,encrypt:{enabled,userSet,cosHttps},appRelease}}` | ✅ |
| POST | `/api/admin/backup/pull` | `{name}` 从 COS `backups/` 拉回本地（managed 文件名） | ✅ |
| GET/POST | `/api/admin/backup/passphrase` | GET `{configured}`；POST `{passphrase,confirm}` 后台设定一次备份口令，已存在 409 `HOST_SECRET_LOCKED` | ✅ |
| GET | `/api/admin/backup/download/[file]` | 下载；本地没有则先从 COS 拉回；文件名须为本机生成包或上传包 | ✅ |
| DELETE | `/api/admin/backup/[file]` | 删除本地 + COS；白名单与路径校验同下载；已预约恢复的包 409 `RESTORE_PENDING` | ✅ |
| POST | `/api/admin/backup/restore` | `{name,confirm:true}`；校验后只写入预约，站点继续运行；已有预约更新 409 `UPDATE_PENDING`；`{data:{pending,restarting:false,name,requestedAt,restartAt,safetyBackup}}` | ✅ |
| PUT | `/api/admin/backup/restore` | `{restartNow:true}` 立刻重启，或 `{restartAt:ISO}` 预约重启时间（必须晚于现在）；无预约 404 | ✅ |
| GET/PUT | `/api/admin/account` | GET `{id,username,penName,mustChangeCredentials}`；PUT `{currentPassword,penName?,username?,newPassword?}`，三项至少改一项（`penName` 允许空串=清掉，改笔名会立即失效前台文章缓存，见 P-089）；首次使用必须带新密码。这两个端点是唯一允许 `mustChangeCredentials=true` 的管理 API，其它 `/api/admin/*` 回 403 `CREDENTIALS_CHANGE_REQUIRED` | ✅ |
| DELETE | `/api/admin/backup/restore` | 取消预约；`{data:{ok:true}}` | ✅ |
| GET/PUT | `/api/admin/home/layout` | 首页格点。GET 返回 `{moduleId,...,enabled,col,colSpan,row,hPct,mobileCol,mobileColSpan,mobileRow,mobileHPct,sort}`；PUT `{items:[{moduleId,enabled,col,colSpan,row,hPct,mobileCol,mobileColSpan,mobileRow,mobileHPct}]}` 整表替换。桌面/手机两套几何，越界收进 12 列，`hPct` 0–100（0=随内容），`sort` 按桌面 `row,col` 重算 | ✅ |
| GET/POST | `/api/admin/modules` | 模块目录列表（含 `blockCount`/`hasCode`/`enabled`）/ 新建 custom `{name,html?,css?,js?,blocks?,config?}` → 201 `{data:{id}}` | ✅ |
| GET/PATCH/DELETE | `/api/admin/modules/[id]` | 详情 `{module,placement}` / 修改（内置只接受 `name`+`config`，代码与积木被忽略）/ 删除（内置 409 `SYSTEM_MODULE`，仍在首页启用中 409 `MODULE_IN_USE`） | ✅ |
| GET | `/api/admin/update` | `{data:{appRelease,pendingUpdate,restorePending,lastApply,files:[{name,size,createdAt,channel,version,label,packedAt,fileCount}]}}` | ✅ |
| POST | `/api/admin/update/pack` | 把当前程序打成 `data/updates/myblog-update-….tar.gz`；`{data:{name,size,fileCount,createdAt}}`；已有打包任务 409 `UPDATE_BUSY`；备份进行中 409 `BACKUP_BUSY`；最长 120s | ✅ |
| POST | `/api/admin/update/upload` | multipart `file`（`.tar.gz`，≤512MB）；检视白名单后入库，不立刻应用；含 `data/`/`.env`/`..` 或缺少 `package.json`/`src/` 则 400 | ✅ |
| GET | `/api/admin/update/download/[file]` | 下载；文件名须为本机打包或导入包 | ✅ |
| DELETE | `/api/admin/update/[file]` | 删除包与 sidecar；已预约应用该包 409 `UPDATE_PENDING` | ✅ |
| POST | `/api/admin/update/apply` | `{name,confirm:true}` 只写入预约；已有预约恢复 409 `RESTORE_PENDING`；预约前尝试 `runBackup()`（失败只记日志仍保留预约）；`{data:{pending,restarting:false,name,requestedAt,restartAt,safetyBackup}}` | ✅ |
| PUT | `/api/admin/update/apply` | `{restartNow:true}` 立刻重启，或 `{restartAt:ISO}`（必须晚于现在）；无预约 404 | ✅ |
| DELETE | `/api/admin/update/apply` | 取消预约；`{data:{ok:true}}` | ✅ |
| GET/POST | `/api/admin/update/github` | GET 解析 Setting `updateGithubRepo`，列公开 Release 中 `myblog-update-*.tar.gz` 资产；POST `{tag}` 下载并 `stageImportedUpdate`。未填仓库 400；只管理员点检查时请求 | ✅ |
| POST | `/api/admin/update/clear` | `{targets:["data"|"admin"],confirmation,acknowledged:true}`；范围可同时选两项，确认短语必须精确匹配（`删除数据` / `删除管理员账号` / `删除数据和管理员账号`）。返回一次性 `operationId`、`executeAt`、`serverNow`、`waitMs`；只创建待确认操作，不立即删除 | ✅ |
| PUT | `/api/admin/update/clear` | `{operationId}`；绑定创建令牌的管理员，服务端时间未到 `executeAt` 返回 409 `WAIT_REQUIRED`，到时消费令牌并清理。`data` 会清内容表、媒体、本地/COS 对象、备份/更新暂存；`admin` 会删除全部管理员；两项同选后销毁当前 session | ✅ |
| DELETE | `/api/admin/update/clear` | `{operationId}`；当前管理员可在执行前使令牌失效，返回 `{data:{cancelled:true}}` | ✅ |

`html`/`css`/`js` 各限 32KB，只有管理员可写且**不过** sanitize（pitfalls P-034）。三个写端点成功后都调 `revalidatePublicContent()` 刷新 `/`。
