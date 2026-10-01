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
| SharedPreferences | 文件名 `smartblog`，键 `site_url` | `MainActivity.PREFS_NAME` |
| Gradle 工程名 | `smartblog-client` | `settings.gradle.kts` |
| 版本 | `versionCode 1` / `versionName 0.1.0` | 与站点版本（0.1.1）各自独立，不做绑定 |
| minSdk / targetSdk | 26 / 35 | 26 是 GeckoView 的硬要求 |
| 权限 | 只有 `INTERNET` | 明文 HTTP 不走系统开关，由 App 自己判定并弹警告 |
| 备份 | `allowBackup="false"` | App 数据里有 GeckoView profile（含会话 cookie），开着会进云备份 |

## 目录内容

| 文件 | 职责 |
|---|---|
| `README.md` | 本文件：边界、App 身份、索引 |
| `architecture.md` | 宿主结构：视图分层、站点地址存储、返回键语义、深浅色跟随、浮动入口、已知坑（Android 侧） |
| `build.md` | 工具链、版本组合的三条硬约束、ABI、构建/安装、模拟器、体积、wrapper 恢复 |
| `debug.md` | 三个证据源（dev 日志 / logcat / 截图）、判据表、已知坑索引 |
| `icon.svg` | App 图标设计源（108 画布，与 Android vector 逐路径对应） |
| `../geckoview-client-spec.md` | 立项 Spec（含设备实测依据、坐标、决策 D1–D4） |

## 客户端当前能力

- **首次启动必填站点地址**（黑/白底跟随系统，**不自动弹键盘**），确认后才访问；地址存在 `SharedPreferences`，`BuildConfig.START_URL` 只当预填值。
- **右下角浮动入口**：返回上一页（网页历史回退，无历史时置灰）/ 刷新 / 修改网站地址。位置距底 68dp = 后台底栏 56px + 12dp 间隙（实测定的，见 [architecture.md](architecture.md) §5）。
- **文件上传可用**：图片 / 视频 / 音频 / 任意文件（`.md`、`.tar.gz` 等）都能真正传到页面。宿主实现了 `PromptDelegate.onFilePrompt` 并把 `content://` 转成 `file://`——这两条缺一条就是"点了上传没反应"，见 [architecture.md](architecture.md) §6b。
- **图片走自有全屏相册**：`accept` 是**纯图片**时弹 App 自己的相册（读系统相册、三列网格、本地解码缩略图、**不引第三方图片库**），顶部一行可**切换相册集**（全部照片 / 相机 / 截图 / 微信…，带张数），而不是系统文件选择器；**能选几张由服务端决定**（后台 Setting `uploadMaxImagesPerBatch`，默认 9 → `GET /api/upload/limits`），单选入口（封面）点一张即返回。相册权限被拒绝时自动退回系统选择器。其它 accept（视频/音频/任意文件/混合媒体）行为完全不变。见 [architecture.md](architecture.md) §6b。
- **开屏 logo**：启动先显示「圆形 logo 居中 + 跟随系统深浅色的纯色背景」，**没有其它任何元素**；首屏加载完（或首启表单出现）即撤，最短 1.2s、最长 6s。见 [architecture.md](architecture.md) §9。
- **登录态跨重启保留**：站点会话 cookie 是 7 天有效期的持久化 cookie，GeckoView 落在 `cookies.sqlite`；强杀进程重启后仍在登录态。四种要重登的情况见 [architecture.md](architecture.md) §8（含「换 host = 换 cookie jar」）。
- 返回键：能后退就后退，到根页退出；地址表单开着时语义见 [architecture.md](architecture.md) §3。
- 明文 HTTP 弹一次警告（判定看 **URL 协议**，不维护地址表；宿主自己也发 http 请求取上传上限，所以清单开了 `usesCleartextTraffic`，见 [architecture.md](architecture.md) §6）。

**尚未做**（Spec 里的后续阶段）：`ACTION_SEND` 分享入口、离线草稿、阅读 Tab；相机拍照上传（`ACTION_IMAGE_CAPTURE`，需要 FileProvider，站点没用到 `capture` 属性所以优先级低）。

> ⚠️ Spec 仍在 `docs/` 根，**待迁入本目录**（`docs/android/geckoview-client-spec.md`），以兑现「Android 专用文档都在 `docs/android/`」这条不变量。它的内容也有待按实测回填：工程路径（`main/android/` → `androidapp/`）、APK 体积（估算 85–95 MB → 实测 186 MB / x86_64 346 MB）、`minSdk`（估计 → 从 AAR 的 `AndroidManifest.xml` 实读为 26）。

## 与主仓文档的分工

- **Android 特有的坑**（内核、Gradle、宿主地址、ABI、宿主视图）写在本目录（`architecture.md` §7 / `debug.md` §6）。
- **跨端 / 服务器 / 站点侧**的坑仍写 `docs/pitfalls.md`（例如 **P-110** 那条：宿主地址不在 `allowedDevOrigins` 会让 App 里的页面根本不 hydrate——它的修法在站点配置里，所以登记在站点 pitfalls，本目录只做索引）。
