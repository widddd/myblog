# docs/android/ — Android 客户端专用文档

> 本目录只放 Android 客户端（GeckoView 宿主）相关文档，与 `docs/` 根下站点/后台文档分离。
> 站点与后台文档仍在 `docs/`，总纲仍是根目录 `AGENTS.md`。

## 为什么单独放

Android 工程位于 **`androidapp/`（与 `main/` 平级）**，与站点共用同一个仓库，但**构建链、工具链、依赖体系完全不同**（Gradle / Android SDK / GeckoView 二进制 vs pnpm / Next / Node）。
混进 `docs/` 根目录会让「改站点时该读哪份文档」变得含糊，故物理隔离。

⚠️ **不是 `main/android/`。** 放 `main/` 里会被 `main/tsconfig.json` 的 `**/*.ts`（递归全仓 include，exclude 里只排除了 `node_modules` 与 `src/editor`）和 ESLint 扫到；平级目录天然避开这两个扫描面，不需要改任何隔离配置。

## 与 `docs/` 的关系

| 维度 | 说明 |
|---|---|
| 站点 / 后台 / API / 数据模型 | 仍在 `docs/`，由 `AGENTS.md` 统一索引 |
| **Android 客户端** | 本目录；`AGENTS.md` §3 导航已加行指向本目录 |
| 冲突时 | 以 `AGENTS.md` 红线为准（与原有规矩一致） |

## App 身份（当前值）

| 项 | 值 | 备注 |
|---|---|---|
| 显示名 | **SmartBlog** | `res/values/strings.xml` 的 `app_name`；桌面图标与最近任务里显示的就是它 |
| 图标 | 自适应图标：蓝渐变底 + **「和自己对话」气泡**（实心气泡 + 半透明回声气泡 + 指回自己的尾巴） | 设计源 `docs/android/icon.svg`（含设计说明）；Android 侧 `drawable/ic_launcher_background.xml` + `ic_launcher_foreground.xml` + `mipmap-anydpi-v26/ic_launcher.xml`。minSdk 26 ⇒ 只需要 anydpi-v26 这一档 |
| 包名 / applicationId | `com.smartblog.app` | 与显示名一致（2026-10 从 `com.myblog.client` 改过来；**未分发前改的，代价为零**） |
| Kotlin 包 / 目录 | `com.smartblog.app` → `app/src/main/java/com/smartblog/app/` | 与 applicationId 同名，省得两套名字对不上 |
| 主题 | `Theme.SmartBlog` | `res/values/themes.xml` + manifest 引用 |
| SharedPreferences | 文件名 `smartblog`；键 `site_url`（地址） | `MainActivity.PREFS_NAME`。**该键只是用户自定义覆盖**：没有它时用 `AppUrl.DEFAULT_SITE_URL`（见 [architecture.md](architecture.md) §2）。通知层的键（`push_*`）**共用同一个文件**（见 [architecture.md](architecture.md) §10） |
| Gradle 工程名 | `smartblog-client` | `settings.gradle.kts` |
| 版本 | `versionCode 4` / `versionName 0.1.3` | Android 客户端版本**与站点版本各自独立**，不做绑定 |
| minSdk / targetSdk | 26 / 35 | 26 是 GeckoView 的硬要求 |
| 权限 | `INTERNET` + `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`（13+；≤32 是 `READ_EXTERNAL_STORAGE`，相册视图用，拒绝即退回系统选择器）+ `POST_NOTIFICATIONS` / `WAKE_LOCK` / `RECEIVE_BOOT_COMPLETED`（消息提醒用） | 明文 HTTP 不走系统开关，由 App 自己判定并弹警告。**刻意不要** `SCHEDULE_EXACT_ALARM` / `FOREGROUND_SERVICE` / `IGNORE_BATTERY_OPTIMIZATIONS`，理由见 [push-plan.md](push-plan.md) §4 |
| 备份 | `allowBackup="false"` | App 数据里有 GeckoView profile（含会话 cookie），开着会进云备份 |

## 目录内容

| 文件 | 职责 |
|---|---|
| `README.md` | 本文件：边界、App 身份、索引 |
| `architecture.md` | 宿主结构：视图分层、站点地址存储、**App 身份（UA 标记）**、返回键语义、深浅色跟随、浮动入口、已知坑（Android 侧） |
| `build.md` | 工具链、版本组合的三条硬约束、ABI、构建/安装、模拟器、体积、wrapper 恢复、**JVM 单测** |
| `photo-edit-spec.md` | **相册预览与图片编辑 Spec**：像微信一样的预览（滑动/缩放/勾选）+ 编辑器四件套（涂鸦/两种马赛克/裁剪/旋转，撤销重做）、编辑产物的落盘与上传口径、通知深链修复口径、验收标准 |
| `debug.md` | 三个证据源（dev 日志 / logcat / 截图）、判据表、已知坑索引 |
| `push-plan.md` | **可推送消息方案**（RSS 时效实测口径、三条候选路线与取舍、管理员不收推送的规则、分阶段落地与验收） |
| `icon.svg` | App 图标设计源（108 画布，与 Android vector 逐路径对应） |
| `../geckoview-client-spec.md` | 立项 Spec（含设备实测依据、坐标、决策 D1–D4） |

## 客户端当前能力

- **首启直达默认站点，不再进地址表单**：没存过地址就去 `AppUrl.DEFAULT_SITE_URL`（`https://bruccese.com`）；`BuildConfig.START_URL` 是构建期覆盖（模拟器指向 `http://10.0.2.2:3000`）。历史默认值一次性迁移、用户自己填过的地址不动 —— 规则全在 `AppUrl.kt`（纯逻辑 + JVM 单测），见 [architecture.md](architecture.md) §2。
- **App 会在 UA 里自报家门**：`<内核默认 UA> SmartBlog/<版本>`，站点据此认出「这一发来自 App」（首页不渲染「推荐应用」卡、将来的推送抑制都靠它）。判定实现是追加式，不改内核默认 UA 前半段，见 [architecture.md](architecture.md) §2b。
- **右下角浮动入口**：返回上一页（网页历史回退，无历史时置灰）/ 刷新 / 修改网站地址。位置距底 68dp = 后台底栏 56px + 12dp 间隙（实测定的，见 [architecture.md](architecture.md) §5）。
- **文件上传可用**：图片 / 视频 / 音频 / 任意文件（`.md`、`.tar.gz` 等）都能真正传到页面。宿主实现了 `PromptDelegate.onFilePrompt` 并把 `content://` 转成 `file://`——这两条缺一条就是"点了上传没反应"，见 [architecture.md](architecture.md) §6b。
- **图片走自有全屏相册**：`accept` 是**纯图片**时弹 App 自己的相册（读系统相册、三列网格、本地解码缩略图、**不引第三方图片库**），顶部一行可**切换相册集**（全部照片 / 相机 / 截图 / 微信…，带张数），而不是系统文件选择器；**能选几个由服务端决定**（后台 Setting `uploadMaxImagesPerBatch`，默认 9 → `GET /api/upload/limits`）。勾选走每格右上角的角标，**点缩略图进预览**。相册权限被拒绝时自动退回系统选择器。带音频/扩展名的 accept（导入 Markdown、更新包、媒体库「文件视图」）行为完全不变。见 [architecture.md](architecture.md) §6b。
- **相册也能选视频 + 内置 ffmpeg 压缩（2026-10）**：`accept` 是「纯视频」或「图片+视频」（**不含音频**）时同样弹自有相册 —— 网格里视频用系统缩略图 + ▶/时长角标，点开进 `VideoPreviewView`（系统 `VideoView` + 播放控制 + 「选择」）。允许视频时顶部多一行**「自动压缩视频」勾选框（默认开）**：码率 > 4 Mbps、大小 > 50 MB、超过站点单文件上限（`maxBytes`）、或**容器不是 mp4/webm**（`.mkv`/`.mov` 站点不收，压缩正好是把它们转成 mp4 的那一步）时，点「完成」后先用内置 ffmpeg（`ffmpeg-kit-min-gpl`，含 x264）压一遍再交给页面；压缩中显示 `正在压缩 n/N · x%` 并可取消；失败/取消就交原文件（不让一个压不了的视频卡住整条发布）。**两条硬约束**：① **超过 30 分钟的视频一律不许发**（产品规则；勾选框关掉也拦、设备没带 ffmpeg 也拦）；② 压不进站点上限的视频**直接拒绝并给一句人话**（例如「42:01 太长，压不到 10MB 以内」），不会傻编十几分钟。判定与目标参数是纯逻辑 `CompressPolicy.kt`（JVM 单测），执行在 `VideoCompressor.kt`，媒体判定在 `MediaKinds.kt`，缺字段时的元信息兜底在 `MediaProbe.kt`（字段齐了就不调 native）。见 [architecture.md](architecture.md) §6b-1 / §6b-3 与 [../moment-video-spec.md](../moment-video-spec.md) §2.5。
- **预览与图片编辑（像微信）**：点缩略图进大图 —— 左右滑翻张（松手吸附）、双指缩放 1–5x、双击放大/还原、底部「选择 / 编辑」、右上「完成(N)」；编辑器四件套：**涂鸦**（8 色 + 粗细）｜**马赛克**（像素马赛克 + 模糊两种，各带粗细）｜**裁剪**（自由 + 1:1/4:3/16:9，框可拖）｜**旋转**（左/右 90°），带**撤销 / 重做**。编辑结果只落 App 缓存（长边 ≤2560、JPEG q92），**上传的是编辑版、系统相册原图不动**；再编辑以编辑版为源。见 [architecture.md](architecture.md) §6b-2 与 [photo-edit-spec.md](photo-edit-spec.md)。

- **下拉框与日期时间可用**：`<select>`（含多选）与 `<input type="date|time|datetime-local|month|week">` 弹的是**自绘卡片式选择器**（列表 / 月历 / 时·分两列），沿用「请输入网站地址」那套配色、圆角与按钮，跟着系统深浅色走（切换主题时开着的卡片会当场重画）。这两类控件的弹层 **Gecko 自己画不出来**，宿主不接管就只剩一个焦点圈——看着"控件正常但点不动"；而系统那套选择器改不动配色、放进来一眼出戏，所以自己画。见 [architecture.md](architecture.md) §6c。
- **开屏 logo**：启动先显示「圆形 logo 居中 + 跟随系统深浅色的纯色背景」，**没有其它任何元素**；首屏加载完（或首启表单出现）即撤，最短 1.2s、最长 6s。见 [architecture.md](architecture.md) §9。
- **消息提醒（可推送消息，路线 A）**：站点有新文章/新瞬间时用系统通知告知；App 可见时 60 秒一轮（近实时），后台走 `AlarmManager` 12 分钟巡检（Doze 里可能更久）。**在 App 里登录过后台就不推**（用户钦定，服务端 + 本地双判）；首次同步只建基线，不刷一屏历史。入口在右下角 ⋮ →「消息提醒」（两个开关 + 状态行）。实现与实测见 [architecture.md](architecture.md) §10 / [push-plan.md](push-plan.md)。
- **登录态跨重启保留**：站点会话 cookie 是 7 天有效期的持久化 cookie，GeckoView 落在 `cookies.sqlite`；强杀进程重启后仍在登录态。四种要重登的情况见 [architecture.md](architecture.md) §8（含「换 host = 换 cookie jar」）。
- 返回键：能后退就后退，到根页退出；地址表单开着时语义见 [architecture.md](architecture.md) §3。
- 明文 HTTP 弹一次警告（判定看 **URL 协议**，不维护地址表；宿主自己也发 http 请求取上传上限，所以清单开了 `usesCleartextTraffic`，见 [architecture.md](architecture.md) §6）。

**尚未做**（Spec 里的后续阶段）：路线 B/C 的"真推送"（Web Push 走 Mozilla 中转 / 自建长连接，见 [push-plan.md](push-plan.md) §3）、应用内"新内容"小红点、`ACTION_SEND` 分享入口、离线草稿、阅读 Tab；相机拍照上传（`ACTION_IMAGE_CAPTURE`，需要 FileProvider，站点没用到 `capture` 属性所以优先级低）；编辑器里的贴纸 / 文字 / 表情与滤镜（亮度、对比度）。

> ⚠️ Spec 仍在 `docs/` 根，**待迁入本目录**（`docs/android/geckoview-client-spec.md`），以兑现「Android 专用文档都在 `docs/android/`」这条不变量。它的内容也有待按实测回填：工程路径（`main/android/` → `androidapp/`）、APK 体积（估算 85–95 MB → 实测 186 MB / x86_64 346 MB）、`minSdk`（估计 → 从 AAR 的 `AndroidManifest.xml` 实读为 26）。

## 与主仓文档的分工

- **Android 特有的坑**（内核、Gradle、宿主地址、ABI、宿主视图）写在本目录（`architecture.md` §7 / `debug.md` §6）。
- **跨端 / 服务器 / 站点侧**的坑仍写 `docs/pitfalls.md`（例如 **P-110** 那条：宿主地址不在 `allowedDevOrigins` 会让 App 里的页面根本不 hydrate——它的修法在站点配置里，所以登记在站点 pitfalls，本目录只做索引）。
