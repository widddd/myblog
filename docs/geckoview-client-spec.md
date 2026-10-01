# geckoview-client-spec.md — 自带内核的 Android 客户端（GeckoView）

- 日期：2026-02-XX
- 提案人：AI
- 状态：**已实施**（客户端工程见 `androidapp/`，运维文档见 [android/README.md](android/README.md)；本文件保留立项依据与实测数据，§8 审批栏由用户回填）
- 触发原因：用户主设备系统 WebView 锁死在 Chrome 83，读/发两端均不可用；内核无法升级

---

## 0. 立项依据（实测数据，不是推断）

设备实测（探针 v3，`public/_probe.html`）：

| 检测项 | 结果 | 影响 |
|---|---|---|
| 引擎大版本 | **83**（WebView Android 特征串 `Version/4.0 Chrome/83.0.4103.120 ... wv`） | Tailwind 4 基线为 Chrome 111 |
| `100vh` / `100dvh` 实测 | **638 / 0 px** | `--h-unit: clamp(7px,1dvh,11px)` 整条作废 → `--h-unit = 0` |
| `@layer` 块作用于规则 | **MISS** | ★ 最致命：`@layer` 不支持时**连块内规则一起丢**，而 Tailwind 4 的 `properties/theme/base/utilities` 四层就是全部骨架 |
| `@property` 经 `@supports` 生效 | MISS | 同因（其包在 `@layer properties` 内） |
| `:has()` / `@container` / `aspect-ratio` | MISS | 前台 12 + 2 + 7 处规则静默失效 |
| 可选链 `?.` / `??` | OK | `/admin` 编辑器不会因语法错误白屏（好消息） |
| `||=` | SyntaxError | 某些构建产物若使用会整块脚本阵亡 |

配套产出：`main/public/_probe.html`（ES3 看门狗 + 三段式探针，用于任何设备的引擎体检）。

**结论**：系统 WebView 是被锁死的旧引擎，任何"套壳/复用系统 WebView"的方案（Capacitor / Cordova / Tauri v2 / TWA / PWA）在这台设备上**结果完全相同**，只有自带内核可行。

---

## 1. 目标

在用户主设备（Android 11，arm64，360×820 dpr=2）上，用一个**自带内核**的 Android 客户端**同时**完成读与发：

- 读：首页 / 文章页 / 瞬间 / 搜索 / 留言板
- 发：文章与瞬间的撰写、发布（复用现有 `/admin` 手机形态，见 §2）

**非目标（本 Spec 不做）**：iOS、平板适配、第二套 UI、离线全文缓存、推送、多用户、后台管理残留、改造现有站点技术栈（Tailwind 4 不动）。

---

## 2. 设计方案

### 2.1 内核选型：GeckoView（唯一可行）

| 方案 | 内核 | 对本设备 |
|---|---|---|
| Capacitor / Cordova / Tauri v2 / TWA / PWA | 系统 WebView | ❌ 无效，仍是 83 |
| **GeckoView（选定）** | **自带 Gecko** | ✅ 唯一可行 |

坐标（已核实 Maven，非记忆）：

```
org.mozilla.geckoview:geckoview-arm64-v8a:156.0.20260921121718
org.mozilla.geckoview:geckoview-omni:156.0.20260921121718
```

- 最新稳定版：**156.0.20260921121718**（`geckoview-omni` 与 `geckoview-arm64-v8a` 的 metadata 一致）
- Gecko 156 ≫ Tailwind 4 所需的 Firefox 128；`dvh` 在 Gecko **108** 起支持
- **Lite vs Omni**：`geckoview-omni` 含 Glean 遥测，`geckoview`/`geckoview-arm64-v8a` 为精简版。**选非 omni 的精简版**（我们不需要遥测）
- 官方定性（`mozilla.github.io/geckoview`）：Self-Contained —— "**you can be confident that the code you test is the code that will actually run**"

### 2.2 关键决策：**复用现有网页作为 UI**

本客户端只提供宿主，**不写第二套 UI**：

| 要呈现的东西 | 复用对象 | 依据 |
|---|---|---|
| 前台全部页面 | 现有 Next.js 站点 | RSC 直查 Prisma，SSR 输出 |
| **手机端后台** | 现有 `/admin` 手机形态 | `admin-ui-rewrite-spec.md:107`：≤768px 渲染顶栏 + **底部 tab bar** |
| 写文章（手机） | 现有写文章 sheet | **P-073**：手机箭头/背板关 sheet；工具栏窄屏两行换行须全部可见 |
| 后台列表（手机） | 现有卡片形态 | **P-072**：同一 DOM 双形态，禁表格横滑 |

⇒ 这直接满足 §2.1「复用优先」，且把一个"写移动端 UI"的项目缩成"写一个宿主"。

### 2.3 最小功能清单（阶段 1）

1. 单 `Activity` + `GeckoView`，`GeckoSession` + `GeckoRuntime`
2. 内部域名白名单：站内导航留在壳内；外链、非 http(s) scheme 交给系统
3. 返回键：`canGoBack()` → `goBack()`；根页双击退出
4. 登录：**零代码** —— GeckoView 自带 cookie 存储，`myblog.session` / `myblog.csrf` 自动维护，`proxy.ts` 的 CSRF 双重提交自动通过

### 2.4 阶段 2（获批后另开 Spec）

- `ACTION_SEND` 分享入口（"像发朋友圈"的第一来源）
- 首页离线/错误页
- 图标与启动画面
- 注入式 UA 标识 `blogapp/<ver>`，供后端灰度（**需先扩 `next.config.ts` 的 `allowedDevOrigins` 思路到生产，属 API 侧改动，另议**）

---

## 3. 影响面分析

- **涉及现有模块**：Android 工程为新增，**不修改** `main/` 任何业务代码（除 §4 的 UA 标识为可选）。复用 `docs/ai/module.md` 已登记的站点与管理端全部能力。
- **目录不变量（AGENTS §2.2）**：应用代码只在 `main/` 的约束**需要放宽**。建议新增顶层目录 `android/`（或 `client/`），**需用户明确批准**。
- **是否新增依赖**：是。Android/Gradle 侧新增 GeckoView 156、AndroidX。**不含 Node 依赖**，`main/` 的 pnpm 树不变。
- **1GB RAM 约束（AGENTS §1）**：GeckoView 多进程会吃内存 —— **受影响的是手机，不是服务器**。服务器侧零改动。⚠️ 需在真机确认不 OOM。
- **是否破坏红线**：不破坏 §2.3 SQL / §2.4 sanitize / §2.5 StorageDriver / §2.6 单实例。**触及 §2.2 目录不变量**（见上）。
- **APK 体积**：实测报告单 ABI 约 **100–150 MB**（GitHub `mozilla/geckoview` issue #166：官方称 ~50MB/ABI，开发者实测 `base-arm64_v8a.apk` 139.9 MB、`armeabi_v7a` 106.1 MB、`x86_64` 154.2 MB）。必须走 ABI split；单包上限**不得超过 nginx `client_max_body_size 512m`**。
- **文档同步**（对照 `agents-maintenance.md` 触发表）：`docs/ai/module.md` + `docs/architecture.md` + `AGENTS.md` §3 索引 + `docs/pitfalls.md`（新增 P-0XX）+ `README.md` + `docs/README.md`。

---

## 4. 输入输出边界

**零 API 变更**，零数据库变更，零新增配置字段。全部走既有端点：

| 用途 | 端点 | 契约来源 |
|---|---|---|
| 登录取 CSRF | `GET /api/auth/csrf` | `docs/api-contracts.md` |
| 登录 | `POST /api/auth/login`（需 `x-csrf-token`） | 同上 |
| 文章列表/新建 | `GET/POST /api/admin/posts` | 同上 |
| 文章改删 | `GET/PATCH/DELETE /api/admin/posts/[id]` | 同上 |
| 瞬间 | `GET/POST /api/admin/moments` | 同上 |
| 上传 | `POST /api/upload` + `/api/admin/uploads/finalize` | P-056 两步上传 |

**既有约束（必须继承）**：P-056 两步上传（发文只入库本地原图，点发布才生成 thumb 并上 COS）；P-051 二级缩略图仅本地；MDX 正文必须过 `lib/markdown/sanitize.ts`（§2.4）。

**可选新增**：UA 标识 `blogapp/<ver>`（用于后端灰度与问题定位）—— 属接口侧改动，需单独批准。

---

## 5. 实施步骤

每步可独立验证，全部要求 **Windows 上跑通**（AGENTS §1 硬约束）：

1. **工具链落地**：Android 命令行工具 + SDK（`platform-tools` / `build-tools` / `platform`）。现状：Java 21 已有 ✅，`ANDROID_HOME` 空 ❌，无 adb/gradle/sdkmanager ❌。
2. **最小可跑通**：单 Activity 加载 `http://192.168.2.36:3000`，ABI split，装到真机。
3. **登录 + 发文验证**：真机上走完「取 CSRF → 登录 → 写 → 发布 → 前台可见」。
4. **导航与返回键**：白名单 + 双击退出。
5. **文档同步**：按 `agents-maintenance.md` 触发表逐项更新。

### 5.1 待用户决策（不猜）

| # | 决策 | 选项 |
|---|---|---|
| D1 | Android 工程落点 | A. `android/`（新顶层目录，推荐）；B. `main/android/`（**违反 §2.2，需明确豁免**）；C. 暂不放仓库 |
| D2 | 是否进 GitHub 仓库 | P-092 要求远端只留程序代码 + 项目文档；Android 源码属"程序代码"可进，但**需确认** |
| D3 | 站点地址形态 | 局域网 IP（仅内网可用）／域名 + HTTPS（生产 cookie `secure:true`，必须 HTTPS） |
| D4 | 图片支持 | 阶段 1 是否放弃图片（可省掉原生图像栈，避免触发 §2.7 依赖评估） |

---

## 6. 验收标准

| 场景 | 可复现步骤 | 预期结果 |
|---|---|---|
| 首页渲染 | 真机打开 app | 首页格点、瞬间宫格**高度正常**（对照 Chrome 83 下 `dvh=0` 的塌陷）；无横向溢出 |
| 后台可用 | app 内进 `/admin` | 底部 tab bar 可见；写文章 sheet 可开合（P-073） |
| 发文闭环 | 写一篇 → 发布 | 前台首页能看到该文；server 侧 `pnpm shot /posts` 可见 |
| 返回键 | 根页连按两次 | 第一次提示、第二次退出（不在根页误杀） |
| 引擎判据 | app 内打开 `_probe.html` | 引擎大版本 ≥ 128；`@layer` / `dvh` / `:has()` 全部 OK |
| 未回归 | 服务器侧 | `main/` 无代码变更；`pnpm dev` / `pnpm build` 行为不变 |

---

## 7. 风险与未知

| # | 风险／未知 | 处置 |
|---|---|---|
| R1 | 未做任何 Android 工程 | 本 Spec 为首次；工具链需从零装（数 GB 下载） |
| R2 | **未实测 Gecko 渲染本站效果**（§2 全部结论来自 Gecko/WebView 的特性支持表 + 官方文档，**非本站实测**） | 步骤 2 完成后立即在真机跑 `_probe.html`；不一致则回退本 Spec |
| R3 | GeckoView 多进程内存占用未知 | 真机观察；必要时降级单进程配置 |
| R4 | 360×820 小屏下 `--h-unit: clamp(7px,1dvh,11px)` 实算值偏小（8.2px 左右） | 属设计内，不做改动；真机确认观感 |
| R5 | 图片上传所需原生图像栈会触发 §2.7 依赖评估 | 由 D4 决定是否延后 |
| R6 | `||=` 在旧引擎的 SyntaxError 表明构建产物语法不可假设 | Gecko 156 无此问题；但保持对构建产物的语法警惕 |
| R7 | 生产环境 `secure: true` 要求 HTTPS，局域网 HTTP 仅可用于 dev | 由 D3 决定 |

---

## 8. 审批

- [ ] 用户已批准
- [ ] D1–D4 已选
- [ ] 实施完成
- [ ] 文档已同步（列出路径）
---

## 附录 A：实施回填（实测值，替换正文中的估计值）

> 本节在**首次构建成功后**回填。正文 §3/§5 中带"约""估计"的数字以此处为准。

### A.1 实测数字

| 项 | 正文原估计 | **实测值** | 来源 |
|---|---|---|---|
| APK 体积（debug） | 约 85–95 MB | **188.07 MB** | `app-debug.apk` 实际大小 |
| APK 体积（release） | —— | **186.46 MB** | `app-release.apk` 实际大小 |
| 原生 `.so` 合计 | —— | **167.0 MB，0 压缩存储** | APK zip 内实测 |
| 其中 `libxul.so` | —— | **145.4 MB**（单一文件占比 78%） | 同上 |
| GeckoView minSdk | 26（解 AAR manifest 得知） | **26（已写入 APK，aapt2 确认）** | `aapt2 dump badging` |
| 工程落点 | `main/android/`（**错**） | **`androidapp/`（与 `main/` 平级）** | 用户实际选择 |
| 设备 ABI | 未知 | 构建产物仅 `arm64-v8a`；**真机 ABI 仍未确认** | 构建输出 |

> ⚠️ 体积误差说明：正文按 AAR 的**压缩后**尺寸（86.2 MB）估算，但 AGP 默认以
> **未压缩**方式把 `.so` 放进 APK（`extractNativeLibs=false` 策略，装机免解压、包更大）。
> 二者相差近一倍。**如需缩包，可改 `jniLibs { useLegacyPackaging = true }` 让 `.so` 参与压缩。**

### A.2 工具链实测（本机，Windows）

| 组件 | 实测版本/路径 | 备注 |
|---|---|---|
| Java（构建用） | RedHat OpenJDK **21.0.5** `C:\Program Files\RedHat\...` | 经 `org.gradle.java.home` 显式指定 |
| Android Studio 自带 JBR | **25.0.3** | ⚠️ AGP 8.x/9.x 不支持 25，**不要**用它构建 |
| Gradle | **9.4.1**（wrapper，取自缓存） | AGP 9.x 要求 Gradle 9.x |
| AGP | **9.1.0** | 见 A.3 |
| SDK | `D:\AndroidSDK` | `local.properties` 指向它 |
| platform | **只有 `android-37.0`** | ⚠️ 见 A.3 |
| build-tools | 34.0.0 / 35.0.0 / 36.0.0（Gradle 自动补装） | 无 37 |
| Kotlin 编译器 | AGP 9.1 内置 **2.2.10** | 见 A.3 |

### A.3 踩过的 6 个坑（按发生顺序，全部已解）

1. **`jvmTarget` 字符串语法是硬错误**（Kotlin 2.3+）：`kotlinOptions.jvmTarget = "17"`
   → 必须改用 `kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }`。
2. **AGP 8.x 全线不支持 `android-37.0`**：报 `suppressUnsupportedCompileSdk=37.0` +
   `Failed to find target with hash string 'android-37'`。本机只有次版本号格式的平台目录
   （`source.properties` 里 `AndroidVersion.ApiLevel=37.0`），**必须 AGP 9.x**。
3. **AGP 9.0 起 Kotlin 支持内置**：再写 `org.jetbrains.kotlin.android` 会直接失败
   （官方提示 `no longer required since AGP 9.0`）。
4. **Kotlin 元数据版本冲突**：GeckoView 传递依赖带入 `kotlin-stdlib 2.4.20`（元数据 2.4.0），
   而 AGP 9.x 内置编译器只能读到 2.3.x。→ 用 `resolutionStrategy.force` 压到 **2.2.10**。
   （注意：**升级 AGP 无用**，AGP 9.2 内置的仍是 2.2.10。）
5. **缺 `androidx.activity`**：`ComponentActivity` / `onBackPressedDispatcher` 来自它，
   而 GeckoView 的 POM **不含**该依赖，必须显式声明。
6. **GeckoView API 与直觉不符**（`javap` 实测）：
   - `GeckoSession` **没有** `canGoBack()`，只有 `goBack()` / `goBack(boolean)` / `gotoHistoryIndex(int)`；
     后退状态由 `NavigationDelegate.onCanGoBack(session, boolean)` 回调给出，需自己存一份。
   - `AllowOrDeny` 是顶层类 `org.mozilla.geckoview.AllowOrDeny`，**不在** `GeckoSession` 内。
   - `onLoadRequest` 返回类型是 `GeckoResult<AllowOrDeny?>?`。

### A.4 仍未验证（不可自证）

| # | 未知 | 为什么无法自证 |
|---|---|---|
| U2 | 目标机（Android 11 / 360×820 / dpr=2）跑 GeckoView 的**内存与性能表现** | 多进程架构 + 低端机；模拟器跑在 PC 上，内存压力完全不同 |
| U3 | 目标机 ABI 究竟是 `arm64-v8a` 还是 `armeabi-v7a` | 用户设备**无法开启 USB 调试**（受管控），`adb devices` 取不到 |
| U4 | Gecko 实际渲染本站的观感 | 可在模拟器上验证（需先装系统镜像）；真机仍不可验 |

⚠️ **U2 是唯一可能推翻本方案的未知量**：若目标机因内存不足频繁被杀或卡顿，应当回退到
"纯原生发文端（不渲染网页）+ 阅读端另寻方案"的路线。