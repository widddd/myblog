# module.md — 模块注册表（防重复造轮子）

> **写代码前必读本文件**。新增功能先查这里：已存在则复用或扩展，严禁平行重写。
> 维护规则：新增/删除/重命名源码文件时必须同步本表（见 agents-maintenance.md 触发表）。

**项目当前阶段**：M9 程序更新进行中（代码主路径已落地，见 PLAN.md）；M8 首页模块化已完成；M7 Linux 部署演练暂缓。下表按实际导出 API 标注状态（✅ 已实现 / 🚧 进行中 / 📋 规划）。

## 模块分组

### lib/（服务端核心）

| 模块路径 | 核心 API | 用途 | 状态 |
|---|---|---|---|
| `src/lib/db-path.ts` | `resolveDatabasePath()`、`DATABASE_PATH` | 只解析库路径，不连 Prisma；恢复链路必须走这里 | ✅ |
| `src/lib/db.ts` | `prisma`、`DATABASE_PATH`、`getSqliteHandle()`、`disconnectDatabase()` | Prisma Client 单例；Windows 安全路径；WAL/busy_timeout；备份专用句柄；重启前断连 | ✅ |
| `src/lib/bootstrap.ts` | `initializeApplication()` | 无管理员时告警并依赖创建页 / `pnpm setup`；默认 Setting 与 11 个内置首页模块幂等初始化 | ✅ |
| `src/lib/settings.ts` | `getSetting()`、`setSetting()`、`settingIsStored()`、`getPublicSettings()`、`getAdminSettings()`、`ensureDefaultSettings()`、`displaySiteName()` | Setting KV + TTL 60 秒/最多 64 项缓存 + 公开子集（不含 COS 密钥，含 `siteStartedAt`）；`siteName` 默认空，公开面空则显示「博客」；管理端含 `thumbMaxPx`/`thumb2MaxPx`/`backupLocalMaxMB`/COS 五项/`updateGithubRepo`，`cosSecretId`/`cosSecretKey` 只写不回显。`backupEncrypt` 不进默认表、不进设置表单，只由备份页开关写入 | ✅ |
| `src/lib/auth/session.ts` | `getSession()`、`createSession()`、`destroySession()` | iron-session 7 天会话；HttpOnly/Secure/Lax cookie | ✅ |
| `src/lib/auth/password.ts` | `hashPassword()`、`verifyPassword()`、`verifyPasswordAgainstKnownOrDummy()` | bcryptjs cost 12；登录对不存在用户也走一遍 dummy hash | ✅ |
| `src/lib/auth/must-change.ts` | `hasPendingCredentialChange()` | 读 `mustChangeCredentials`；不 import guard，避免循环 | ✅ |
| `src/lib/auth/guard.ts` | `requireAdmin()`、`UnauthorizedError`、`CredentialsChangeRequiredError` | API 守卫；未改初始密码除账号接口外一律 403 | ✅ |
| `src/lib/auth/initial-setup.ts` | `hasAdminUser()`、`runInitialSetup()` | 零管理员且无半钥时写入站点名/管理员/半钥/运行时间；创建页与 `pnpm setup` 共用 | ✅ |
| `src/lib/auth/csrf.ts` | `issueCsrfToken()`、`verifyCsrfToken()`、`verifyCsrfRequest()` | double-submit，HMAC 绑定加密 session | ✅ |
| `src/lib/auth/rateLimit.ts` | `rateLimit()`、`clearRateLimit()` | 内存滑动窗口，最多 2000 个桶 | ✅ |
| `src/lib/client/csrf.ts` | `fetchCsrfToken()` | client 组件统一获取 double-submit token | ✅ |
| `src/lib/storage/types.ts` | `StorageDriver`、`normalizeStorageKey()` | put/get/getUrl/delete/stat/listKeys/openReadStream；POSIX key 与路径校验 | ✅ |
| `src/lib/storage/local.ts` | `LocalDriver` | data/uploads 原子写入、流式/Range 读取 | ✅ |
| `src/lib/storage/cos.ts` | `CosDriver`、`testCosConnection()` | 腾讯云 COS：put/putFile/get/getToFile/delete/stat/listKeys | ✅ |
| `src/lib/storage/cos-config.ts` | `loadCosSettings()`、`buildCosPublicBaseUrl()` | COS 凭证从 Setting 读；公开 URL；未配齐抛 `CosNotConfiguredError` | ✅ |
| `src/lib/storage/index.ts` | `getDriver()`、`normalizeDriverName()` | 本地/COS 驱动唯一工厂；历史 `oss` 当 `cos` | ✅ |
| `src/lib/storage/media-keys.ts` | `originalMediaKey()`、`thumbMediaKey()`、`thumb2MediaKey()`、`hashFromMediaKey()`、`localOriginalCandidates()` | 本地/COS 同一套 POSIX key：类型+扩展+hash 前 2 位分片；二级 thumb 仅本地 `thumbs2/` | ✅ |
| `src/lib/storage/public-url.ts` | `publicMediaUrl()`、`localUploadUrl()` | 访客对象 URL：已配 COS 则公网 HTTPS，否则 `/api/uploads`；二级 thumb 永远走 localUploadUrl | ✅ |
| `src/lib/uploads/quota.ts` | `pruneLocalMedia()` | 按 `localMediaMaxMB` 只删本地缓存；COS 无副本则不删 | ✅ |
| `src/lib/uploads/usage-format.ts` | `classifyLocalMediaKey()`、`formatBytes()`、`LocalStorageUsage` | 本机占用分类与展示（client 可引用；分类规则与 `isThumbKey`/`isThumb2Key` 对齐） | ✅ |
| `src/lib/uploads/usage.ts` | `getLocalStorageUsage()` | 扫本地 uploads/backups 算占用；只由设置页「扫描」按钮调用，不扫 COS | ✅ |
| `src/lib/markdown/mdx.tsx` | `renderMdx(source)`、`extractToc(source)` | 安全 RSC MDX + TOC + 有界 Shiki 语言/主题 | ✅ |
| `src/lib/markdown/toc.ts` | `collectTocItems()`、`createTocCollector()`、`TocItem` | 目录收集 h1–h6；缺 id 时回填；供 TOC UI 引用（无 RSC） | ✅ |
| `src/lib/markdown/preview.ts` | `renderMdxHtml()`、`MAX_PREVIEW_CHARS` | 后台预览：sanitize 后 `renderToStaticMarkup` | ✅ |
| `src/lib/media/url.ts` | `isSafeMediaUrl()`、`isSafeHref()`、`mediaSourceHost()` | 本地上传与 https 外链；站内路径/`https` 链接 | ✅ |
| `src/lib/media/image-loader.ts` | Next `images.loaderFile` | 透传已有 URL；配合 `images.unoptimized`，不再跑第二遍 sharp，也不把 `width` 拼进 COS/Bing 地址 | ✅ |
| `src/lib/cache/public.ts` | `cachedPublic()`、`PUBLIC_CACHE_TAGS` | 公开查询 `unstable_cache` + tag；密码正文禁止进缓存 | ✅ |
| `src/lib/seo/site.ts` | `getSiteOrigin()`、`publicMetadata()`、`normalizeSiteOrigin()` | sitemap/RSS/OG 的站点源；只认 https 或本机 http | ✅ |
| `src/lib/markdown/sanitize.ts` | `sanitizeSchema`、`rehypeAllowVideo()` | rehype-sanitize 白名单；Video/Audio JSX 先转安全 HAST | ✅ |
| `src/lib/comments/service.ts` | `submitGuestComment()`、`listApprovedComments()`、`listAdminComments()`、`replyAsAdmin()`、`moderateComment()`、`deleteComment()` | 评论提交/树形列表/审核 | ✅ |
| `src/lib/comments/tree.ts` | `buildCommentTree()`、`isHoneypotFilled()` | 两级树纯函数；蜜罐判定 | ✅ |
| `src/lib/comments/types.ts` | `PublicComment`、`AdminCommentView` | 评论 DTO（无 prisma） | ✅ |
| `src/lib/search/escape.ts` | `escapeLike()`、`likePattern()` | SQLite LIKE 通配符转义 | ✅ |
| `src/lib/search/types.ts` | `SearchHit` | 搜索结果 DTO（无 content） | ✅ |
| `src/lib/search/service.ts` | `searchPosts(q, page)` | 唯一原生 SQL；`ESCAPE char(92)`；密码文仅标题 | ✅ |
| `src/lib/scheduler/index.ts` | `registerScheduler()` | instrumentation 入口（globalThis 幂等；启动补偿 + 60s 发布扫描 / 到期恢复或更新重启 + 3600s 备份检查） | ✅ |
| `src/lib/scheduler/publish.ts` | `scanScheduledPosts()` | `scheduled AND publishedAt<=now` → `published`；try/catch 刷新缓存 | ✅ |
| `src/lib/scheduler/backup.ts` | `checkBackupDue()` | `lastBackupAt + backupPeriodDays` 到期则 `runBackup()`；加密开启且无口令则跳过 | ✅ |
| `src/lib/release.ts` | `APP_CHANNEL`、`APP_VERSION`、`APP_RELEASE_LABEL`、`backupReleaseLabel()` | 应用频道与公开角标（现为 0.1.0）；备份包与角标共用 | ✅ |
| `src/lib/backup/filename.ts` | `isBackupFileName()`、`isPlainBackupFileName()`、`isImportBackupFileName()`、`isManagedBackupFileName()` | 本机生成 / 历史临时明文 / 上传包 三类文件名白名单；列表与下载走 managed | ✅ |
| `src/lib/backup/errors.ts` | `BackupError` | 备份/恢复错误（CLI 与 API 共用，不依赖 Next） | ✅ |
| `src/lib/backup/files.ts` | `listBackups()`、`deleteBackupFile()`、`getBackupFilePath()`、`MAX_BACKUP_PACKAGE_BYTES` | 持久备份目录；列表收本机生成包与上传包 | ✅ |
| `src/lib/backup/plain.ts` | `purgeExpiredPlainBackups()` | 只清理历史 ephemeral 临时包 | ✅ |
| `src/lib/backup/encrypt-policy.ts` | `resolveBackupEncrypt()`、`setBackupEncrypt()` | 加密开关读写；COS HTTPS 且用户未手设时默认关加密 | ✅ |
| `src/lib/backup/encrypt-defaults.ts` | `defaultEncryptEnabled()`、`isHttpsEndpoint()` | 默认加密策略纯函数，不连库 | ✅ |
| `src/lib/backup/inspect.ts` | `inspectBackupPackage()` | 从包内 meta 读加密标记与版本频道 | ✅ |
| `src/lib/backup/manifests.ts` | `upsertBackupManifest()`、`readBackupManifest()` | 本机 `data/backup-manifests.json`，COS 仅存副本时仍能显示版本 | ✅ |
| `src/lib/backup/tar.ts` | `walkTarGz()`、`extractBackupArchive()`、`extractNamedFiles()`、`listTarGzEntryNames()` | 纯 JS 解 tar.gz；备份内层只收 `blog.db`、可选 `meta.json` 与合法 `uploads/` key；更新包复用 `walkTarGz`（`label:"更新包"`） | ✅ |
| `src/lib/backup/crypto.ts` | `generateBackupKey()`、`encryptBackupFile()`、`decryptBackupFile()`、`assertBackupKeyMatches()` | AES-256-GCM；新包魔数 `MBENC02`；兼容 `MBENC01`；SHA-256 哈希比对 | ✅ |
| `src/lib/backup/host-secret.ts` | `deriveHostHalf()`、`xorHalves()`、`requireHostSecret()`、`createHostSecretFromPassphrase()` | scrypt 派生主机半钥、XOR 合成 DEK；读写 `data/backup-host-secret.json`（不 import Prisma） | ✅ |
| `src/lib/backup/container.ts` | `packEncryptedContainer()`、`peekBackupPackage()`、`openBackupPackage()`、`readBackupPackageDek()` | 外层 v2：`meta.json` + `half` + `payload.enc`；v1 明文 `key` 只读 | ✅ |
| `src/lib/backup/secrets.ts` | `saveBackupKeyHash()`、`getBackupKeyHash()`、`listBackupKeyHashes()` | 后台只存合成后 DEK 的哈希（Prisma） | ✅ |
| `src/lib/backup/secrets-read.ts` | `readKeyHashFromDatabase()` | 停服时参数化只读 BackupSecret；不 import Prisma | ✅ |
| `src/lib/backup/restore.ts` | `restoreFromBackup()`、`requestPendingRestore()`、`updatePendingRestart()`、`isPendingRestoreDue()`、`applyPendingRestore()` | 加密包合成 DEK；预约后可设重启时间；未到点启动不覆盖 | ✅ |
| `src/lib/backup/relaunch.ts` | `isExternallySupervised()`、`bootScriptPath()`、`resolveRelaunchCommand()`、`spawnDetachedProcess()` | 优先拉 `scripts/boot.cjs`；Windows 用 wscript 隐藏启动，不弹 cmd | ✅ |
| `src/lib/backup/restart.ts` | `queueAppRestart()`、`queueRestoreRestart()`（别名）、`scheduleAppRestart()` | 恢复与更新共用；仅在立刻重启或预约时间到点后才退出进程 | ✅ |
| `src/lib/backup/backup.ts` | `runBackup()`、`listBackupRecords()`、`pullBackupFromCos()`、`deleteBackup()`、`replicateBackupToCos()` | 按加密开关打加密或明文包，均可上传 COS `backups/`；列表带时间/大小/版本/是否加密 | ✅ |
| `src/lib/update/errors.ts` | `UpdateError` | 更新错误（CLI 与 API 共用，不依赖 Next） | ✅ |
| `src/lib/update/filename.ts` | `isManagedUpdateFileName()`、`updateFileName()`、`importUpdateFileName()` | 本机打包 `myblog-update-…` / 导入 `myblog-update-import-…` 文件名白名单 | ✅ |
| `src/lib/update/paths.ts` | `isAllowedUpdatePath()`、`classifyUpdateEntry()`、`assertRequiredUpdateFiles()`、`overlayRootsFromFiles()` | 拒绝名单：`data/` `.env` `node_modules/` `.next/` 与测试文件；其余 `main/` 文件可进包 | ✅ |
| `src/lib/update/files.ts` | `listUpdatePackages()`、`resolveUpdatePath()`、`copyUpdateFile()`、`moveUpdateFile()`、`MAX_UPDATE_PACKAGE_BYTES` | `data/updates/`；上限 512MB；跨盘 `EXDEV` 时改拷再删 | ✅ |
| `src/lib/update/manifest.ts` | `parseUpdateManifest()`、`currentUpdateManifest()` | `kind:app-update` schema 1；过高 schema 拒绝 | ✅ |
| `src/lib/update/sidecar.ts` | `readUpdateSidecar()`、`writeUpdateSidecar()` | `{name}.meta.json`，列表不必扫整个 tar | ✅ |
| `src/lib/update/inspect.ts` | `inspectUpdatePackage()` | 只读 meta + 路径校验（上传/列表用） | ✅ |
| `src/lib/update/extract.ts` | `extractUpdateArchive()` | 解到 staging；复用 `walkTarGz` | ✅ |
| `src/lib/update/pack.ts` | `packCurrentApp()`、`packCurrentAppTo()`、`packAppFromGitRef()` | 从当前 `main/` 或 git `ref:main` 打更新包；不含 data/.env/node_modules/.next | ✅ |
| `src/lib/update/github.ts` | `parseGithubRepo()`、`listGithubUpdateReleases()`、`importGithubUpdateRelease()` | 公开 GitHub Releases；资产名 `myblog-update-*.tar.gz`；仅管理员点击时请求 | ✅ |
| `src/lib/update/overlay.ts` | `overlayUpdateFiles()` | 覆盖包内文件；包里出现过的顶层目录删包里没有的文件；不碰 `data/` `.env` 与包外顶层散文件 | ✅ |
| `src/lib/update/pending.ts` | `requestPendingUpdate()`、`isPendingUpdateDue()`、`readPendingUpdate()` | `data/update-pending.json` + `update-state.json` | ✅ |
| `src/lib/update/apply.ts` | `applyPendingUpdate()` | 到期才覆盖；依赖变则 `pnpm install --frozen-lockfile`；始终 `prisma migrate deploy`；仅 `start` 才 `next build` | ✅ |
| `src/lib/update/import.ts` | `stageImportedUpdate()`、`stageAndQueueUpdate()` | 上传包检视后入库；CLI `--file` 再预约立刻重启 | ✅ |
| `src/lib/update/validation.ts` | `updateApplyPostSchema`、`updateApplyPutSchema` | 预约应用 / 设定重启时间 | ✅ |
| `src/lib/validation/backup.ts` | `restorePostSchema`、`restorePutSchema`、`backupPassphrasePostSchema`、`backupEncryptPutSchema` | 恢复预约 / 设定重启时间；后台一次性备份口令；加密开关 | ✅ |
| `src/lib/validation/account.ts` | `accountPutSchema` | 改管理员用户名/密码 | ✅ |
| `src/lib/auth/account.ts` | `getAdminAccount()`、`updateAdminAccount()` | 账号读写；校验当前密码；不硬编码用户名 | ✅ |
| `src/lib/upload/handle.ts` | `handleUpload(request)` | 单文件 multipart；只把原图写入本地（图片超过 `uploadMaxSizeMB`/10MB 会压到限额内且保持原格式）；缩略图与 COS 改走 `finalizeUpload` | ✅ |
| `src/lib/upload/compress.ts` | `compressImageToMaxBytes()`、`withSharpLock()` | sharp 按原格式把图片压到指定字节；全局 sharp 锁 | ✅ |
| `src/lib/upload/limits.ts` | `IMAGE_ORIGINAL_MAX_BYTES`、`IMAGE_INTAKE_MAX_BYTES` | 原图落盘 10MB、图片进站上限 50MB | ✅ |
| `src/lib/uploads/thumbs.ts` | `regenerateThumbs()`、`regenerateThumb2()` | 按 Upload 元数据先本地后 COS 取源；一级 thumb 写本地+COS；二级只本地 | ✅ |
| `src/lib/uploads/finalize.ts` | `finalizeUpload(hash, step)` | 发布时补生成一级/二级 thumb，再把原图+一级 thumb 传到 COS；幂等 | ✅ |
| `src/lib/uploads/hashes.ts` | `collectMediaHashes()`、`firstMediaHash()` | 从正文/封面 URL 抽出媒体 SHA-256，client 可引用 | ✅ |
| `src/lib/uploads/migrate.ts` | `migrateLocalUploadsToCos()` | 补传到新目录树；HEAD 已存在则跳过；顺带补传 thumb | ✅ |
| `src/lib/client/upload.ts` | `uploadAdminFile()`、`uploadAdminFiles()`、`finalizeAdminUploads()`、`editorImageUrl()`、`guessUploadKind()` | 后台 CSRF 上传（全局进度条）；超 10MB 图片先确认再压缩；`defer` 时只入库原图；发布时再 finalize | ✅ |
| `src/lib/client/transfer-hud.ts` | `beginTransfer()`、`hasActiveTransfers()`、`confirmCompressIfNeeded()`、`startHomeLoad()` / `finishHomeLoad()`、`HOME_LOAD_REVEAL_MS` | 顶栏传输任务与超限确认；首页大图加载超过 2 秒才进同一条 HUD，满格后关掉 | ✅ |
| `src/lib/client/compress-image.ts` | `compressImageFile()` | 浏览器端按原 MIME 把图片压到 10MB 以下 | ✅ |
| `src/lib/client/admin.ts` | `adminJson()` | 后台 JSON 请求附带 CSRF | ✅ |
| `src/lib/client/lightbox-zoom.ts` | `zoomAtPoint()`、`applyPinch()`、`containScale()`、`fitCentered()` | 灯箱滚轮/双指缩放纯函数；舞台按原图像素再 scale 进视口 | ✅ |
| `src/lib/admin/http.ts` | `AdminHttpError`、`jsonData`、`jsonPage`、`handleAdminError` | 管理 API 统一错误/响应 | ✅ |
| `src/lib/admin/revalidate.ts` | `revalidatePublicContent()` | 写成功后刷新前台路径 | ✅ |
| `src/lib/validation/post.ts` | `postWriteSchema`、`momentWriteSchema`、`taxonomyWriteSchema` | 文章/瞬间/分类标签 zod | ✅ |
| `src/lib/validation/comment.ts` | `guestCommentSchema`、`adminCommentReplySchema`、`adminCommentPatchSchema` | 评论 zod | ✅ |
| `src/lib/validation/settings.ts` | `settingsPutSchema`、`WRITABLE_SETTING_KEYS` | 设置 PUT 白名单（不含 lastBackupAt；含 `updateGithubRepo`） | ✅ |
| `src/lib/validation/setup.ts` | `initialSetupSchema` | 创建站点字段：站点名、可选地址/副标题、账号、备份口令 | ✅ |
| `src/lib/posts/admin.ts` | `listAdminPosts()`、`createAdminPost()`、`updateAdminPost()`、`deleteAdminPost()` | 后台文章 CRUD（含 `recommend`）；写库前归一正文视频语法；不用 `publishedWhere()` | ✅ |
| `src/lib/posts/admin-types.ts` | `AdminPostView` | 后台文章投影（client 可引用，无 prisma） | ✅ |
| `src/lib/taxonomy/admin.ts` | `listCategories()`、`createCategory()`、`listTags()`、`createTag()` | 分类/标签 | ✅ |
| `src/lib/moments/admin.ts` | `listAdminMoments()`、`createAdminMoment()`、`deleteAdminMoment()` | 后台瞬间 | ✅ |
| `src/lib/posts/banner.ts` | `bannerFill()`、`BANNER_STYLES` | 文章顶 Banner：封面 / 纯色 / 双色渐变 | ✅ |
| `src/lib/posts/import-markdown.ts` | `parseMarkdownImport()` | 发文导入 md/mdx（可选 YAML frontmatter） | ✅ |
| `src/lib/posts/normalize-content.ts` | `normalizePostContent()` | 保存/打开时把 HTML `<video>` 与视频图片语法归一成 `<Video />` | ✅ |
| `src/lib/moments/query.ts` | `listPublicMoments()`、`listHomeMoments()`、`toggleMomentLike()` | 前台瞬间列表（点赞数/已赞）、首页概览（无点赞）与 fingerprint 翻转点赞 | ✅ |
| `src/lib/moments/media.ts` | `resolvePublicImageUrl()`、`resolveThumb2Src()` | 瞬间/封面 key → COS 公网 URL；二级 thumb 只拼本地 `/api/uploads`，缺文件回退一级 | ✅ |
| `src/lib/moments/types.ts` | `MomentImage`、`PublicMoment`、`HomeMoment` | 瞬间图片 JSON 与前台/首页投影 | ✅ |
| `src/lib/moments/waterfall.ts` | `layoutWaterfall()`、`fillToHeight()` | 首页瞬间瀑布装箱（横通栏 / 竖两列） | ✅ |
| `src/lib/uploads/locations.ts` | `plannedLocations()`、`keysForDelete()`、`parseUploadDuration()` | 媒体路径清单与删除 key；无 prisma | ✅ |
| `src/lib/uploads/admin.ts` | `listAdminUploads()`、`inspectAdminUpload()`、`deleteAdminUpload()` | 媒体库列表（时间倒序/按 kind）；查看本地+COS 路径体积；删除默认清本地+COS，`keepCos` 只删本地 | ✅ |
| `src/lib/posts/query.ts` | `publishedWhere()`、`listPublishedPosts()`、`getPublishedPostMetaByPublicId()`、`resolveLegacyPostHref()`、分类/标签查询 | 前台唯一查询入口；首页推荐优先 `recommend=true`，一篇都没有时回退最新已发布 | ✅ |
| `src/lib/posts/path.ts` | `postHref()`、`isPublicId()`、`isCanonicalPostName()` | `/posts/{8 位 base62}/{slug\|article}`；无 prisma，client 可引用 | ✅ |
| `src/lib/posts/public-id.ts` | `allocatePublicId()`、`ensurePostPublicIds()` | 生成/补齐 `Post.publicId`；只在服务端用 | ✅ |
| `src/lib/posts/unlock.ts` | `issuePostUnlockCookie()`、`isPostUnlocked()`、token 签验 | publicId 绑定的 2h HMAC 解锁 cookie | ✅ |
| `src/lib/posts/types.ts` | `PostCardModel`、`PostDetailModel`（含 `id`） | 前台投影类型（无 passwordHash/content） | ✅ |
| `src/lib/banner/resolve.ts` | `resolveHomeBanner()`、`FALLBACK_BANNER_SRC` | Setting 优先；Bing 日图 3s 超时/最多 2 项缓存/失败回退 | ✅ |
| `src/lib/home/types.ts` | `toAreas()`、`normalizePlacement()`、`normalizeMobilePlacement()`、`resolveDropPlacement()`、`HomePlacementView`（含 `hPct` 与手机四字段） | 首页格点纯逻辑 | ✅ |
| `src/lib/home/builtins.ts` | `BUILTIN_DEFINITIONS`、`defaultSizeFor()`、`BLOCK_LIBRARY` | 11 个内置模块；桌面/手机默认几何；重置大小 | ✅ |
| `src/lib/home/layout.ts` | `ensureHomeModules()`、`getHomeLayout()`、`saveHomeLayout()` 等 | 首页模块与双套格点读写 | ✅ |
| `src/lib/home/data.ts` | `loadHomeData()` | 按当前启用的模块/积木决定查什么，关掉的模块不打数据库；文章查询走 `lib/posts/query.ts`，瞬间走 `listHomeMoments` | ✅ |
| `src/lib/home/uptime.ts` | `parseSiteStartedAt()`、`formatUptime()`、`toDatetimeLocalValue()` | 站点运行时间解析与中文格式化；无 prisma | ✅ |
| `src/lib/home/grid.ts` | `areaStyle()`、`moduleBoxStyle()` | 格点 → `--cell-*` / `--m-cell-*` CSS 变量（P-036） | ✅ |
| `src/lib/layout/viewport.ts` | `VIEWPORT_DESKTOP`/`VIEWPORT_PHONE`、`isPhoneViewport()`、`LAYOUT_PHONE_MEDIA`、Banner `hPct` 互转 | 全站双视口约定；走手机套含横屏 | ✅ |
| `src/lib/layout/box.ts` | `normalizeBox()`、`pickBox()`、`mergeBox()`、`clampInt()` | 相对格点盒子，无 prisma | ✅ |
| `src/lib/validation/home.ts` | `homeLayoutPutSchema`、`moduleCreateSchema`、`modulePatchSchema` | 首页布局与模块 zod；未知 config 键一律丢弃 | ✅ |
| `src/lib/validation/upload.ts` | `finalizeUploadSchema` | 发布时处理媒体 `{hash, step}` | ✅ |
| `src/lib/utils/` | `logger`、`slugify()`、`fingerprint()`、`getClientIp()`、`cn()`、`formatPostDate()`、`parsePage()`、`parsePageSize()` | 有界依赖的通用工具；中文 slug fallback | ✅ |

### components/（UI）

| 模块路径 | 用途 | 状态 |
|---|---|---|
| `src/components/layout/` | `SiteHeader`、`Navbar`（滑动活动底色 + 首页延后主题按钮）、`Footer`（左下角 `ReleaseMark`）、`ThemeToggle`、`ThemeInit`（`useServerInsertedHTML` 把防闪烁脚本插进 head，见 P-040）、`SiteShell`、`Sidebar`（组合 `components/widgets/*`，不自己写 UI；文章阅读页 `reading` 只先显示目录）、`PostSidebar`（阅读页右侧按钮展开其余卡片）、`AppChrome`（顶栏导航进度 + 全局 `TransferHud`）、`NavigationProgress`（顶栏 2px 天蓝进度条） | ✅ |
| `src/components/layout/nav-links.ts` | 前台主导航链接表 | ✅ |
| `src/components/widgets/` | `AnnouncementWidget`、`SiteStatsWidget`、`CategoriesWidget`、`TagsWidget`、`RecentPostsWidget`：纯展示（props 进），侧栏与首页模块共用同一份 | ✅ |
| `src/components/home/` | `HomeGrid`（12 列格点；`--cell-*` + `--m-cell-*` 双套变量）、`HomeModuleRenderer`（内置 key → 组件）、`BlockRenderer`（自建模块积木）、`CustomModuleRuntime`（HTML/CSS/JS 注入，见 P-034）、`HomeBanner`（固定底图：解码完成前不显示，就绪后再入场；解码超过 2 秒才用 `TransferHud` 报加载进度，满格后自动关掉；滚动模糊/半透明幕布；高度走格子 `hPct`；后台画布 `trackLoad=false`）、`PostCard`/`PostList`、`ScrollDown` | ✅ |
| `src/components/home/modules/` | `WelcomeModule`（漂浮色块文字走 `config.chips`）、`RecommendModule`、`MomentsModule`（打字机文案 + 二级缩略图瀑布）、`PostsModule`（分类栏 + 大卡 + 分页）、`UptimeModule`（站点运行时间，空开始时间不渲染） | ✅ |
| `src/components/post/` | `WaveDivider`、`PasswordGate`、`PostBody`、`PostHero`（封面/纯色/混色）、`Toc`（h1–h6 层级 + 点击平滑滚动）、`Video`、`Audio`、`ReadingProgress`、`ViewTracker` | ✅ |
| `src/components/moment/` | `MomentList` 瀑布流、`MomentGrid` 九宫格、`LikeButton` | ✅ |
| `src/components/comment/` | `CommentSection`（默认 `collapsible` 收起，点标题展开）、`CommentForm`、`CommentItem`（纯文本；蜜罐字段） | ✅ |
| `src/components/common/` | `CoverMedia`（next/image + 透传 loader）、`Pagination`、`EmptyState`、`PageSkeleton`、原生 dialog `Lightbox`（缩略图模糊底 + 原图加载进度 + 约 1s 变清晰；舞台按原图像素再 scale 进视口；同一页 blob LRU 再开走缓存；滚轮/双指缩放，放大后可拖）、`TransferHud`（顶栏多文件传输进度；首页大图加载复用同一条，标题为「加载进度」）、`SearchDialog`（⌘K）、`ReleaseMark`（`APP_RELEASE_LABEL`，现为 0.1.0） | ✅ |
| `src/components/admin/EditorLoader.tsx` | **vendor 编辑器唯一入口**（client + dynamic ssr:false）；实现见 `MdxEditorClient.tsx` | ✅ |
| `src/components/admin/InsertImages.tsx`、`InsertVideo.tsx`、`InsertAudio.tsx`、`MediaInsertMenu.tsx`、`MediaLibraryPicker.tsx`、`VideoJsxEditor.tsx`、`AudioJsxEditor.tsx`、`AdminImageToolbar.tsx`、`EditorPreview.tsx`、`SortableImageGrid.tsx`、`media-drag.ts`、`editor-i18n.ts`、`UploadsToolbar.tsx`、`UploadCard.tsx` | 图片/视频/音频插入弹窗（portal 到 body，可从媒体库导入）；顶部拖动换位；后台预览；瞬间宫格拖拽；媒体库上传进度/查看路径/删除菜单；编辑器中文 | ✅ |
| `src/components/admin/PostEditorForm.tsx`、`MomentForm.tsx`、`SettingsForm.tsx`、`AdminNav.tsx`、`AdminWorkspace.tsx`、`BackupPanel.tsx`、`UpdatePanel.tsx`、`DeleteButton.tsx`、`CommentRowActions.tsx`、`AdminCommentCompose.tsx` | 后台表单、左侧竖栏 + 非编辑页顶栏（当前页标题 18px）、右侧卡片向下跳出再从下方浮现、顶栏标题交叉渐变、写文章分栏（设置栏右上角图标收起、分组卡片收起只留标题、可当场新建分类/标签、分栏独立滚动、含首页推荐）、设置页本机媒体/备份占用、备份面板（加密开关 + 应用内重启恢复）、更新面板（打包/导入/预约应用）、评论审核操作；侧栏左下角版本角标 | ✅ |
| `src/components/admin/HomeLayoutEditor.tsx` | 首页管理：电脑/手机画框、左栏外观+开关/位置/高度/重置大小，右栏真数据画布（拖动、改宽、改高）。预览节点由 RSC 传入 | ✅ |
| `src/components/admin/ModuleEditor.tsx`、`NewModuleButton.tsx` | 模块管理：积木增删排序 + HTML/CSS/JS 三栏；内置模块只能改名称 | ✅ |
| `src/components/admin/LoginForm.tsx`、`SetupForm.tsx`、`LogoutButton.tsx`、`AccountForm.tsx` | CSRF 登录/创建站点/退出；改管理员用户名密码（首次强制） | ✅ |
| `src/types/mdx-editor.d.ts` | `@myblog/mdx-editor` 的 tsc 门面类型（不检查 vendor 源码） | ✅ |

### M1 入口与路由

| 模块路径 | 用途 | 状态 |
|---|---|---|
| `src/instrumentation.ts` | Node runtime 先 `applyPendingRestore()`，再初始化 + scheduler 幂等注册。程序更新不在这里做，由 `scripts/boot.cjs` 在拉起 Next 之前 `applyPendingUpdate()` | ✅ |
| `src/proxy.ts` | Next 16 安全头（含 `object-src 'none'`、后台 `no-store`、HTTPS 时 HSTS）、CSRF、后台乐观拦截、登录/创建 5 次/15 分/IP 限速；转发 `x-myblog-pathname` | ✅ |
| `src/app/api/auth/{csrf,login,logout,setup}/route.ts` | 认证公开 API；setup 仅零管理员 | ✅ |
| `src/app/api/upload/route.ts`、`api/uploads/[...path]/route.ts` | 管理员入库原图；公开流式/Range；COS 原图默认 302，`?proxy=1` 同源流式（灯箱进度） | ✅ |
| `src/app/api/posts/[slug]/{unlock,view}/route.ts` | 密码解锁；IP+slug 60s 浏览量去重 | ✅ |
| `src/app/api/comments/route.ts` | 公开 GET approved 树 / POST 游客 pending（CSRF+频控+蜜罐） | ✅ |
| `src/app/api/search/route.ts` | 公开搜索（LIKE 转义；60 次/分/IP） | ✅ |
| `src/app/api/moments/route.ts`、`api/moments/[id]/like/route.ts` | 瞬间流；点赞翻转（20 次/分/IP） | ✅ |
| `src/app/admin/login/page.tsx`、`src/app/admin/setup/page.tsx` | 管理员登录页；无管理员时的创建站点页 | ✅ |
| `src/app/api/admin/**/route.ts` | session/stats/posts/preview/categories/tags/moments/comments/uploads（含 thumbs/regenerate、thumbs2/regenerate、migrate、finalize）/settings（含 usage 手动扫描）/backup（含 restore、upload、passphrase、pull、encrypt）/update（含 pack、upload、download、apply、github）/cos/test/account | ✅ |
| `src/app/admin/(protected)/layout.tsx`、`page.tsx` | 服务端 session 守卫 + 左侧竖栏工作区 + 仪表盘统计 | ✅ |
| `src/app/admin/(protected)/posts/` | 文章列表 / 新建（左设置右编辑器） / 编辑 | ✅ |
| `src/app/admin/(protected)/moments/page.tsx` | 瞬间发布与列表 | ✅ |
| `src/app/admin/(protected)/comments/page.tsx` | 评论审核（通过/拒绝/删除/回复） | ✅ |
| `src/app/admin/(protected)/uploads/page.tsx` | 媒体库：上传/时间排序/查看路径/删除菜单 | ✅ |
| `src/app/admin/(protected)/backups/page.tsx` | 备份列表（时间/大小/版本/是否加密）/ 加密开关 / 上传备份入库 / 预约重启时间或立刻重启 | ✅ |
| `src/app/admin/(protected)/updates/page.tsx` | 程序更新：打包 / 导入 / GitHub 检查 / 预约应用与重启；与预约恢复互斥 | ✅ |
| `scripts/boot.cjs` | `pnpm dev` / `pnpm start` / pm2 统一入口：先 `apply-pending-update.ts`，再 `require` Next CLI（同一 PID） | ✅ |
| `scripts/pack-update.ts` | `pnpm pack:update`：当前 `main/` 或 `--git <ref>` 打更新包（`--out` 可另存） | ✅ |
| `scripts/apply-pending-update.ts`、`apply-update.ts` | boot 启动前应用到期更新；`pnpm apply-update --file` 入库并预约；`--pending [--start]` 当场应用 | ✅ |
| `scripts/install.sh` | Linux 空机首装：install / migrate deploy / build；不 seed | ✅ |
| `scripts/restore-backup.ts` | `pnpm restore`：停服后当场恢复，或 `--pending` 预约；换机 `--passphrase` | ✅ |
| `scripts/relaunch-app.cjs` | 等原进程退出后拉 `scripts/boot.cjs`（找不到才回退 next bin）；`windowsHide`；pm2/systemd 不走此脚本 | ✅ |
| `scripts/init-production.ts` | `pnpm setup`：手设站点名称、管理员与不可改的备份口令；无默认 MyBlog | ✅ |
| `src/app/admin/(protected)/settings/page.tsx` | 站点设置 KV 表单；本机占用须点「扫描」才算一次 | ✅ |
| `src/app/admin/(protected)/home/page.tsx` | 首页管理（左设置 + 右画布） | ✅ |
| `src/app/admin/(protected)/modules/page.tsx`、`modules/[id]/page.tsx` | 模块目录列表 / 模块编辑器 | ✅ |
| `src/app/layout.tsx`、`globals.css` | 中文根布局、Heo 双主题+玻璃 token；无管理员则转到创建页；防闪烁只走 `ThemeInit`，禁止在 layout 里写 `<script>`（P-040） | ✅ |
| `src/app/page.tsx` | 首页：只取布局 + 渲染 `HomeGrid`。**禁止在这里堆一次性 JSX**（P-035） | ✅ |
| `src/app/posts/`、`categories/`、`tags/`、`archives/`、`moments/`、`messages/`、`search/`、`not-found.tsx`、`loading.tsx` | 前台路由；文章为 `/posts/[publicId]/[name]`；单段旧链走 `[publicId]/route.ts` 301；列表骨架在 `(listing)` | ✅ |
| `src/app/sitemap.ts`、`robots.ts`、`rss.xml/route.ts` | sitemap / robots / RSS；密码文进 sitemap 但不进 RSS 正文 | ✅ |
| `src/app/admin/layout.tsx` | 后台共用 site-offset 外壳 | ✅ |
| `prisma/seed.ts` | bootstrap（含内置首页模块）+ 幂等演示 10 篇文章 / 分类标签 / 2 条瞬间 | ✅ |
| `src/lib/home/layout-model.test.ts` | 格点分组/重叠下移/12 列裁剪的单测（`pnpm test`） | ✅ |
| `src/lib/layout/viewport.test.ts`、`src/lib/layout/box.test.ts` | 走手机套判定；盒子裁剪与双视口 pick/merge | ✅ |
| `src/lib/utils/fingerprint.test.ts`、`src/lib/seo/site.test.ts` | 客户端 IP 不信 XFF 第一跳；站点源只认 https/本机 | ✅ |
| `src/lib/backup/tar.test.ts`、`crypto.test.ts`、`host-secret.test.ts`、`plain.test.ts`、`restore.test.ts`、`restart.test.ts`、`encrypt-policy.test.ts`、`inspect.test.ts`、`src/lib/release.test.ts`、`src/lib/update/update.test.ts` | 解包白名单；AES 往返；XOR/口令重建；历史 ephemeral 清理；加密/明文包恢复；进程监护走 boot.cjs；COS HTTPS 默认关加密；包内版本检视；更新包路径/往返覆盖/拒绝 data/ | ✅ |
| `src/lib/storage/cos-config.test.ts`、`src/lib/uploads/migrate.test.ts`、`src/lib/uploads/usage.test.ts`、`src/lib/uploads/locations.test.ts`、`src/lib/uploads/hashes.test.ts`、`src/lib/upload/compress.test.ts`、`src/lib/storage/media-keys.test.ts`、`src/lib/posts/path.test.ts`、`src/lib/moments/waterfall.test.ts` | COS URL；迁移/媒体 key；本机占用分类；正文抽 hash；原格式压到限额；删除路径清单；base62 文章路径；首页瀑布装箱（不打真实桶） | ✅ |

### editor/（vendor 冻结子树）

| 路径 | 说明 |
|---|---|
| `src/editor/` | mdx-editor v4.2.3 源码（MIT，排除 examples/test）。内部 `@/` 已改为 `@/editor/`。CSS mixins 已一次性展开。**禁止升级依赖、禁止用 `@/`（非 @/editor）引项目代码**。运行时由 `next.config.ts` 将 `@myblog/mdx-editor` 指到 `index.ts`；`globals.css` 由后台 layout 引入（Next 禁止组件内 import 全局 CSS） |

### 入口命令一览

| 命令（main/ 下） | 说明 |
|---|---|
| `pnpm dev` | 开发（Windows 调试）；经 `scripts/boot.cjs`，启动前检查预约更新 |
| `pnpm build` / `pnpm start` | 构建 / 生产启动（`start` 同样走 boot.cjs；更新后才会 `next build`） |
| `pnpm prisma migrate dev` / `studio` | 迁移 / 数据库 GUI |
| `pnpm db:seed` | 幂等演示数据（已有文章则跳过） |
| `pnpm setup` | 投产初始化：站点名称、管理员账号与备份口令（口令不可再改） |
| `pnpm pack:update` | 把当前程序打成更新包（`--out` / `--git <ref>`） |
| `pnpm restore` | 停服后一键恢复备份（`--file` / `--latest` / `--pending` / `--passphrase`） |
| `pnpm apply-update --file` | 把一份 tar.gz 入库并预约立刻重启；再 `pm2 restart myblog`（站点仍在跑时不要在本进程覆盖） |
| `pnpm apply-update --pending` | boot / 停服时应用到期更新（`--start` 走生产构建路径） |
| `bash scripts/install.sh` | Linux 空机首装（只跑一次；以后发版不要改这个脚本） |
| `pm2 start ecosystem.config.cjs` | 生产进程（fork 单实例，script 为 boot.cjs） |

## 不存在、禁止自造清单

- **没有**独立后端服务/单独 API 服务器（一切在 Next.js 内）
- **没有** Redis/MQ/外部缓存（内存实现，须有上限）
- **没有**多管理员/角色权限体系（单管理员）
- **没有**邮件通知系统（仅后台待审提醒）
- **没有**第三方评论系统（自建）
- **没有** PJAX/音乐播放器/评论弹幕/简繁转换（用户已砍）
- **没有**测试框架（M0~M7 以手动验收为主；仅 sanitize 渲染写最小单测）
