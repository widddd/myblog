# module.md — 模块注册表（防重复造轮子）

> **写代码前必读本文件**。新增功能先查这里：已存在则复用或扩展，严禁平行重写。
> 维护规则：新增/删除/重命名源码文件时必须同步本表（见 agents-maintenance.md 触发表）。
>
> **不在本表范围**：Android 客户端（`androidapp/`）是独立的 Gradle/GeckoView 工程，不参与站点运行时，它的注册表在 [../android/README.md](../android/README.md)。

**项目当前阶段**：M10 更新页数据清理已落地（见 PLAN.md）；M9 程序更新与 M8 首页模块化已完成；**静态页面（后台建页 + 可配置目录，前台 `/{目录}/{slug}`）已实施，开发库迁移 `20261001061500_static_page` 已应用**（生产目标机仍需执行一次迁移，否则 `/admin/pages` 会报「表不存在」）；**瞬间可见范围（全局可见期 + 可见范围组）已实施，开发库迁移 2026-09-30 已应用、生产目标机仍需执行一次**（见 [moment-visibility-spec.md](../moment-visibility-spec.md)）；**最新发行 = 0.1.2**（静态页面、瞬间可见范围与发布区改版、Android 客户端 SmartBlog、上传上限单一事实源、Halo 备份导入、灯箱 COS 直连、部署踩坑修复）；M7 Linux 部署演练暂缓。下表按实际导出 API 标注状态（✅ 已实现 / 🚧 进行中 / 📋 规划）。

## 模块分组

### lib/（服务端核心）

| 模块路径 | 核心 API | 用途 | 状态 |
|---|---|---|---|
| `src/lib/db-path.ts` | `resolveDatabasePath()`、`DATABASE_PATH` | 只解析库路径，不连 Prisma；恢复链路必须走这里 | ✅ |
| `src/lib/db.ts` | `prisma`、`DATABASE_PATH`、`getSqliteHandle()`、`disconnectDatabase()` | Prisma Client 单例；Windows 安全路径；WAL/busy_timeout；备份专用句柄；重启前断连 | ✅ |
| `src/lib/db-schema.ts` | `requirePrismaModel()`、`SchemaNotReadyError` | **「模型没进 Prisma 客户端」的统一出口**（纯函数，无 prisma/next 依赖，可直接单测）：模型缺失时抛 `SCHEMA_MISSING` + 「重启 `pnpm dev`」的可照做提示，替掉 `Cannot read properties of undefined (reading 'findMany')`。只拦「进程里的客户端不认识模型」；库缺表（P2021）不拦，Prisma 自己的报错已写明缺哪张表（P-109） | ✅ |
| `src/lib/bootstrap.ts` | `initializeApplication()` | 无管理员时告警并依赖创建页 / `pnpm setup`；默认 Setting 与 11 个内置首页模块幂等初始化 | ✅ |
| `src/lib/settings.ts` | `getSetting()`、`setSetting()`、`settingIsStored()`、`getPublicSettings()`、`getAdminSettings()`、`getAdminAccent()`、`getDashboardCards()`、`ensureDefaultSettings()`、`displaySiteName()` | Setting KV + TTL 60 秒/最多 64 项缓存 + 公开子集（不含 COS 密钥，含 `siteStartedAt`）；`siteName` 默认空，公开面空则显示「博客」；管理端含 `thumbMaxPx`/`thumb2MaxPx`/**`momentVisibleDays`**（瞬间全局可见期，0 = 永久公开，是可见范围组的天花板）/`backupLocalMaxMB`/COS 五项/`updateGithubRepo`/`adminAccent`/`dashboardCards`，`cosSecretId`/`cosSecretKey` 只写不回显。`backupEncrypt` 不进默认表、不进设置表单，只由备份页开关写入。两个新读取助手对脏值/读取异常一律回退默认且不抛错 | ✅ |
| `src/lib/admin/accents.ts` | `ADMIN_ACCENTS`、`DEFAULT_ADMIN_ACCENT`、`isAdminAccentKey()`、`resolveAdminAccent()`、`adminAccentStyle()` | **后台配色的事实源**：6 套预设 × 浅色/暗色各 4 个锚点（派生色阶在 admin.css）；`adminAccentStyle()` 生成 `:root:root` 两段注入串。非法值回退 graphite、不抛错（P-076） | ✅ |
| `src/lib/admin/dashboard-cards.ts` | `DASHBOARD_CARD_KEYS`、`DEFAULT_DASHBOARD_CARDS`、`DASHBOARD_CARD_META`、`isDashboardCardKey()`、`resolveDashboardCards()`、`hasVisibleDashboardCard()` | **概览卡片的事实源**：8 个 key + 默认全显示 + 分区（`kpi` = 顶部四张统计卡；`wide` = 半宽行，`META` 数组顺序即版面顺序）；`resolveDashboardCards()` 未知键丢弃、缺键补 true、非布尔按默认。加卡片只改这里 + 概览页 `slots`（面板与校验都从这份清单读） | ✅ |
| `src/lib/auth/session.ts` | `getSession()`、`createSession()`、`destroySession()` | iron-session 7 天会话；HttpOnly/Secure/Lax cookie | ✅ |
| `src/lib/auth/password.ts` | `hashPassword()`、`verifyPassword()`、`verifyPasswordAgainstKnownOrDummy()` | bcryptjs cost 12；登录对不存在用户也走一遍 dummy hash | ✅ |
| `src/lib/auth/must-change.ts` | `hasPendingCredentialChange()` | 读 `mustChangeCredentials`；不 import guard，避免循环 | ✅ |
| `src/lib/auth/guard.ts` | `requireAdmin()`、`UnauthorizedError`、`CredentialsChangeRequiredError` | API 守卫；未改初始密码除账号接口外一律 403 | ✅ |
| `src/lib/auth/initial-setup.ts` | `hasAdminUser()`、`runInitialSetup()`、`createAdminForExistingSite()` | 零管理员且无半钥时完整初始化；已有主机半钥且零管理员时仅网页/CLI补建管理员，不改站点配置或半钥 | ✅ |
| `src/lib/auth/csrf.ts` | `issueCsrfToken()`、`verifyCsrfToken()`、`verifyCsrfRequest()` | double-submit，HMAC 绑定加密 session | ✅ |
| `src/lib/auth/rateLimit.ts` | `rateLimit()`、`clearRateLimit()` | 内存滑动窗口，最多 2000 个桶；成功登录会后清账（见 `login-limit.ts`） | ✅ |
| `src/lib/auth/login-limit.ts` | `LOGIN_LIMIT`、`LOGIN_WINDOW_MS`、`loginLimitKey()` | 登录/创建站点 5 次/15 分/IP 的**唯一策略源**；proxy 记账、登录成功后清账都用同一个 key | ✅ |
| `src/lib/auth/next-path.ts` | `adminNextPath()` | 登录后落地地址白名单：只认 `/admin` 下路径，挡协议相对地址/反斜杠/编码穿越/登录页自环（无 prisma，client 可引用） | ✅ |
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
| `src/lib/comments/service.ts` | `submitGuestComment()`、`listApprovedComments()`、`listAdminComments()`、`replyAsAdmin()`、`moderateComment()`、`deleteComment()` | 评论提交/树形列表/审核。**瞬间目标两侧都过可见期**：读（`listApprovedComments` 对 `targetType=moment` 先用 `findVisibleMomentId()` 判定，不在可见期内返回空列表）与写（提交 404）一致 | ✅ |
| `src/lib/comments/tree.ts` | `buildCommentTree()`、`isHoneypotFilled()` | 两级树纯函数；蜜罐判定 | ✅ |
| `src/lib/comments/types.ts` | `PublicComment`、`AdminCommentView` | 评论 DTO（无 prisma） | ✅ |
| `src/lib/search/escape.ts` | `escapeLike()`、`likePattern()` | SQLite LIKE 通配符转义 | ✅ |
| `src/lib/search/types.ts` | `SearchHit` | 搜索结果 DTO（无 content） | ✅ |
| `src/lib/search/service.ts` | `searchPosts(q, page)` | 唯一原生 SQL；`ESCAPE char(92)`；密码文仅标题 | ✅ |
| `src/lib/scheduler/index.ts` | `registerScheduler()` | instrumentation 入口（globalThis 幂等；启动补偿 + 60s 发布扫描 / 到期恢复或更新重启 + 3600s 备份检查） | ✅ |
| `src/lib/scheduler/publish.ts` | `scanScheduledPosts()` | `scheduled AND publishedAt<=now` → `published`；try/catch 刷新缓存 | ✅ |
| `src/lib/scheduler/backup.ts` | `checkBackupDue()`、`isBackupDue()`、`resolvePeriodDays()`、`DEFAULT_BACKUP_PERIOD_DAYS` | **周期备份**（设置页「每隔几天自动备份」，默认 3 天）：`lastBackupAt + backupPeriodDays` 到期则 `runBackup()`；调度器启动时与每小时各调一次。**只对非加密备份生效**——加密备份要管理员在后台当场输口令（口令不落盘，见 `api/admin/backup/passphrase` 的 410），定时任务拿不到口令，所以开启加密时明确跳过并记日志（P-123）。到期判定与周期解析是纯函数，配 [backup.test.ts](backup.test.ts) | ✅ |
| `src/lib/release.ts` | `APP_CHANNEL`、`APP_VERSION`、`APP_RELEASE_LABEL`、`backupReleaseLabel()` | 应用频道与公开角标（现为 0.1.2）；备份包与角标共用 | ✅ |
| `src/lib/backup/filename.ts` | `isBackupFileName()`、`isPlainBackupFileName()`、`isImportBackupFileName()`、`isManagedBackupFileName()` | 本机生成 / 历史临时明文 / 上传包 三类文件名白名单；列表与下载走 managed | ✅ |
| `src/lib/backup/errors.ts` | `BackupError` | 备份/恢复错误（CLI 与 API 共用，不依赖 Next） | ✅ |
| `src/lib/backup/files.ts` | `listBackups()`、`deleteBackupFile()`、`getBackupFilePath()`、`MAX_BACKUP_PACKAGE_BYTES` | 持久备份目录；列表收本机生成包与上传包 | ✅ |
| `src/lib/backup/plain.ts` | `purgeExpiredPlainBackups()`、`clearPlainBackups()` | 清理历史 ephemeral 临时包；数据清理时清空临时明文包 | ✅ |
| `src/lib/backup/encrypt-policy.ts` | `resolveBackupEncrypt()`、`setBackupEncrypt()` | 加密开关读写；COS HTTPS 且用户未手设时默认关加密 | ✅ |
| `src/lib/backup/encrypt-defaults.ts` | `defaultEncryptEnabled()`、`isHttpsEndpoint()` | 默认加密策略纯函数，不连库 | ✅ |
| `src/lib/backup/inspect.ts` | `inspectBackupPackage()` | 从包内 meta 读加密标记与版本频道 | ✅ |
| `src/lib/backup/manifests.ts` | `upsertBackupManifest()`、`readBackupManifest()`、`clearBackupManifests()` | 本机 `data/backup-manifests.json`，COS 仅存副本时仍能显示版本；数据清理时删除索引 | ✅ |
| `src/lib/backup/tar.ts` | `walkTarGz()`、`extractBackupArchive()`、`extractNamedFiles()`、`listTarGzEntryNames()` | 纯 JS 解 tar.gz；备份内层只收 `blog.db`、可选 `meta.json` 与合法 `uploads/` key；更新包复用 `walkTarGz`（`label:"更新包"`） | ✅ |
| `src/lib/backup/crypto.ts` | `generateBackupKey()`、`encryptBackupFile()`、`decryptBackupFile()`、`assertBackupKeyMatches()` | AES-256-GCM；新包魔数 `MBENC02`；兼容 `MBENC01`；SHA-256 哈希比对 | ✅ |
| `src/lib/backup/host-secret.ts` | `deriveHostHalf()`、`xorHalves()`、`requireHostSecret()`、`createHostSecretFromPassphrase()` | scrypt 派生主机半钥、XOR 合成 DEK；读写 `data/backup-host-secret.json`（不 import Prisma） | ✅ |
| `src/lib/backup/container.ts` | `packEncryptedContainer()`、`peekBackupPackage()`、`openBackupPackage()`、`readBackupPackageDek()` | 外层 v2：`meta.json` + `half` + `payload.enc`；v1 明文 `key` 只读 | ✅ |
| `src/lib/backup/secrets.ts` | `saveBackupKeyHash()`、`getBackupKeyHash()`、`listBackupKeyHashes()` | 后台只存合成后 DEK 的哈希（Prisma） | ✅ |
| `src/lib/backup/secrets-read.ts` | `readKeyHashFromDatabase()` | 停服时参数化只读 BackupSecret；不 import Prisma | ✅ |
| `src/lib/backup/restore.ts` | `restoreFromBackup()`、`requestPendingRestore()`、`updatePendingRestart()`、`isPendingRestoreDue()`、`applyPendingRestore()`、`clearRestoreArtifacts()` | 加密包合成 DEK；预约后可设重启时间；未到点启动不覆盖；数据清理时取消预约并删除恢复快照 | ✅ |
| `src/lib/backup/relaunch.ts` | `isExternallySupervised()`、`bootScriptPath()`、`resolveRelaunchCommand()`、`spawnDetachedProcess()` | 优先拉 `scripts/boot.cjs`；Windows 用 wscript 隐藏启动，不弹 cmd | ✅ |
| `src/lib/backup/restart.ts` | `queueAppRestart()`、`queueRestoreRestart()`（别名）、`scheduleAppRestart()` | 恢复与更新共用；仅在立刻重启或预约时间到点后才退出进程 | ✅ |
| `src/lib/backup/backup.ts` | `runBackup()`、`listBackupRecords()`、`pullBackupFromCos()`、`deleteBackup()`、`replicateBackupToCos()` | 按加密开关打加密或明文包，均可上传 COS `backups/`；列表带时间/大小/版本/是否加密 | ✅ |
| `src/lib/update/errors.ts` | `UpdateError` | 更新错误（CLI 与 API 共用，不依赖 Next） | ✅ |
| `src/lib/update/filename.ts` | `isManagedUpdateFileName()`、`updateFileName()`、`importUpdateFileName()` | 本机打包 `myblog-update-…` / 导入 `myblog-update-import-…` 文件名白名单 | ✅ |
| `src/lib/update/paths.ts` | `isAllowedUpdatePath()`、`classifyUpdateEntry()`、`assertRequiredUpdateFiles()`、`overlayRootsFromFiles()` | 拒绝名单：`data/` `.env` `node_modules/` `.next/` 与测试文件；其余 `main/` 文件可进包 | ✅ |
| `src/lib/update/files.ts` | `listUpdatePackages()`、`resolveUpdatePath()`、`copyUpdateFile()`、`moveUpdateFile()`、`clearUpdatePackages()`、`MAX_UPDATE_PACKAGE_BYTES` | `data/updates/`；上限 512MB；跨盘 `EXDEV` 时改拷再删；数据清理时清空更新包 | ✅ |
| `src/lib/update/manifest.ts` | `parseUpdateManifest()`、`currentUpdateManifest()` | `kind:app-update` schema 1；过高 schema 拒绝 | ✅ |
| `src/lib/update/sidecar.ts` | `readUpdateSidecar()`、`writeUpdateSidecar()`、`clearUpdateSidecars()` | `{name}.meta.json`，列表不必扫整个 tar；数据清理时清空 sidecar | ✅ |
| `src/lib/update/inspect.ts` | `inspectUpdatePackage()` | 只读 meta + 路径校验（上传/列表用） | ✅ |
| `src/lib/update/extract.ts` | `extractUpdateArchive()` | 解到 staging；复用 `walkTarGz` | ✅ |
| `src/lib/update/pack.ts` | `packCurrentApp()`、`packCurrentAppTo()`、`packAppFromGitRef()` | 从当前 `main/` 或 git `ref:main` 打更新包；不含 data/.env/node_modules/.next | ✅ |
| `src/lib/update/github.ts` | `parseGithubRepo()`、`listGithubUpdateReleases()`、`importGithubUpdateRelease()` | 公开 GitHub Releases；资产名 `myblog-update-*.tar.gz`；仅管理员点击时请求 | ✅ |
| `src/lib/update/overlay.ts` | `overlayUpdateFiles()` | 覆盖包内文件；包里出现过的顶层目录删包里没有的文件；不碰 `data/` `.env` 与包外顶层散文件 | ✅ |
| `src/lib/update/pending.ts` | `requestPendingUpdate()`、`isPendingUpdateDue()`、`readPendingUpdate()`、`clearUpdateState()` | `data/update-pending.json` + `update-state.json`；数据清理时取消预约并清结果索引 | ✅ |
| `src/lib/update/apply.ts` | `applyPendingUpdate()` | 到期才覆盖；依赖变则 `pnpm install --frozen-lockfile`；始终 `prisma migrate deploy`；仅 `start` 才 `next build` | ✅ |
| `src/lib/update/import.ts` | `stageImportedUpdate()`、`stageAndQueueUpdate()` | 上传包检视后入库；CLI `--file` 再预约立刻重启 | ✅ |
| `src/lib/update/validation.ts` | `updateApplyPostSchema`、`updateApplyPutSchema` | 预约应用 / 设定重启时间 | ✅ |
| `src/lib/validation/backup.ts` | `restorePostSchema`、`backupRunPostSchema`、`restorePutSchema`、`backupEncryptPutSchema`、`optionalPassphrase`（内部） | 恢复预约 / 立即备份 / 设定重启时间 / 加密开关。**口令字段是可选的**：不加密的备份与恢复不带口令（客户端 `passphrase \|\| undefined` 会被 `JSON.stringify` 整个丢掉，实际发的是 `{}`），空串与纯空白按「没给」处理；写成必填会让非加密备份必然 400，且报的是 Zod 默认类型错误（P-122） | ✅ |
| `src/lib/validation/account.ts` | `accountPutSchema` | 改管理员笔名/用户名/密码（三者至少改一项）；笔名允许空串=清掉 | ✅ |
| `src/lib/auth/account.ts` | `findAdminAccount()`、`getAdminAccount()`、`updateAdminAccount()`、`readDefaultPenName()` | 账号读写（含笔名 `penName`）；校验当前密码；不硬编码用户名；会话对不上管理员时返回空而不是在页面里抛错。`readDefaultPenName()` 是作者署名的默认来源（不加缓存，公开读路径自己套 `cachedPublic`）；**改笔名后会 `revalidateTag(posts, { expire: 0 })` 立即过期**，否则第一次请求仍是旧署名（P-089） | ✅ |
| `src/lib/upload/handle.ts` | `handleUpload(request)` | 单文件 multipart；只把原图写入本地（图片超过 `uploadMaxSizeMB`/10MB 会压到限额内且保持原格式）；缩略图与 COS 改走 `finalizeUpload` | ✅ |
| `src/lib/upload/compress.ts` | `compressImageToMaxBytes()`、`withSharpLock()` | sharp 按原格式把图片压到指定字节；全局 sharp 锁 | ✅ |
| `src/lib/upload/limits.ts` | `IMAGE_ORIGINAL_MAX_BYTES`、`IMAGE_INTAKE_MAX_BYTES`、`DEFAULT_MAX_IMAGES_PER_BATCH`、`IMAGE_UPLOAD_MIME_TYPES`、`resolveUploadMaxBytes()`、`resolveMaxImagesPerBatch()` | 上传约束的**单一事实源**（纯常量，client 可引用）。原图落盘 10MB、图片进站上限 50MB；`DEFAULT_MAX_IMAGES_PER_BATCH`=9 是兜底值，真正生效的是后台 Setting `uploadMaxImagesPerBatch`，同时给 `MomentCompose` 与 Android 相册视图（经 `GET /api/upload/limits`）；`resolveUploadMaxBytes()` 被 `handleUpload()` 和该接口**共用**——换算只写一处，避免 P-004 | ✅ |
| `src/lib/uploads/thumbs.ts` | `regenerateThumbs()`、`regenerateThumb2()` | 按 Upload 元数据先本地后 COS 取源；一级 thumb 写本地+COS；二级只本地 | ✅ |
| `src/lib/uploads/finalize.ts` | `finalizeUpload(hash, step)` | 发布时补生成一级/二级 thumb，再把原图+一级 thumb 传到 COS；幂等 | ✅ |
| `src/lib/uploads/hashes.ts` | `collectMediaHashes()`、`firstMediaHash()` | 从正文/封面 URL 抽出媒体 SHA-256，client 可引用 | ✅ |
| `src/lib/uploads/migrate.ts` | `migrateLocalUploadsToCos()` | 补传到新目录树；HEAD 已存在则跳过；顺带补传 thumb | ✅ |
| `src/lib/client/upload.ts` | `uploadAdminFile()`、`uploadAdminFiles()`、`finalizeAdminUploads()`、`editorImageUrl()`、`guessUploadKind()` | 后台 CSRF 上传（全局进度条）；超 10MB 图片先确认再压缩；`defer` 时只入库原图；发布时再 finalize | ✅ |
| `src/lib/client/transfer-hud.ts` | `beginTransfer()`、`hasActiveTransfers()`、`confirmCompressIfNeeded()`、`startHomeLoad()` / `finishHomeLoad()`、`HOME_LOAD_REVEAL_MS` | 顶栏传输任务与超限确认；首页大图加载超过 2 秒才进同一条 HUD，满格后关掉 | ✅ |
| `src/lib/client/compress-image.ts` | `compressImageFile()` | 浏览器端按原 MIME 把图片压到 10MB 以下 | ✅ |
| `src/lib/client/admin.ts` | `adminJson()` | 后台 JSON 请求附带 CSRF | ✅ |
| `src/lib/client/lightbox-zoom.ts` | `zoomAtPoint()`、`applyPinch()`、`containScale()`、`fitCentered()` | 灯箱滚轮/双指缩放纯函数；舞台按原图像素再 scale 进视口 | ✅ |
| `src/lib/client/lightbox-src.ts` | `lightboxOriginalUrl()`、`lightboxProxyFallback()`、`lightboxProxyUrl()` | **灯箱原图取哪条 URL**：站外（COS）直链优先，站内路径才拼 `?proxy=1`；直连失败回退代理（纯函数，配 `lightbox-src.test.ts`）。2026-10-01 实测同一张 4.82MB 原图：站点中转 1.03 MB/s（4.90s）vs COS 直连 8.10 MB/s（0.62s），见 P-119 与 [cos-storage-spec.md](../cos-storage-spec.md) §4 | ✅ |
| `src/lib/admin/http.ts` | `AdminHttpError`、`jsonData`、`jsonPage`、`handleAdminError` | 管理 API 统一错误/响应 | ✅ |
| `src/lib/admin/revalidate.ts` | `revalidatePublicContent()` | 写成功后刷新前台路径 | ✅ |
| `src/lib/admin/errors.ts` | `DataClearError` | 数据清理错误码与 HTTP 状态 | ✅ |
| `src/lib/admin/post-rows.ts` | `AdminPostRow`、`buildAdminPostRows(posts, now?)` | `/admin/posts` 列表行的视图数据（「更新」列文案、`postHref()` 前台地址、`canView` = 已发布且发布时间已到）。放 lib 的原因：两处都要碰"现在"，而组件渲染期间不许调 `Date.now()`/`toLocaleString()`（react-hooks/purity） | ✅ |
| `src/lib/admin/data-clear.ts` | `createPendingDataClear()`、`cancelPendingDataClear()`、`executePendingDataClear()`、`hasPendingDataClear()`、`clearDatabase()` | 更新页数据清理：管理员绑定的一次性令牌、服务端 15 秒闸门、StorageDriver/备份/更新暂存清理与 Prisma 事务；应用重启不会自动执行。`clearDatabase()` 只删库内内容表（含 `MomentVisibilityGroup`、`PenName`），**导出给隔离库验证脚本** `scripts/verify-data-clear.ts` 用；表清单与顺序的事实源是 `lib/data-clear/coverage.ts`，守卫见 P-103 | ✅ |
| `src/lib/validation/post.ts` | `postWriteSchema`（含 `authorName`）、`momentWriteSchema`（含可选 `visibilityGroupId`）、`taxonomyWriteSchema`、`penNameWriteSchema` | 文章/瞬间/分类标签/笔名 zod | ✅ |
| `src/lib/validation/comment.ts` | `guestCommentSchema`、`adminCommentReplySchema`、`adminCommentPatchSchema` | 评论 zod | ✅ |
| `src/lib/validation/settings.ts` | `settingsPutSchema`、`WRITABLE_SETTING_KEYS` | 设置 PUT 白名单（不含 lastBackupAt；含 `updateGithubRepo`、`momentVisibleDays`） | ✅ |
| `src/lib/validation/setup.ts` | `initialSetupSchema` | 创建站点字段：站点名、可选地址/副标题、账号、备份口令 | ✅ |
| `src/lib/data-clear/contract.ts` | `DATA_CLEAR_TARGETS`、`DATA_CLEAR_WAIT_MS`、`dataClearConfirmation()` | 清理范围、15 秒等待常量与精确确认短语 | ✅ |
| `src/lib/data-clear/coverage.ts` | `DATA_CLEAR_DELETE_ORDER`、`DATA_CLEAR_RETAINED_MODELS`、`DATA_CLEAR_CONDITIONAL_MODELS`、`prismaDelegateName()`、`classifyDataClearModel()` | **数据清理覆盖清单**（无 prisma，server/test 都能引）：schema 每张表必须登记成删除 / 保留 / 按条件删，删除顺序 = 依赖顺序。新增 Prisma 模型不同步这里，`pnpm test` 会失败（P-103） | ✅ |
| `src/lib/validation/data-clear.ts` | `dataClearPostSchema`、`dataClearExecuteSchema`、`dataClearCancelSchema` | 清理范围、确认短语、一次性令牌请求校验 | ✅ |
| `src/lib/posts/admin.ts` | `listAdminPosts()`、`createAdminPost()`、`updateAdminPost()`、`deleteAdminPost()` | 后台文章 CRUD（含 `recommend`/`showRevisedAt`/`authorName`）；新建时作者默认取管理员笔名（服务端兜底）；写库前归一正文视频语法；`updateAdminPost()` 逐字段比对后写 `revisedAt`（已发布 + 仍发布 + 读者可见字段真变了才算一次修订，作者也算读者可见，见 P-087）；不用 `publishedWhere()` | ✅ |
| `src/lib/posts/admin-types.ts` | `AdminPostView`（含 `authorName`） | 后台文章投影（client 可引用，无 prisma） | ✅ |
| `src/lib/posts/author.ts` | `AUTHOR_NAME_MAX`、`resolveAuthorName()`、`normalizeAuthorName()` | **作者署名口径的纯函数**（无 prisma，client 可引用）：文章自己填了就用它，否则回落管理员账号的默认笔名，都没有给空串（前台不渲染作者）；写入前把空白归一成 null。编辑器的 `maxLength` 与 `validation/post.ts` 共用这里的上限 | ✅ |
| `src/lib/taxonomy/admin.ts` | `listCategories()`、`createCategory()`、`listTags()`、`createTag()`、`listPenNames()`、`createPenName()` | 分类/标签/笔名清单。笔名只存 name（作者没有独立页面，不需要 slug），新建笔名不 revalidate 公开内容（本身不改变前台输出） | ✅ |
| `src/lib/moments/admin.ts` | `listAdminMoments()`、`createAdminMoment()`、`updateAdminMoment()`、`deleteAdminMoment()` | 后台瞬间 CRUD。每行带 `visibility`（生效天数/到期时刻/是否过期/被谁收紧 `global\|group\|none`）与 `visibilityText` 短语；写入接受可选 `visibilityGroupId`（`null` = 跟随全局，PATCH 传 `null` 才是显式改回全局） | ✅ |
| `src/lib/posts/banner.ts` | `bannerFill()`、`postBannerKind()`、`BANNER_STYLES` | 文章顶 Banner：封面 / 纯色 / 双色渐变；**`postBannerKind()` 是"有没有封面"的唯一判定**（`image` / `fill` / `none`），卡片与缩略图都必须走它，别只看 `cover` 字段（见 P-085） | ✅ |
| `src/lib/posts/import-markdown.ts` | `parseMarkdownImport()` | 发文导入 md/mdx（可选 YAML frontmatter） | ✅ |
| `src/lib/posts/import-halo.ts` | `loadHaloBundle()`、`convertHaloHtmlToMdx()`、`haloHtmlToText()`、`collectUploadRefs()`、`uploadRefToFileName()`、`parseHaloDate()` | **Halo 备份（`decode_backup.py` 的 `decoded/`）→ 本站内容的纯转换层**（无 Prisma / 无 Next）：读 articles+moments 元数据、Halo 正文 HTML → MDX（段落/标题/列表/引用/图片/链接，MDX 危险字符转义）、正文 → 瞬间纯文本。正文有多版时取第一行（最新一版）并给 warning。写库在 `scripts/import-halo.ts`，见 [docs/halo-import-spec.md](../../docs/halo-import-spec.md) | ✅ |
| `src/lib/posts/normalize-content.ts` | `normalizePostContent()` | 保存/打开时把 HTML `<video>` 与视频图片语法归一成 `<Video />` | ✅ |
| `src/lib/posts/lead.ts` | `leadFromContent()`、`LEAD_MAX_CHARS` | 正文开头 → 单行纯文本（剥 frontmatter/代码块/JSX/图片），无封面细条卡的「文章开头一小段」兜底；只进文本节点，不做渲染与消毒 | ✅ |
| `src/lib/moments/query.ts` | `listPublicMoments()`、`listHomeMoments()`、`findVisibleMomentId()`、`toggleMomentLike()` | 前台瞬间列表（点赞数/已赞）、首页概览（无点赞）与 fingerprint 翻转点赞。**列表/总数/首页模块/点赞/评论读与写都共用同一个可见期 where**（`loadMomentVisibilityContext()` + `buildMomentVisibilityFilter()`）；`findVisibleMomentId()` 是"这条瞬间现在可见吗"的公开侧唯一判定，`toggleMomentLike()` 与 `lib/comments/service.ts` 都走它，过期瞬间按「不存在」处理 | ✅ |
| `src/lib/moments/media.ts` | `resolvePublicImageUrl()`、`resolveThumb2Src()` | 瞬间/封面 key → COS 公网 URL；二级 thumb 只拼本地 `/api/uploads`，缺文件回退一级 | ✅ |
| `src/lib/moments/types.ts` | `MomentImage`、`PublicMoment`、`HomeMoment` | 瞬间图片 JSON 与前台/首页投影 | ✅ |
| `src/lib/moments/waterfall.ts` | `layoutWaterfall()`、`fillToHeight()` | 首页瞬间瀑布装箱（横通栏 / 竖两列） | ✅ |
| `src/lib/moments/visibility.ts` | `normalizeVisibilityDays()`、`resolveMomentVisibilityDays()`、`resolveMomentVisibility()`、`describeMomentVisibility()`、`momentVisibilityRemainingDays()`、`momentVisibilityDaysLabel()`、`momentVisibilityPhrase()`、`formatMomentExpiry()`、`buildMomentVisibilityFilter()`、`toVisibilityRuleLookup()`；常量 `MOMENT_VISIBILITY_DAYS_KEY`/`_MAX`/`_GROUP_NAME_MAX`/`_UNLIMITED`、`MOMENT_VISIBILITY_PRESETS` | **瞬间可见期的唯一裁决点**（纯函数，无 prisma）：生效天数 = min(全局, 组)，0 = 不限制；`buildMomentVisibilityFilter()` 是公开查询的唯一 where 来源，**不设条件时必须返回 `undefined`**（返回 `OR: []`/`OR: [{}]` 会被 Prisma 当空集，见 P-095；分组分支必须同时乘全局上限，见 P-096） | ✅ |
| `src/lib/moments/visibility-groups.ts` | `getMomentVisibleDays()`、`loadMomentVisibilityContext()`、`listMomentVisibilityGroups()`、`ensureVisibilityGroupExists()`、`createMomentVisibilityGroup()`、`updateMomentVisibilityGroup()`、`deleteMomentVisibilityGroup()`、`describeVisibilityGroupDeletion()` | 可见范围组 DB 侧：全局天数 + 一次取全所有组给公开查询用；组的增删改（重名 409）；删组返回影响条数并把用它的瞬间回落全局，不删瞬间 | ✅ |
| `src/lib/moments/visibility-group-view.ts` | `resolveGroupView()`、`MomentVisibilityGroupView`、`MomentVisibilityGroupResolved` | 前后端共用的组视图：算「实际生效天数」与 `cappedByGlobal`（组比全局长时标出受全局限制）；详情页、`/api/admin/moment-groups` 的列表视图与发布表单的即时预览都走它，避免三处各算一套；无 prisma，client 可引用 | ✅ |
| `src/lib/moments/compose-types.ts` | `MomentComposeData`、`MomentVisibilityPanelData` | 发瞬间的**纯类型**（无 import 副作用）：单独成文件是为了让 client 组件能引类型而不把 `compose-data.ts → visibility-groups.ts → prisma` 拖进 client bundle | ✅ |
| `src/lib/moments/compose-data.ts` | `loadMomentComposeData()` | 发瞬间的**共享取数**（全局可见期 + 组视图 + 抽屉预览文案 + `nowMs`）：概览页「快速发瞬间」卡与 `/admin/moments` 用同一份，避免两处各算一套可见期文案 | ✅ |
| `src/lib/moments/admin-list-view.ts` | `buildAdminMomentListItems()`、`AdminMomentListItem` | 「瞬间管理」列表的行视图（时间文案、到期时刻、是否过期都由服务端算好）：客户端只渲染不重算可见期，避免两套口径 | ✅ |
| `src/lib/validation/moment-visibility.ts` | `momentVisibilityGroupWriteSchema`、`momentVisibilityGroupPatchSchema` | 可见范围组 zod：组名 1–12 字、天数 1–3650 整数；PATCH 为 partial | ✅ |
| `src/lib/pages/directories.ts` | `STATIC_PAGES_DIR_KEY`、`DEFAULT_STATIC_PAGES_DIR`、`RESERVED_SEGMENTS`、`RESERVED_BLOCK_SEGMENTS`、`normalizeDirectory()`、`normalizeSlug()`、`isReservedForRouting()`、`describeReserved()`、`describeDirectoryConflict()`、`checkReservedSegment()`、`staticPageHref()`、各长度上限常量 | **静态页面地址规则与冲突判定的唯一裁决点**（纯函数，无 prisma，client/test 可引）：保留清单（`posts`/`admin`/`api`/`robots.txt`… 分 block / warn 两档）+ 单段格式校验。判定顺序**先保留清单再字符形态**，否则 `robots.txt` 会给出"格式不对"的错提示。`directories.test.ts` 读真实 `src/app/` 顶层条目守着「保留清单 ⊇ 真实路由」 | ✅ |
| `src/lib/pages/admin.ts` | `getStaticPagesDir()`、`saveStaticPagesDir()`、`describeDirectoryChange()`、`listStaticPages()`、`listEnabledStaticPages()`、`getStaticPage()`、`findPublicStaticPage()`、`createStaticPage()`、`updateStaticPage()`、`deleteStaticPage()`、`StaticPageRecord`、`StaticPageSummary` | 静态页面读写。目录是**单值 Setting**（`getSetting` 自带 60 秒缓存，不再套 `unstable_cache`，保证改完立刻生效）；脏目录回退默认值；`findPublicStaticPage()` 在目录不匹配时**不查库**直接返回 null（让位给框架路由的收敛点）；slug 全库唯一（目录单值 ⇒ slug 唯一即地址唯一），占用 409 `SLUG_TAKEN` | ✅ |
| `src/lib/validation/pages.ts` | `staticPageWriteSchema`、`staticPagePatchSchema`、`staticPagesDirPutSchema` | 静态页面写入的**形状**校验（必填/长度/类型）；地址合法性与保留段判定在 `lib/pages/admin.ts`（那里才有当前目录），占用检查必须查库 | ✅ |
| `src/lib/uploads/locations.ts` | `plannedLocations()`、`keysForDelete()`、`parseUploadDuration()` | 媒体路径清单与删除 key；无 prisma | ✅ |
| `src/lib/uploads/admin.ts` | `listAdminUploads()`、`inspectAdminUpload()`、`deleteAdminUpload()` | 媒体库列表（时间倒序/按 kind）；查看本地+COS 路径体积；删除默认清本地+COS，`keepCos` 只删本地 | ✅ |
| `src/lib/posts/query.ts` | `publishedWhere()`、`listPublishedPosts()`、`getPublishedPostMetaByPublicId()`、`resolveLegacyPostHref()`、分类/标签查询 | 前台唯一查询入口；首页推荐优先 `recommend=true`，一篇都没有时回退最新已发布；**无封面且无摘要的卡片**再用 `leadFromContent()` 从正文开头取一小段兜底（排除密码文）。文章详情投影会**跨表**解析作者署名（文章没填作者时读 `AdminUser.penName`，只在那一种情况下多查一次） | ✅ |
| `src/lib/posts/path.ts` | `postHref()`、`isPublicId()`、`isCanonicalPostName()` | `/posts/{8 位 base62}/{slug\|article}`；无 prisma，client 可引用 | ✅ |
| `src/lib/posts/public-id.ts` | `allocatePublicId()`、`ensurePostPublicIds()` | 生成/补齐 `Post.publicId`；只在服务端用 | ✅ |
| `src/lib/posts/unlock.ts` | `issuePostUnlockCookie()`、`isPostUnlocked()`、token 签验 | publicId 绑定的 2h HMAC 解锁 cookie | ✅ |
| `src/lib/posts/types.ts` | `PostCardModel`、`PostDetailModel`（含 `id`、`authorName`、`revisedAt`、`showRevisedAt`） | 前台投影类型（无 passwordHash/content）；作者（已解析成最终署名）与「已修改」只在详情投影里带字段，卡片投影不带 | ✅ |
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
| `src/lib/utils/` | `logger`、`slugify()`、`fingerprint()`、`getClientIp()`、`cn()`、`parsePage()`、`parsePageSize()`；`date.ts` 的时间口径：`formatPostDate()`、`formatRelativeDate()`、`formatPostDateDetail()`、`formatDateTimeSeconds()`、`formatArchiveMonth()` | 有界依赖的通用工具；中文 slug fallback。三条时间口径别串用：侧栏/归档/搜索仍用 `formatPostDate()`，卡片走只给相对时间的 `formatRelativeDate()`，文章页走 `formatPostDateDetail()`（3 天内相对、超过给精确到秒），「已修改」用 `formatDateTimeSeconds()`；单测 `date.test.ts` | ✅ |

### components/（UI）

| 模块路径 | 用途 | 状态 |
|---|---|---|
| `src/components/layout/` | `SiteHeader`（server：读 `getPublicSettings` + `getSession`，把「是否管理员」下传给 Navbar）、`Navbar`（滑动活动底色 + 首页延后主题按钮；**管理员已登录时多渲染一个「外观」入口 → `/admin?appearance=1`**，访客的 HTML 里没有它）、`Footer`（左下角 `ReleaseMark` + 版本信息行中间的 `UptimeModule`）、`ThemeToggle`、`ThemeInit`（`useServerInsertedHTML` 把防闪烁脚本插进 head，见 P-040）、`SiteShell`、`Sidebar`（组合 `components/widgets/*`，不自己写 UI；文章阅读页 `reading` 只先显示目录）、`PostSidebar`（阅读页右侧按钮展开其余卡片）、`AppChrome`（顶栏导航进度 + 全局 `TransferHud`）、`NavigationProgress`（顶栏 2px 天蓝进度条） | ✅ |
| `src/components/layout/nav-links.ts` | 前台主导航链接表 | ✅ |
| `src/components/widgets/` | `AnnouncementWidget`、`SiteStatsWidget`、`CategoriesWidget`、`TagsWidget`、`RecentPostsWidget`：纯展示（props 进），侧栏与首页模块共用同一份 | ✅ |
| `src/components/home/` | `HomeGrid`（12 列格点；`--cell-*` + `--m-cell-*` 双套变量）、`HomeModuleRenderer`（内置 key → 组件）、`BlockRenderer`（自建模块积木）、`CustomModuleRuntime`（HTML/CSS/JS 注入，见 P-034）、`HomeBanner`（固定底图：解码完成前不显示，就绪后再入场；解码超过 2 秒才用 `TransferHud` 报加载进度，满格后自动关掉；滚动模糊/半透明幕布；高度走格子 `hPct`；后台画布 `trackLoad=false`）、`PostCard`/`PostList`（**封面图**：42% 封面 + 标题 + 摘要 + 标签日期；**纯色/混色**：同一张大卡的封面位画色块（`postBannerKind()` == `fill`）；**真无封面**（bannerStyle=cover 且没选图）：细条卡 `post-card--plain`，只有「标题 + 文章开头一小段 + 右下角时间」；开头那行是「清晰层 + 模糊的文字副本」叠出来的从左到右高斯模糊并变淡，渐变用 px 锚在文字尾部、内层 `fit-content` 壳保证短摘要也有特效，见 P-082/P-083/P-084。**两种卡片的右下角时间都走 `formatRelativeDate()`（最近 / X 天前 / X 个月前 / X 年前），不显示精确日期**）、`ScrollDown` | ✅ |
| `src/components/home/modules/` | `WelcomeModule`（漂浮色块文字走 `config.chips`）、`RecommendModule`、`MomentsModule`（打字机文案 + 二级缩略图瀑布）、`PostsModule`（分类栏 + 大卡 + 分页）、`UptimeModule`（站点运行时间；由 Footer 复用，空开始时间不渲染） | ✅ |
| `src/components/post/` | `WaveDivider`、`PasswordGate`、`PostBody`、`PostHero`（封面/纯色/混色；标题下的元信息行依次是 **作者（笔名，与日期同排同字号同色）** → 时间（3 天内相对、超过三天给精确到秒的日期）→ `showRevisedAt` 且 `revisedAt > publishedAt` 时的「已修改 + 精确到秒的时间」→ 热度 → 标签；作者为空串时不渲染那一项）、`Toc`（h1–h6 层级 + 点击平滑滚动）、`Video`、`Audio`、`ReadingProgress`、`ViewTracker` | ✅ |
| `src/components/moment/` | `MomentList` 瀑布流、`MomentGrid` 九宫格、`LikeButton` | ✅ |
| `src/components/pages/StaticPageRuntime.tsx` | 静态页面的 HTML/CSS/JS 运行时（client）：HTML 原样插入、CSS 不做作用域包裹（独立文档，写 `body{}`/`*{}` 合理）、JS 建 `script` 节点执行并包 `try/catch`。与首页 `CustomModuleRuntime` 同一决策面（P-034）；**刻意不 patch `setTimeout`/`EventTarget.prototype`** 做全局副作用回收（会劫持 React 与全站监听，P-108） | ✅ |
| `src/components/admin/StaticPagesManager.tsx`、`StaticPageEditor.tsx` | 后台静态页面：**目录设置**（改名前二次确认写明"会影响 N 个已用页面、旧地址立即 404"）+ **保留地址清单卡**（block/warn 两档 + 原因）+ 新建 + 列表（地址/状态/内容/最后改动/操作）；编辑器 = 标题/地址名/描述/启用 + HTML/CSS/JS 三栏（带地址预览与非法提示、字数上限）。地址与目录的合法性都在服务端再判一次，不依赖前端校验 | ✅ |
| `src/components/admin/MomentVisibilityPanel.tsx`、`MomentVisibilityGroups.tsx`、`MomentAdminList.tsx` | 后台瞬间页的可见范围三件套：**全局可见期面板**（永久 / 按天数 / 自定义 1–3650，含未保存提示与「此刻起算只有发布在 X 之后的瞬间可见」预览）、**可见范围组管理**（增删；删除前先 GET 预览，二次确认里写明影响几条瞬间、之后按什么规则显示）、**瞬间列表**（每条显示生效可见期、到期时刻、剩余时间、「已过期 · 前台已隐藏」徽章，并可逐条改可见范围）。列表挂在 `/admin/moments` 的「瞬间管理」折叠卡里（`AdminSection defaultOpen={false}`，翻页后自动展开），行数据由 `lib/moments/admin-list-view.ts` 在服务端算好 | ✅ |
| `src/components/comment/` | `CommentSection`（默认 `collapsible` 收起，点标题展开）、`CommentForm`、`CommentItem`（纯文本；蜜罐字段） | ✅ |
| `src/components/common/` | `CoverMedia`（next/image + 透传 loader）、`Pagination`、`EmptyState`、`PageSkeleton`、原生 dialog `Lightbox`（缩略图模糊底 + 原图加载进度 + 约 1s 变清晰；舞台按原图像素再 scale 进视口；同一页 blob LRU 再开走缓存；滚轮/双指缩放，放大后可拖）、`TransferHud`（顶栏多文件传输进度；首页大图加载复用同一条，标题为「加载进度」）、`SearchDialog`（⌘K）、`ReleaseMark`（`APP_RELEASE_LABEL`，现为 0.1.2） | ✅ |
| `src/components/admin/EditorLoader.tsx` | **vendor 编辑器唯一入口**（client + dynamic ssr:false）；实现见 `MdxEditorClient.tsx` | ✅ |
| `src/components/admin/InsertImages.tsx`、`InsertVideo.tsx`、`InsertAudio.tsx`、`MediaInsertMenu.tsx`、`MediaLibraryPicker.tsx`、`VideoJsxEditor.tsx`、`AudioJsxEditor.tsx`、`AdminImageToolbar.tsx`、`EditorPreview.tsx`、`SortableImageGrid.tsx`、`media-drag.ts`、`editor-i18n.ts`、`UploadsToolbar.tsx`、`UploadCard.tsx` | 图片/视频/音频插入弹窗（portal 到 body，可从媒体库导入）；顶部拖动换位；后台预览；瞬间宫格拖拽；媒体库上传进度/查看路径/删除菜单；编辑器中文 | ✅ |
| `src/components/admin/DashboardView.tsx`、`DashboardAppearancePanel.tsx` | 概览页外壳 + 外观面板。**入口在前台导航栏**（`Navbar`，管理员可见 → `/admin?appearance=1`）；面板是**右上角小弹窗**（从外侧划入），自足读写 `/api/admin/settings` 并 `router.refresh()`，开关**从 URL 派生**（不用 state，见 P-079）。概览页外壳：隐藏 = 不渲染该卡；KPI 区 `auto-fit` 自动重排，半宽行**固定两列**、奇数末张占满整行（`auto-fit` 会让 4 张挤成 3+1）；卡片角标 `.admin-dash__hide` 桌面 hover 显现、触屏常驻，点它走乐观更新 + refresh。卡片槽位里的内容是服务端造的元素，必须用**带 key 的 Fragment** 包住（否则 dev 报 key 警告，见 P-104）。**卡片 state 只在 `DashboardView`，页面渲染时带随 cards 变化的 `key`**，服务端新值直接重建 state | ✅ |
| `src/components/admin/MomentCompose.tsx`、`MomentImageButton.tsx`、`MomentScopePicker.tsx`、`MomentSettingsDrawer.tsx` | 发瞬间的**发布区**（取代已删除的 `MomentForm.tsx`）：朋友圈式输入框 + 配图宫格 + 底栏，结构类 `.moment-compose*`。配图按钮是 `<input accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple>`——**纯图片的 accept 正是 Android 客户端「弹自有相册还是系统选择器」的判据**（见 [../android/README.md](../android/README.md)）；能选几张与站点走同一个 Setting（`lib/upload/limits.ts`）。可见范围就地弹卡（「这条瞬间谁可以看多久」），其余设置收进右侧抽屉 | ✅ |
| `src/components/admin/PostEditorForm.tsx`、`PostListRows.tsx`、`SettingsForm.tsx`、`AdminNav.tsx`、`AdminWorkspace.tsx`、`AdminMotion.tsx`、`AdminDialog.tsx`、`AdminSection.tsx`、`useAdminConfirm.tsx`、`BackupPanel.tsx`、`UpdatePanel.tsx`、`DataClearDialog.tsx`、`DeleteButton.tsx`、`CommentRowActions.tsx`、`AdminCommentCompose.tsx` | 后台表单、LazyMotion 壳、桌面左侧竖栏 + 手机底栏/更多 sheet、切页 AnimatePresence、写文章分栏（手机设置 sheet 箭头/背板关闭、分组折叠、当场新建分类/标签/**笔名**、发布组内有**作者**（`<input list>` 下拉选已有笔名 + 直接打字自定义 + 当场新建）与「显示「已修改」」开关）、文章列表行（**点卡片弹「查看 / 编辑」二选一**：查看 = 新标签打开前台文章页，草稿/定时/未到发布时间置灰并说明原因；行数据由 `lib/admin/post-rows.ts` 在服务端算好；同一套 DOM 桌面表格/手机卡片，见 P-072）、确认弹窗、设置/备份/更新分节可折叠、备份/更新面板、数据清理独立圆角弹窗（进度条贴底）、评论审核；侧栏左下角版本角标 | ✅ |
| `src/components/admin/HomeLayoutEditor.tsx` | 首页管理：电脑/手机画框、左栏外观+开关/位置/高度/重置大小，右栏真数据画布（拖动、改宽、改高）；手机端设置/画布标签页。预览节点由 RSC 传入 | ✅ |
| `src/components/admin/ModuleEditor.tsx`、`NewModuleButton.tsx` | 模块管理：积木增删排序 + HTML/CSS/JS 三栏；内置模块只能改名称 | ✅ |
| `src/components/admin/LoginForm.tsx`、`SetupForm.tsx`、`LogoutButton.tsx`、`AccountForm.tsx` | CSRF 登录/创建站点/退出；`SetupForm` 按 `recovery` 切换完整建站或仅重建管理员；改管理员用户名密码（首次强制）。**登录/退出成功后走 `window.location.replace()` 文档级跳转**（鉴权边界不软导航），成功后不复位提交态，按钮禁用到新页面接管（见 P-081） | ✅ |
| `src/types/mdx-editor.d.ts` | `@myblog/mdx-editor` 的 tsc 门面类型（不检查 vendor 源码） | ✅ |

### M1 入口与路由

| 模块路径 | 用途 | 状态 |
|---|---|---|
| `src/instrumentation.ts` | Node runtime 先 `applyPendingRestore()`，再初始化 + scheduler 幂等注册。程序更新不在这里做，由 `scripts/boot.cjs` 在拉起 Next 之前 `applyPendingUpdate()` | ✅ |
| `src/proxy.ts` | Next 16 安全头（含 `object-src 'none'`、后台 `no-store`、HTTPS 时 HSTS）、CSRF、后台乐观拦截、登录/创建 5 次/15 分/IP 限速（策略在 `lib/auth/login-limit.ts`）；转发 `x-myblog-pathname` | ✅ |
| `src/app/api/auth/{csrf,login,logout,setup}/route.ts` | 认证公开 API；setup 仅零管理员，按主机半钥状态选择完整初始化或仅补建管理员；**登录成功清掉该 IP 的限速记账** | ✅ |
| `src/app/api/upload/route.ts`、`api/upload/limits/route.ts`、`api/uploads/[...path]/route.ts` | 管理员入库原图；**公开只读 `GET /api/upload/limits`**（`{maxImages,maxBytes,imageTypes}`，给 Android 壳决定相册一次能选几张；换算与 `handleUpload()` 共用 `lib/upload/limits.ts`，改后台 Setting 即变）；公开流式/Range；COS 原图默认 302，`?proxy=1` 同源流式（灯箱进度） | ✅ |
| `src/app/api/posts/[slug]/{unlock,view}/route.ts` | 密码解锁；IP+slug 60s 浏览量去重 | ✅ |
| `src/app/api/comments/route.ts` | 公开 GET approved 树 / POST 游客 pending（CSRF+频控+蜜罐） | ✅ |
| `src/app/api/search/route.ts` | 公开搜索（LIKE 转义；60 次/分/IP） | ✅ |
| `src/app/api/moments/route.ts`、`api/moments/[id]/like/route.ts` | 瞬间流；点赞翻转（20 次/分/IP）。两者都带**可见期过滤**：过期瞬间点赞返回 404 | ✅ |
| `src/app/api/admin/moment-groups/route.ts`、`api/admin/moment-groups/[id]/route.ts` | 可见范围组 GET/POST 与 GET（删除前预览）/PATCH（改名改天数）/DELETE（不删瞬间，回落全局）；重名 409 | ✅ |
| `src/app/admin/login/page.tsx`、`src/app/admin/setup/page.tsx` | 管理员登录页（读 `?next=` 并用 `adminNextPath()` 校验后交给表单）；无管理员时按主机半钥状态显示创建站点或重建管理员页 | ✅ |
| `src/app/api/admin/**/route.ts` | session/stats/posts/preview/categories/tags/**pen-names**/moments/comments/uploads（含 thumbs/regenerate、thumbs2/regenerate、migrate、finalize）/settings（含 usage 手动扫描）/backup（含 restore、upload、passphrase、pull、encrypt）/update（含 pack、upload、download、apply、github、clear）/**moment-groups**/cos/test/account | ✅ |
| `src/app/admin/(protected)/layout.tsx`、`page.tsx` | 服务端 session 守卫 + 左侧竖栏工作区；概览页 = 统计查询 + 卡片 `slots`（**含「快速发瞬间」卡**，取数走 `lib/moments/compose-data.ts`，与瞬间页同一份） | ✅ |
| `src/app/admin/(protected)/posts/` | 文章列表（行组件 `components/admin/PostListRows.tsx`，点卡片选查看/编辑） / 新建（左设置右编辑器） / 编辑 | ✅ |
| `src/app/admin/(protected)/moments/page.tsx` | 瞬间页，自上而下两块：**发布区**（朋友圈式输入框 + 图片按钮 + 可见范围，详细设置走右侧抽屉）/ **「瞬间管理」折叠卡**（默认折叠，逐条改可见范围或删除，10 条一页 `?page=`，翻页后自动展开）；取数走 `lib/moments/compose-data.ts` + `listAdminMoments()` | ✅ |
| `src/app/admin/(protected)/comments/page.tsx` | 评论审核（通过/拒绝/删除/回复） | ✅ |
| `src/app/admin/(protected)/pages/page.tsx`、`pages/[id]/page.tsx` | 静态页面目录设置 + 页面列表 / 页面编辑（HTML/CSS/JS 三栏）。URL 为 `/admin/pages` 与 `/admin/pages/[id]` | ✅ |
| `src/app/(static)/layout.tsx`、`(static)/[dir]/[slug]/page.tsx` | **静态页面公开路由**：`/{Setting staticPagesDir}/{slug}`。路由组 `(static)` 不进 URL，它的 layout 用带 `.static-page-shell` 前缀的样式把站点页头/页脚藏掉（父布局卸载不掉，见 P-108）。`[dir]/[slug]` 是 Next 里**优先级最低**的动态段：框架与站内路由永远优先，静态页自动让位；目录命中保留段或页面未启用/不存在 → `notFound()`。页面里只认单段 slug，更深的路径一律 404 | ✅ |
| `src/app/api/admin/pages/route.ts`、`pages/[id]/route.ts`、`pages/dir/route.ts` | 静态页面 API：列表（含 `dir` 与保留清单）/ 新建、详情与部分更新与删除、目录体检（GET `?dir=`，返回会影响几个页面）与目录保存（PUT）。`dir` 是字面段，优先级高于同层 `[id]` | ✅ |
| `src/app/admin/(protected)/uploads/page.tsx` | 媒体库：上传/时间排序/查看路径/删除菜单 | ✅ |
| `src/app/admin/(protected)/backups/page.tsx` | 备份列表（时间/大小/版本/是否加密）/ 加密开关 / 上传备份入库 / 预约重启时间或立刻重启 | ✅ |
| `src/app/admin/(protected)/updates/page.tsx` | 程序更新：打包 / 导入 / GitHub 检查 / 预约应用与重启；危险操作中清理数据；与预约恢复互斥 | ✅ |
| `scripts/boot.cjs` | `pnpm dev` / `pnpm start` / pm2 统一入口：先 `apply-pending-update.ts`，再 `require` Next CLI（同一 PID） | ✅ |
| `scripts/pack-update.ts` | `pnpm pack:update`：当前 `main/` 或 `--git <ref>` 打更新包（`--out` 可另存） | ✅ |
| `scripts/apply-pending-update.ts`、`apply-update.ts` | boot 启动前应用到期更新；`pnpm apply-update --file` 入库并预约；`--pending [--start]` 当场应用 | ✅ |
| `scripts/install.sh` | Linux 空机首装：install / migrate deploy / build；不 seed | ✅ |
| `scripts/restore-backup.ts` | `pnpm restore`：停服后当场恢复，或 `--pending` 预约；换机 `--passphrase` | ✅ |
| `scripts/relaunch-app.cjs` | 等原进程退出后拉 `scripts/boot.cjs`（找不到才回退 next bin）；`windowsHide`；pm2/systemd 不走此脚本 | ✅ |
| `scripts/ui-shot.mjs` | `pnpm shot <path>`：**开发期 UI 验证**——对着已在跑的 server 出图 + 量尺寸（桌面/窄屏），复用浏览器 profile、不碰数据库、不启服务；见 P-086 | ✅ |
| `scripts/init-production.ts` | `pnpm setup`：手设站点名称、管理员与不可改的备份口令；无默认 MyBlog | ✅ |
| `src/app/admin/(protected)/settings/page.tsx` | 站点设置 KV 表单；本机占用须点「扫描」才算一次 | ✅ |
| `src/app/admin/(protected)/home/page.tsx` | 首页管理（左设置 + 右画布） | ✅ |
| `src/app/admin/(protected)/modules/page.tsx`、`modules/[id]/page.tsx` | 模块目录列表 / 模块编辑器 | ✅ |
| `src/app/layout.tsx`、`globals.css` | 中文根布局、Heo 双主题+玻璃 token；无管理员则转到创建页；防闪烁只走 `ThemeInit`，禁止在 layout 里写 `<script>`（P-040） | ✅ |
| `src/app/admin/layout.tsx`、`src/app/admin/admin.css` | 后台共用外壳 + 独立样式。token 挂 `:root`（含 `:root[data-theme="dark"]` 派生），主色**可切换**：`layout.tsx` 读 Setting `adminAccent` → `adminAccentStyle()` 注入 `--admin-accent*` 锚点（浅色/暗色各一组，`:root:root` 提特异性，零闪烁零 JS），admin.css 提供派生色阶与全部几何，不跟 `--heo-theme`。配色值单一事实源为 `src/lib/admin/accents.ts`（见 P-076）。基元 `.admin-btn` / `.admin-field` / `.admin-card` / `.admin-list` / `.admin-stagger`。**暗色是"变量切换"不是"另写一套"：颜色只走 `--admin-*`，别在 `[data-theme="dark"]` 里对整族选择器统一钉颜色（(0,2,0) 会盖掉 (0,1,0) 的 `.x--变体`，见 P-090）；vendor 编辑器只在 `:root[data-theme="dark"] .admin-mdx-editor…` 块里覆盖 `--base*` / Radix 色阶（P-029），改完用对比度审计复核**。**浮层与编辑区必须显式分层**：标题行 `z-index:2`、编辑区 `z-index:1`（各自成栈上下文），否则编辑器内部的 z-index（工具栏 6）会跨子树压住标题行的 ⓘ 说明卡（P-091）。`AdminMotion` 挂在 `AdminWorkspace` 根部。瞬间可见范围的样式也在本文件尾部：`.admin-section__divider`、`.moment-visibility`/`.moment-visibility__custom`、`.moment-group-list`/`.moment-group`/`.moment-group__name`/`.moment-group__spacer`/`.moment-group-create`、`.moment-admin__controls`、`.moment-form`（含 `__textarea` / `__file-input` / `> .admin-field`）与 `.admin-moment-content p`/`.admin-moment-meta`/`.admin-moment-time`/`.admin-moment-badge`（只补布局，颜色/圆角沿用 `.admin-chip` / `.admin-field` / `.admin-badge`；这几个 `.admin-moment-*` 曾是 P-097 的裸引用，已补齐并有自查脚本） | ✅ |
| `src/app/page.tsx` | 首页：只取布局 + 渲染 `HomeGrid`。**禁止在这里堆一次性 JSX**（P-035） | ✅ |
| `src/app/posts/`、`categories/`、`tags/`、`archives/`、`moments/`、`messages/`、`search/`、`not-found.tsx`、`loading.tsx` | 前台路由；文章为 `/posts/[publicId]/[name]`；单段旧链走 `[publicId]/route.ts` 301；列表骨架在 `(listing)` | ✅ |
| `src/app/sitemap.ts`、`robots.ts`、`rss.xml/route.ts` | sitemap / robots / RSS；密码文进 sitemap 但不进 RSS 正文 | ✅ |
| `prisma/seed.ts` | bootstrap（含内置首页模块）+ 幂等演示 10 篇文章 / 分类标签 / 2 条瞬间 | ✅ |
| `src/lib/home/layout-model.test.ts` | 格点分组/重叠下移/12 列裁剪的单测（`pnpm test`） | ✅ |
| `src/lib/utils/date.test.ts` | 时间口径：文章页 3 天内相对 / 超过给精确到秒；卡片只给相对（天/月/年）；旧的 `formatPostDate` 行为不变 | ✅ |
| `src/lib/layout/viewport.test.ts`、`src/lib/layout/box.test.ts` | 走手机套判定；盒子裁剪与双视口 pick/merge | ✅ |
| `src/lib/utils/fingerprint.test.ts`、`src/lib/seo/site.test.ts` | 客户端 IP 不信 XFF 第一跳；站点源只认 https/本机 | ✅ |
| `src/lib/backup/tar.test.ts`、`crypto.test.ts`、`host-secret.test.ts`、`plain.test.ts`、`restore.test.ts`、`restart.test.ts`、`encrypt-policy.test.ts`、`inspect.test.ts`、`src/lib/release.test.ts`、`src/lib/update/update.test.ts`、`src/lib/admin/data-clear.test.ts`、`src/lib/validation/data-clear.test.ts`、`src/lib/validation/backup.test.ts`、`src/lib/scheduler/backup.test.ts`、`src/lib/data-clear/coverage.test.ts` | 解包白名单；AES 往返；XOR/口令重建；历史 ephemeral 清理；加密/明文包恢复；进程监护走 boot.cjs；COS HTTPS 默认关加密；包内版本检视；更新包路径/往返覆盖/拒绝 data/；清理令牌绑定、15 秒闸门、取消与确认短语；**备份口令可选**（非加密备份与恢复不带口令，见 P-122）；**周期备份的到期判定**（空值/坏日期算到期、边界取等号、非法周期回落 3 天，见 P-123）；**数据清理覆盖守卫**（schema 全表 ↔ coverage 清单 ↔ `clearDatabase()` 真实 `deleteMany`，扫描前先 `stripComments()`，见 P-103） | ✅ |
| `src/lib/storage/cos-config.test.ts`、`src/lib/uploads/migrate.test.ts`、`src/lib/uploads/usage.test.ts`、`src/lib/uploads/locations.test.ts`、`src/lib/uploads/hashes.test.ts`、`src/lib/upload/compress.test.ts`、`src/lib/storage/media-keys.test.ts`、`src/lib/posts/path.test.ts`、`src/lib/moments/waterfall.test.ts`、`src/lib/moments/visibility.test.ts` | COS URL；迁移/媒体 key；本机占用分类；正文抽 hash；原格式压到限额；删除路径清单；base62 文章路径；首页瀑布装箱（不打真实桶）；瞬间可见期 12 用例（含「组比全局长时必须乘上全局上限」与「绝不输出 notIn」两条回归） |
| `scripts/verify-moment-visibility.ts` | 瞬间可见范围的 **DB 级验证脚本**（临时脚本，跑在 scratch 库上，不碰 `data/blog.db`）：真实 Prisma 查询条件验证裁决、删组回落、组名唯一；7 项检查全通过。跑法写在文件头注释（`DATABASE_URL` + `prisma migrate deploy` → `DATABASE_PATH` + `npx tsx`）。**不进 `pnpm test`** | ✅ |
| `scripts/verify-data-clear.ts` | 数据清理的 **DB 级验证脚本**（临时脚本，跑在 scratch 库上；脚本自己会拒绝在 `data/blog.db` 上跑）：铺齐全表数据 → 调 `clearDatabase(true,false)` / `(false,true)` → 断言内容表清空、保留表原样、返回计数与铺的条数一致；7 项全通过（可见范围组 1 → 0、笔名 1 → 0）。跑法同左。只验数据库这段，媒体/备份/更新暂存的真删不在脚本里跑。**不进 `pnpm test`** | ✅ |
| `src/lib/posts/import-halo.test.ts` | Halo 正文 → MDX 的 10 项单测：段落/标题/加粗斜体/图片（可解析才保留）、`javascript:` 链接退化、MDX 危险字符转义 + `<br />`、列表与引用（含一层嵌套）、`--keep-indent` 只在开关打开时补全角缩进、HTML → 瞬间纯文本、`/upload/` 引用归一（含百分号编码与 query）、多版正文取最新一版并给 warning、瞬间媒体顺序去重（`pnpm test`） | ✅ |
| `scripts/import-halo.ts` | `pnpm import:halo --dir <decoded> [--apply] [--dump <目录>] [--no-cos] [--include-deleted] [--skip-drafts] [--skip-pages] [--update-posts] [--keep-indent]`：**Halo 备份导入**（文章 / 瞬间 / 自定义页面 + 图片）。缺省只预览不写库；图片经 `lib/storage` 落盘 + `finalizeUpload` 生成一级/二级缩略图（配了 COS 再 `replicate`）；文章按 slug、页面按 slug、瞬间按 `(createdAt, content)` 判重，可重复跑。**写库不经过 `next/cache`**（CLI 里 `revalidatePath` 会抛，见 P-114），导入后要重启应用；瞬间按原来的 `releaseTime` 落 `createdAt`，所以目标机 `momentVisibleDays` 必须允许这么久。见 [docs/halo-import-spec.md](../../docs/halo-import-spec.md) | ✅ |
| `scripts/check-admin-classes.mjs` | **P-097 / P-077 的类名自查**：把瞬间相关组件（`MomentCompose` / `MomentImageButton` / `MomentScopePicker` / `MomentSettingsDrawer` / `MomentVisibilityPanel` / `MomentVisibilityGroups` / `SortableImageGrid` / `MomentAdminList` / `moments/page.tsx`）、**概览页**（`DashboardView` / `admin/(protected)/page.tsx`）与**静态页面**（`StaticPagesManager` / `StaticPageEditor` / `pages/page.tsx` / `pages/[id]/page.tsx`）引用的 `admin-*` / `moment-*` 类名与 `admin.css` 逐个比对，**缺失即非零退出**；实测「引用类名 157 个，缺失 0 个」。跑法 `node scripts/check-admin-classes.mjs`（纯 node，无依赖）。**不进 `pnpm test`**，改后台类名后手动跑；新增同类组件把文件加进脚本的 `FILES` 列表 | ✅ |

### editor/（vendor 冻结子树）

| 路径 | 说明 |
|---|---|
| `src/editor/` | mdx-editor v4.2.3 源码（MIT，排除 examples/test）。内部 `@/` 已改为 `@/editor/`。CSS mixins 已一次性展开。**禁止升级依赖、禁止用 `@/`（非 @/editor）引项目代码**。运行时由 `next.config.ts` 将 `@myblog/mdx-editor` 指到 `index.ts`；vendor `globals.css` 由后台 protected layout 引入（Next 禁止组件内 import 全局 CSS）；后台自身样式走 `src/app/admin/admin.css` |

### 入口命令一览

| 命令（main/ 下） | 说明 |
|---|---|
| `pnpm dev` | 开发（Windows 调试）；经 `scripts/boot.cjs`，启动前检查预约更新 |
| `pnpm shot <path>` | 开发期看 UI：对已在跑的 server 截图 + 量尺寸（`--measure` / `--json` / `--view`），不碰数据库（P-086） |
| `pnpm build` / `pnpm start` | 构建 / 生产启动（`start` 同样走 boot.cjs；更新后才会 `next build`） |
| `pnpm prisma migrate dev` / `studio` | 迁移 / 数据库 GUI |
| `pnpm db:seed` | 幂等演示数据（已有文章则跳过） |
| `pnpm setup` | 投产初始化：站点名称、管理员账号与备份口令（口令不可再改） |
| `pnpm import:halo --dir <decoded>` | **Halo 备份导入**：缺省只预览（不写库不写盘），加 `--apply` 才真正导入；先 `--dump <目录>` 复核转换结果（见 [halo-import-spec.md](../../docs/halo-import-spec.md)） |
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
