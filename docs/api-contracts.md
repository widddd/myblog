# api-contracts.md — API 路由契约

> 新增/修改路由时同步本文件。错误响应统一：`{ code: string, message: string }`，不透传堆栈。
> 状态：M1 认证、M2 上传/解锁/浏览量、M3 后台管理、M4 评论、M5 搜索/瞬间点赞/定时发布、M6 备份、M8 首页模块化、M9 程序更新、M10 更新页数据清理、瞬间可见范围（全局可见期 + 可见范围组；开发库迁移已应用，生产首次部署前需执行一次迁移）、**静态页面（后台建页 + 可配置目录，开发库迁移已应用）**已落地。前台列表/详情由 RSC 直查 Prisma；公开文章/Setting REST 属可选预留，仍未实现。

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
| GET | `/api/upload/limits` | — | `{maxImages,maxBytes,imageTypes}`；公开只读，给 Android 壳决定「相册里一次能选几个」。**两个数都在后台设置页可改**：`maxImages` ← `uploadMaxImagesPerBatch`，`maxBytes` ← `uploadMaxSizeMB`；换算分别走 `lib/upload/limits.ts` 的 `resolveMaxImagesPerBatch()` / `resolveUploadMaxBytes()` —— 后者与 `handleUpload()` 是**同一个函数**，保证"接口说的"和"上传时会怎样"一致。**2026-10 起 App 还拿 `maxBytes` 当视频压缩的目标体积**（压完必须塞得进这个上限，取不到就按 10MB 兜底：`MainActivity.DEFAULT_MAX_BYTES`），所以改这个设置会同时改变 App 的压缩力度。生效时机：同一个进程里 `setSetting()` 写完**立即**刷新缓存，下一次 GET 就是新值；`getSetting` 的 60s 进程内缓存只在值由**别的进程**写入或直接改库时才咬合。响应带 `Cache-Control: public, max-age=300`——**中间有反代/CDN 且它缓存了这条响应时，客户端最多可能拿到 5 分钟旧值** | ✅ |
| GET | `/api/posts` | `?page&pageSize&category&tag&q` | 已发布文章列表（密码文无 content/excerpt）；RSC 已覆盖，REST 可选 | 📋 |
| GET | `/api/posts/[slug]` | — | 详情；RSC 已覆盖，REST 可选 | 📋 |
| POST | `/api/posts/[slug]/unlock` | `{password}` + CSRF | 段名可为 `publicId` 或旧 slug；`{data:{unlocked:true,expiresIn:7200}}` + publicId 专属 HttpOnly cookie；错误 401；5 次/15 分/IP+段名 | ✅ |
| POST | `/api/posts/[slug]/view` | CSRF | 段名可为 `publicId` 或旧 slug；`{data:{views,counted}}`；IP+publicId 60s 内重复返回 200 且不增加 | ✅ |
| GET | `/api/moments` | `?page` | 瞬间流（含点赞数/是否已赞）。**带可见期过滤**：只回未过期瞬间（生效天数 = min(Setting `momentVisibleDays`, 所用可见范围组的天数)，0 = 不限制） | ✅ |
| POST | `/api/moments/[id]/like` | CSRF | `{data:{liked,likeCount}}`；fingerprint 去重翻转；20 次/分/IP → 429。**已过期瞬间按「不存在」处理 → 404**（与列表同一个可见期 where） | ✅ |
| GET | `/api/comments` | `?targetType&targetId&page` | 仅 approved 树形两级；`data` 为顶层+replies；不含 email/ip；密码文未解锁返回空列表。**瞬间目标同样按可见期过滤**：不在可见期内直接返回空列表 `{data:[],total:0}`（读取侧与写入侧一致，不再只靠写入 404） | ✅ |
| POST | `/api/comments` | `{targetType,targetId,nickname,email?,content,parentId?,honeypot?}` | → pending；频控 1 条/60s/IP → 429；蜜罐非空仍 200 且不落库；父评论必须同对象且为顶层；密码文未解锁 401 `LOCKED`；**目标瞬间不在可见期内 404**（读/写两侧都走同一个可见期判定） | ✅ |
| GET | `/sitemap.xml` | — | 已发布文章/分类/标签/**启用中的静态页面**（`/{dir}/{slug}`，priority 0.4，目录读 Setting `staticPagesDir`）；密码文只给 URL；不含 `/admin` | ✅ |
| GET | `/robots.txt` | — | 允许前台；禁止 `/admin`、`/api/admin`、`/api/auth` | ✅ |
| GET | `/rss.xml` | — | 最近 30 篇**非密码**已发布文；摘要已转义。**只管文章，不含瞬间**（理由与"多久能看到新文"的时效口径写在 `src/app/rss.xml/route.ts` 的文件注释里）；`Cache-Control: public, s-maxage=30, stale-while-revalidate=120` = 订阅者最坏约 2.5 分钟看到新文 | ✅ |
| GET | `/api/client/status` | — | `{app,admin,username}`：`app` = 这一发是不是 SmartBlog App（UA 标记，判定 `lib/client/detect.ts`）；`admin` = 这一发是否已登录后台（`isAuthenticatedSession` + `findAdminAccount`）。给 App 的通知层用：**管理员不收自己站点的推送**。`Cache-Control: no-store`（随 cookie 变化，被缓存会把管理员误判成访客）。**不是鉴权接口**，不授予任何权限 | ✅ |
| GET | `/api/feed/updates` | `?since=<ISO>&limit=<n>` | 增量内容（文章 + 瞬间）：`{serverTime,nextCursor,posts[],moments[]}`。`since` 缺省 = 回最新一批（建基线，**不该拿去弹通知**）；`since` 非法（非带 `T` 的 ISO）= 400；游标按 `createdAt` 走，`nextCursor` 用**服务端时间**（不依赖手机时钟）；瞬时不解析图片（通知只显示一行字），按可见期过滤。管理员视角带上未发布/密码文，且 `private, no-store`；访客视角 `public, max-age=15`、内容进 `cachedPublic`（桶化游标 15s）。**App 通知的兜底源**（RSS 只有文章），见 `docs/android/push-plan.md` | ✅ |
| GET | `/api/search` | `?q&page` | 标题+公开正文命中；密码文仅标题；空 q 空列表；60 次/分/IP | ✅ |
| GET | `/api/settings/public` | — | 公开配置子集；RSC 已覆盖，REST 可选 | 📋 |
| GET/HEAD | `/api/uploads/[...path]` | 可选 `Range: bytes=...` | 流式文件；Range 206；hash immutable；路径穿越 400。默认 COS 原图 302；`?proxy=1` 不跳转、本地没有则回源 COS | ✅ |

## 管理端点（requireAdmin + CSRF）

| 方法 | 路径 | 说明 | 状态 |
|---|---|---|---|
| GET | `/api/admin/session` | 当前管理员信息 `{data:{username}}` | ✅ |
| GET | `/api/admin/stats` | 文章分状态计数、瞬间数、pending 评论数 | ✅ |
| GET/POST | `/api/admin/posts` | 列表（含 draft/scheduled，`?status&q&page`）/ 新建（含 `coverStyle`（`image/solid/gradient/none`）、`coverColor`、`coverColor2`、`bannerStyle`（`cover/image/solid/gradient`）、`bannerImage`、`bannerColor`、`bannerColor2`、**`coverFocalX/Y`、`bannerFocalX/Y`**（0–100 整数，缺省 50）/`recommend`/`showRevisedAt`/`authorName`；`authorName` 留空时服务端用管理员笔名兜底） | ✅ |
| GET/PATCH/DELETE | `/api/admin/posts/[id]` | 详情（含 content，`hasPassword`，无 hash，含封面/Banner 两组独立配置、焦点、`recommend`、`authorName`、`revisedAt`、`showRevisedAt`）/ 更新（PATCH 是部分更新，封面与 Banner 字段各自校验；`revisedAt` 由服务端判定，客户端传值不生效）/ 删除（顺带删该文评论） | ✅ |
| GET/POST | `/api/admin/pen-names` | 笔名清单（写文章页的作者下拉）/ 新建笔名 `{name}`；重名 400 `CONFLICT`（前端会回查已有记录，不阻断） | ✅ |
| POST | `/api/admin/preview` | `{content}`（≤200_000 字）→ `{data:{html}}`；走 `renderMdx` + sanitize，供写文章预览 | ✅ |
| GET/POST | `/api/admin/categories`、`/api/admin/tags` | 分类/标签列表与新建 | ✅ |
| GET/POST | `/api/admin/moments` | 瞬间列表（含 `visibility`：生效天数/到期时刻/是否过期/被谁收紧、`visibilityText` 短语）/ 发布（可选 `visibilityGroupId`；组不存在 404）。`content` 允许为空（只发媒体也成立）：跨字段规则是「文字或媒体至少一个」+「视频 ≤ 1 个」+「**语音 ≤ 5 条且单条 ≤ 5 分钟**」，判定唯一入口 `lib/moments/compose-rules.ts` 的 `momentContentError()`（POST 走 schema refine，PATCH 合并现有行后再判）；媒体项 `key/thumb/width/height` 之外可带 `kind:"image"\|"video"\|"audio"`（缺省 = 图片，旧数据零改动）、`mime`、`duration`，语音还可带 `peaks`（0–100 的整数数组，最多 48 个；拿不到就不写，渲染端用确定性图案兜底）。**视频时长 > 30 分钟一律拒**（`MOMENT_MAX_VIDEO_MS` / `MOMENT_VIDEO_TOO_LONG_ERROR`，与 Android 侧 `CompressPolicy.MAX_DURATION_MS` 同口径）；**语音同理 5 分钟**（`MOMENT_MAX_AUDIO_MS`，与 Android `VoiceRecorderPolicy.MAX_DURATION_MS` 同口径）。服务端只在客户端声明了 `duration` 时才判得出来 —— 浏览器直传媒体库的文件没有时长探测，那条路靠发布端与 App 拦。**数组上限 14**（非音频 9 + 语音 5，语音不占图片/视频那 9 个名额） | ✅ |
| PATCH/DELETE | `/api/admin/moments/[id]` | 编辑/删除（顺带删该瞬间评论）。PATCH 是部分更新：`visibilityGroupId` 传 `null` = 显式改回「跟随全局可见期」，不传 = 不动；`momentPatchSchema` 是「基础对象 `.partial()`」，跨字段规则由 `updateAdminMoment()` 合并现有行后用同一个 `momentContentError()` 判（`.partial()` 套不上 refine，见 P-182） | ✅ |
| GET/POST | `/api/admin/moment-groups` | 可见范围组列表（`{globalDays, groups:[{id,name,days,daysLabel,effectiveDays,effectiveLabel,cappedByGlobal}]}`）/ 新建 `{name,days}` → 201；重名 409 | ✅ |
| GET/PATCH/DELETE | `/api/admin/moment-groups/[id]` | GET = **删除前预览** `{id,name,days,affectedMoments,globalDays,globalLimited,fallbackNote}`；PATCH = 改名/改天数（空对象 400，重名 409）；DELETE 不删瞬间，用它的瞬间回落全局可见期 | ✅ |
| GET | `/api/admin/comments` | `?status=pending\|approved&targetType=post\|moment\|board&page`；扁平列表含 email/ip/targetLabel | ✅ |
| POST | `/api/admin/comments` | `{targetType,targetId,content,parentId?}` 管理员回复，直接 approved + isAdmin | ✅ |
| PATCH/DELETE | `/api/admin/comments/[id]` | PATCH `{status:approved\|rejected}`（rejected=删除待审）；DELETE 含级联子回复 | ✅ |
| POST | `/api/upload` | multipart `file` 单文件、可选 `kind=image\|video\|audio`、音频可带 `duration` 秒、**图片可带 `albumId`（上传时直接归册，媒体库上传预览用；写盘前校验相册存在，非法 id 返回 404 不留孤儿文件；只对图片生效）与可选 `volumeId`（归入该相册里的某一卷；必须与 `albumId` 同时给、且这一卷属于该相册，否则写盘前 400 `VOLUME_WITHOUT_ALBUM` / `VOLUME_ALBUM_MISMATCH`，同样不留孤儿文件；同内容去重命中已有记录时相册与卷**一起**套用，没带卷就写 null）**；魔数+扩展白名单；**只把原图写入本地**（`driver=local`，`pending`）。图片可先收最大 50MB，再按原格式压到 `uploadMaxSizeMB`（默认 10MB）后作为原图。视频/音频仍直接受 `uploadMaxSizeMB` 限制。未配 COS 时也可入库。上传后按 `localMediaMaxMB` 清本地（无 COS 副本的不删）。**2026-10-11 追加：`kind=audio` 时按容器轨道结构复核** —— `file-type` 只看 `ftyp` 主品牌 / EBML DocType，音频-only 的 WebM/MP4 会被判成 `video/*`（浏览器 `MediaRecorder` 与 Android 录音都命中），所以调用方声明 audio 时走 `lib/upload/audio-container.ts`：确有音频轨且无视频轨 → 按 `audio/webm`(weba) / `audio/mp4`(m4a) 收，否则照旧 `MEDIA_KIND_MISMATCH`；畸形一律失败关闭（P-188）。**媒体库类型分区**走已有的 `GET /api/admin/uploads?kind=audio`（单值/逗号多值都支持，见下条） | ✅ |
| POST | `/api/admin/uploads/finalize` | `{hash, step:"derivatives"\|"replicate"}`；`derivatives` 生成本地一级/二级 thumb；`replicate` 把原图+一级 thumb 传到 COS 并改 `driver=cos`。未知 hash `{skipped:true}`；**未配 COS 时 `replicate` 直接返回 `{skipped:true}`（跳过上云，不是错误）**——媒体库上传、文章保存发布、发瞬间都走这条路，纯本地站点必须能跑（P-145）；幂等 | ✅ |
| GET | `/api/admin/uploads/finalize/progress` | `?hash=`（必须 64 位 hex）→ `{data:{progress}}`，`progress` 为 `{stage:"derivatives"\|"replicate", percent:0–100, loadedBytes, totalBytes, updatedAt}` 或 `null`。客户端在 `POST …/finalize` 还没返回时每 400ms 轮询它画进度条（服务端把每一步写进进程内登记表 `lib/uploads/progress.ts`，上云那一步的字节数来自真实传输）。**设计上刻意不做流式响应**：生产入口是 nginx，流式会被缓冲到请求结束才吐给浏览器。hash 非法 / 已无记录都回 `progress:null`，不用 4xx 打断正在进行的发布 | ✅ |
| GET | `/api/admin/uploads` | 媒体库分页，默认 `createdAt` 倒序；可选 `?kind=image\|video\|audio`（**2026-10 起支持逗号分隔多值**，如 `kind=image,video` —— 瞬间配图的媒体库选择器要同时选图片和视频；解析走 `lib/uploads/locations.ts` 的 `mimePrefixesForKinds()`，空/未知值 = 不过滤，与旧单值行为一致）、`?album=<id\|none>`（`none` = 只看未分类）。每项带 `album:{id,title,slug}\|null` 与 `volumeId:number\|null`（媒体库卡片的相册 / 卷下拉据此回显） | ✅ |
| GET | `/api/admin/uploads/[id]` | `{file,locations,references}`：本地/COS 各路径 URL 与体积（缺文件 `size=null`）；被哪些文章/瞬间引用 | ✅ |
| PATCH | `/api/admin/uploads/[id]` | 单张改归属 `{albumId?:number\|null, volumeId?:number\|null}`（至少给一个）：`albumId:null` = 移出相册，`volumeId:null` = 放回该相册的「未分类」；**换成另一个相册时卷一并清零**（不变量：卷必须属于照片所在相册），`volumeId` 由 `setUploadVolume()` 校验同相册（越界 400）、移出相册同时带卷 400；只接受图片（非图片 400，相册不存在 404）；响应是改完的 `UploadResult`；写后立即过期相册缓存 | ✅ |
| DELETE | `/api/admin/uploads/[id]` | 默认删本地原图+一级/二级 thumb + COS 并删库。`{keepCos:true}` 或 `?keepCos=1` 只删本地、保留记录与云端。关联文章不再 409，由面板警告 | ✅ |
| POST | `/api/admin/uploads/thumbs/regenerate` | 按 `thumbMaxPx` 重生成缩略图（先本地后 COS 取源，thumb 写本地+COS） | ✅ |
| POST | `/api/admin/uploads/thumbs2/regenerate` | 删除全部 `images/thumbs2/` 后按 `thumb2MaxPx` 重建；只写本地，不上 COS | ✅ |
| POST | `/api/admin/uploads/migrate` | 把本地尚未上云的原图/音视频/thumb 补传到新目录树；HEAD 已存在跳过；未配 COS 503；进行中 409 | ✅ |
| GET/POST | `/api/admin/albums` | 相册列表（含封面缩略图与图片张数）/ 新建 `{title,slug?,description?,enabled?,sort?}` → 201。`slug` 留空则从标题生成并自动去重；手填撞名 409 | ✅ |
| GET/PATCH/DELETE | `/api/admin/albums/[id]` | GET `{album,images,imagesTruncated}`（图片最多列 240 张）；PATCH 改标题/地址名/说明/开关/排序/**封面 `coverId:number\|null`**（`null` = 用第一张；封面必须是本相册里的图片，否则 400）；DELETE 返回 `{id,slug,title,affectedImages}`，**只解绑不删图** | ✅ |
| POST/DELETE | `/api/admin/albums/[id]/uploads` | POST `{uploadIds:number[]}`（≤500）批量归册 → `{assigned,skipped,total}`，非图片与不存在的 id 记进 `skipped` 不报错；DELETE 同形状批量移出 → `{removed}` | ✅ |
| GET/POST/PATCH | `/api/admin/albums/[id]/volumes` | 卷列表（按 sort→id，带各自照片张数）/ POST `{title?}` 新建（留空 = 自动「第 N 卷」并排到末尾，标题 ≤60 字）/ PATCH `{ids:number[]}` 重排（按给定顺序写 sort，没列出的卷保持原样排在其后） | ✅ |
| PATCH/DELETE | `/api/admin/albums/[id]/volumes/[volumeId]` | PATCH `{title?,sort?}` 改名 / 改排序（标题非空、≤60 字）；DELETE 删卷返回 `{id,albumId,affectedImages}`，**只解绑不删图**——卷里的照片回到相册的「未分类」。卷必须属于路径上的那个相册，否则 404 | ✅ |
| POST/DELETE | `/api/admin/albums/[id]/volume-uploads` | POST `{uploadIds:number[],volumeId:number}`（≤500）批量归卷 → `{updated,skipped,total}`，**只影响本来就在这个相册里的图片**（卷必须属于该相册，跨相册/非图片/不存在记进 `skipped` 不报错）；DELETE `{uploadIds}` 批量移出卷（回「未分类」，照片仍留在相册里） | ✅ |
| GET/PUT | `/api/admin/settings` | 全量 KV；PUT 只接受已知可写 key（含 COS 五项、`thumbMaxPx`、`thumb2MaxPx`、`localMediaMaxMB`、**`momentVisibleDays`（瞬间全局可见期 0–3650，0 = 永久公开）**、**`backupPeriodDays` / `backupAtTime`（周期备份的每几天 + 几点几分，`HH:MM` 服务器本地时间，先 trim 再校验，区间取 `lib/backup/schedule.ts` 的 `BACKUP_LIMITS`）**、`backupKeep`、`backupLocalMaxMB`、`siteStartedAt`、**`homeBadgeColor`（空=主题色，或 `#RRGGBB`）/ `homeBadgeOpacity`（0–100）**、`updateGithubRepo`、`adminAccent`、`dashboardCards`），不含 `lastBackupAt`；GET 不回显 `cosSecretId`/`cosSecretKey`，另给 `cosSecretIdSet`/`cosSecretKeySet`；空字符串表示不改凭证。`adminAccent` 是枚举（6 套预设之一，非法值 400）；`dashboardCards` 落库前归一（未知键丢弃、缺键补 true、非布尔按默认）。两者都**不进公开设置** | ✅ |
| POST | `/api/admin/settings/usage` | 当场扫一次本机 `uploads`/`backups`，返回媒体合计/分项与各备份包体积；打开设置页/备份页都不扫 | ✅ |
| POST | `/api/admin/cos/test` | 用当前设置 HEAD/List `backups/`；未配齐 503 | ✅ |
| POST | `/api/admin/backup/run` | 手动触发备份（随加密开关打加密或明文包）；**只等本地包落盘**，返回 `{data:{name,size,createdAt,encrypted,releaseLabel,cosUploadQueue:"queued"\|"skipped"}}`，上云在响应之后跑（进度看 list 的 `cosUpload`，见 P-158）；已有任务 409；加密开启且未设定备份口令 409 `HOST_SECRET_MISSING` | ✅ |
| POST | `/api/admin/backup/push` | `{name}` 把**只在本机**的备份排进后台上传队列（手动补传 / 重试）：本地没有该包 404 `NOT_FOUND`，没配 COS 503 `COS_NOT_CONFIGURED`；返回 `{data:{name,cosUpload:"queued"}}`，不等上传 | ✅ |
| PUT | `/api/admin/backup/encrypt` | `{enabled:boolean}` 手设加密开关；打开加密但无口令 409 `HOST_SECRET_MISSING` | ✅ |
| POST | `/api/admin/backup/restore/upload` | multipart `file`（`.tar.gz` 明文包或 v1/v2 加密包）；校验后加入备份列表（**同样排后台上传**，返回 `cosUploadQueue`），不立刻预约恢复 | ✅ |
| GET | `/api/admin/backup/list` | `{data:{files:[{name,size,createdAt,encrypted,releaseLabel,format,channel,version,keyFingerprint,local,cos,cosUpload?:{status:"queued"\|"uploading"\|"failed",attempts,updatedAt,error?}}],running,lastBackupAt,pendingRestore,passphraseConfigured,cosConfigured,encrypt:{enabled,userSet,cosHttps},appRelease}}` | ✅ |
| POST | `/api/admin/backup/pull` | `{name}` 从 COS `backups/` 拉回本地（managed 文件名） | ✅ |
| GET/POST | `/api/admin/backup/passphrase` | GET `{configured}`；POST `{passphrase,confirm}` 后台设定一次备份口令，已存在 409 `HOST_SECRET_LOCKED` | ✅ |
| GET | `/api/admin/backup/download/[file]` | 下载；本地没有则先从 COS 拉回；文件名须为本机生成包或上传包 | ✅ |
| DELETE | `/api/admin/backup/[file]` | 删除本地 + COS；白名单与路径校验同下载；已预约恢复的包 409 `RESTORE_PENDING` | ✅ |
| POST | `/api/admin/backup/restore` | `{name,confirm:true}`；校验后只写入预约，站点继续运行；已有预约更新 409 `UPDATE_PENDING`；`{data:{pending,restarting:false,name,requestedAt,restartAt,safetyBackup}}` | ✅ |
| PUT | `/api/admin/backup/restore` | `{restartNow:true}` 立刻重启，或 `{restartAt:ISO}` 预约重启时间（必须晚于现在）；无预约 404 | ✅ |
| GET/PUT | `/api/admin/account` | GET `{id,username,penName,mustChangeCredentials}`；PUT `{currentPassword,penName?,username?,newPassword?}`，三项至少改一项（`penName` 允许空串=清掉，改笔名会立即失效前台文章缓存，见 P-089）；首次使用必须带新密码。这两个端点是唯一允许 `mustChangeCredentials=true` 的管理 API，其它 `/api/admin/*` 回 403 `CREDENTIALS_CHANGE_REQUIRED` | ✅ |
| DELETE | `/api/admin/backup/restore` | 取消预约；`{data:{ok:true}}` | ✅ |
| GET/PUT | `/api/admin/home/layout` | 首页格点。GET 返回 `{moduleId,...,enabled,col,colSpan,row,hPct,mobileCol,mobileColSpan,mobileRow,mobileHPct,sort}`；PUT `{items:[{moduleId,enabled,col,colSpan,row,sort?,hPct,mobileCol,mobileColSpan,mobileRow,mobileHPct}]}` 整表替换。桌面/手机两套几何，越界收进 12 列，`hPct` 0–1200（0=随内容、其余为像素，见 P-139）。`sort` 是**同格堆叠顺序**（两个视口共用一列）：批量带上时按 `(row,col,sort,payloadOrder)` 排并重编号 0…n-1，不传时退回「payload 顺序」的旧口径；响应回带整表（保存后回写本地，保证刷新前后一致） | ✅ |
| GET/POST | `/api/admin/modules` | 模块目录列表（含 `blockCount`/`hasCode`/`enabled`）/ 新建 custom `{name,html?,css?,js?,blocks?,config?,placement?}` → 201 `{data:{id}}`；带 `placement` 时一并建一条**未启用**的格点（模板的默认几何） | ✅ |
| GET/PATCH/DELETE | `/api/admin/modules/[id]` | 详情 `{module,placement}` / 修改（自建模块与**可编辑内置模块**（推荐应用）可改 `html/css/js`；积木仍只给自建；其余内置只接受 `name`+`config`）/ 删除（内置 409 `SYSTEM_MODULE`，仍在首页启用中 409 `MODULE_IN_USE`） | ✅ |
| POST | `/api/admin/modules/import` | 导入文件解析：`{fileName, content}` → `{field, html, css, js, notes[]}`。HTML 里的 `<style>` / `<script>`（无 `src`）自动分栏，外链脚本留在 HTML；超 32KB 截断并在 `notes` 里说明。**只解析不落库**（保存仍走 PATCH）；不认识的扩展名 400 | ✅ |
| GET/POST | `/api/admin/pages` | 静态页面列表（`{dir, reserved:[{segment,decision,reason}], items:[{id,slug,title,description,enabled,hasCode,codeSize,href}]}`）/ 新建 `{slug,title,description?,html?,css?,js?,enabled?}` → 201 `{data:{id}}`；地址名占用 409 `SLUG_TAKEN`、保留段 400 | ✅ |
| GET/PATCH/DELETE | `/api/admin/pages/[id]` | 详情（含三段代码）/ 部分更新 / 删除。地址名与目录的合法性都在服务端再判一次，不依赖前端校验 | ✅ |
| GET/PUT | `/api/admin/pages/dir` | 静态页面目录（单值）。GET `?dir=xxx` 是**改目录前的体检** `{ok,message,from,to,affected}`（`affected` = 会因地址整体搬迁而受影响的已启用页面数）；PUT `{staticPagesDir}` 落库并 `revalidatePublicContent()`。目录名保留段 400 | ✅ |
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
| PUT | `/api/admin/update/clear` | `{operationId}`；绑定创建令牌的管理员，服务端时间未到 `executeAt` 返回 409 `WAIT_REQUIRED`，到时消费令牌并清理。`data` 会清内容表（含 `MomentVisibilityGroup`、`PenName`，清单见 `lib/data-clear/coverage.ts`）、媒体、本地/COS 对象、备份/更新暂存，响应里的 `deleted` 给出逐表条数（`posts`/`categories`/`tags`/`postTags`/`penNames`/`moments`/`momentLikes`/`momentVisibilityGroups`/`comments`/`uploads`/`backupSecrets`/`admins`）；`admin` 会删除全部管理员；两项同选后销毁当前 session | ✅ |
| DELETE | `/api/admin/update/clear` | `{operationId}`；当前管理员可在执行前使令牌失效，返回 `{data:{cancelled:true}}` | ✅ |

`html`/`css`/`js` 各限 32KB，只有管理员可写且**不过** sanitize（pitfalls P-034）。三个写端点成功后都调 `revalidatePublicContent()` 刷新 `/`。

静态页面的 `html`/`css`/`js` 是**同一条决策**（管理员内容面，P-034）：各限 32KB、只有管理员可写、不过 sanitize，前台地址 `/{Setting staticPagesDir}/{slug}`。上面四个写端点也都在成功后 `revalidatePublicContent()`。
