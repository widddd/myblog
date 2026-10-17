# build.md — Android 客户端工具链与构建

> 工程在 `androidapp/`（与 `main/` 平级）。**不是** `main/android/` —— 放 `main/` 里会被 `main/tsconfig.json` 的 `**/*.ts` 与 ESLint 扫到。
> 所有版本号都是本机实测结论，不是"照文档抄的默认值"。

## 1. 本机环境（实测）

| 项 | 值 | 说明 |
|---|---|---|
| Android SDK | `D:\AndroidSDK` | **不在** `%LOCALAPPDATA%`，探测时别只查默认路径 |
| 平台 | `platforms/android-37.0` | 目录名带次版本号（`source.properties` 里 `AndroidVersion.ApiLevel=37.0`），是新式平台命名 |
| build-tools | 36.0.0（Gradle 自动装过 34.0.0） | 够用 |
| `platform-tools` | `D:\AndroidSDK\platform-tools\adb.exe` | adb 不在 PATH，用绝对路径 |
| `cmdline-tools` | ❌ 缺失 | 没有 `sdkmanager`/`avdmanager`；装镜像/建 AVD 得走 Android Studio GUI，或直接手写 AVD 配置（见 §5） |
| JDK | `C:\Program Files\RedHat\java-21-openjdk-21.0.5.0.11-1` | Studio 自带的 JBR 是 **25**，AGP 9.x 不支持 → 在 `gradle.properties` 里用 `org.gradle.java.home` 显式指向 21 |

## 2. 版本组合（三个都不能随手升级/降级）

```
AGP           9.1.0      ← 见下
Gradle        9.4.1      ← gradle/wrapper/gradle-wrapper.properties
compileSdk    37         minSdk 26          targetSdk 35
GeckoView     157.0.20260924084938
Kotlin stdlib 强制 2.2.10
```

三条硬约束，换掉任意一条都构建失败：

1. **AGP 必须 ≥ 9.1.0**。原因有两个，任一单独存在都会失败：
   - 本机只装了 `android-37.0` 这种**带次版本号**的平台目录，AGP 8.x 全线**不认识**（报 `Failed to find target with hash string 'android-37'`，或 `android.suppressUnsupportedCompileSdk=37.0`）；
   - `androidx.core:core-ktx:1.19.0` 的 AAR metadata 里写着 `requires Android Gradle plugin 9.1.0 or higher`。
2. **不要应用 `org.jetbrains.kotlin.android` 插件**。AGP 9.x 起**内置 Kotlin 支持**，再套 Kotlin 插件会直接被拒：
   `The 'org.jetbrains.kotlin.android' plugin is no longer required for Kotlin support since AGP 9.0.`
3. **必须把 kotlin-stdlib 压到 2.2.10**。GeckoView 的 POM 传递依赖 `kotlin-stdlib:2.4.20`（元数据版本 2.4.0），而 AGP 9.x 内置的 Kotlin 编译器是 2.2.x，**最高只能读 2.3.0 的元数据**，否则报
   `Class 'kotlin.Unit' was compiled with an incompatible version of Kotlin`。
   修法在 `app/build.gradle.kts` 末尾的 `resolutionStrategy.force(...)`。

⚠️ 顺带一条**判错过的**结论（留档防重踩）：GeckoView 的 `classes.jar` 里**没有** `.kotlin_module` 文件，看起来像"纯 Java、不会与 Kotlin 冲突"——**错的**，冲突来自 POM 传递的 stdlib，不在 classes.jar 里。

另外 Kotlin 2.3+ 把 `kotlinOptions.jvmTarget = "17"` 这种字符串写法升级成了**硬错误**，要用 `compilerOptions` DSL。

## 3. ABI（必须与目标设备匹配，否则装上也跑不起来）

**ABI 是构建期注入的，不用改源码**（`app/build.gradle.kts` 里 `-PgvAbi` 默认 `x86_64`）：

| 目标 | 参数 | 对应依赖坐标 |
|---|---|---|
| 模拟器（x86_64 镜像） | 不加参数（默认） | `org.mozilla.geckoview:geckoview-x86_64:<ver>` |
| 真机 arm64 | `-PgvAbi=arm64-v8a` | `org.mozilla.geckoview:geckoview-arm64-v8a:<ver>` |
| 老 32 位真机 | `-PgvAbi=armeabi-v7a` | `org.mozilla.geckoview:geckoview-armeabi-v7a:<ver>`（Mozilla 仍在同步发版，未弃用） |

**用错 ABI 的症状**：app 启动后**瞬间退出**，logcat 里是
`F libc: Fatal signal 4 (SIGILL) ... DEBUG: ABI: 'x86_64'` —— 非法指令，因为是 ARM 机器码在 x86 上执行。
排查时 `crash buffer` 可能是空的，别被"没崩溃日志"误导，要看 `DEBUG` 行里的 ABI。

**确认包里到底是什么架构**：`aapt2 dump badging <apk> | Select-String "native-code"`，应只列一个 ABI。**2026-10 起 Gradle 里加了 `ndk { abiFilters += gvAbi }`**：ffmpeg 的 AAR 里两套 so 都在，不过滤会把包撑大一倍（实测 debug 包只留 `lib/x86_64/*`）。

## 3b. 视频压缩的 ffmpeg（依赖、ABI、许可证，2026-10）

```kotlin
// 只在有对应 ABI 时才加（armeabi-v7a 没有 ffmpeg 包，见下）
if (ffmpegEnabled) implementation("dev.ffmpegkit-maintained:ffmpeg-kit-min-gpl:8.1.7")
buildConfigField("boolean", "FFMPEG_ENABLED", ffmpegEnabled.toString())
```

| 事项 | 实测/决定 |
|---|---|
| 为什么不是原版 | `com.arthenica:ffmpeg-kit-*` 2025-04 退役并**从仓库下架**（照老文章写坐标必然 `Could not find …`），且不支持 16 KB 页对齐 |
| 用的坐标 | `dev.ffmpegkit-maintained:ffmpeg-kit-min-gpl:8.1.7`（Maven Central 的社区维护 drop-in 包；SDK 35、16KB 对齐、包名仍是 `com.arthenica.ffmpegkit`） |
| 为什么 `-gpl` | 要 `libx264` 就只能选 `*-gpl`；**该 AAR 是 GPL-3.0，整个 App 按 GPL-3.0 分发**（用户决策，见 [../moment-video-spec.md](../moment-video-spec.md)）。LGPL 档没有 x264，只能用系统 MediaCodec |
| ABI | 该包**只发 `arm64-v8a` + `x86_64`**：`-PgvAbi=armeabi-v7a` 时 `ffmpegEnabled=false` —— 不加依赖、`BuildConfig.FFMPEG_ENABLED=false`、相册里勾选框置灰（**降级而不是构建失败**） |
| 体积 | 实测 debug APK（x86_64）单看 ffmpeg 那几支 so：`libavcodec.so` 15.2 MB、`libavfilter.so` 3.7 MB、`libavformat.so` 2.4 MB、`libffmpegkit.so` 0.5 MB、`libc++_shared.so` 1.6 MB…（`libxul.so` 165 MB 才是大头） |
| API 形状 | **以 `javap` 实读为准**（P-181）：`executeWithArgumentsAsync(String[], FFmpegSessionCompleteCallback, LogCallback, StatisticsCallback)`；只有 `cancel()` / `cancel(long sessionId)`；`Statistics.getTime()` 是 `double` 毫秒。AAR 解开后 `jni/{arm64-v8a,x86_64}/libavcodec.so` 内可搜到 `libx264` 字样（编码器确实在包里） |
| **必须手补的传递依赖** | `implementation("com.arthenica:smart-exception-java:0.2.1")` —— 维护版 AAR 的 **POM 里没有 `<dependencies>` 段**，`FFmpegKitConfig` 静态初始化要用的 `com.arthenica.smartexception.java.Exceptions` 不会被打进包；缺了它**第一次点压缩就闪退**（`FATAL EXCEPTION: NoClassDefFoundError`，见 P-183）。同时调用点要 `catch (Throwable)` —— `Error` 不是 `Exception` |
| 时长硬规则 | **视频 > 30 分钟一律不许发**（`CompressPolicy.MAX_DURATION_MS`，与站点 `lib/moments/compose-rules.ts` 同口径）。它是产品规则不是压缩策略：**勾选框关掉、设备没带 ffmpeg（armeabi-v7a）时同样拦**，拦在选择阶段（停留相册 + 一句人话），不启动 ffmpeg |
| 线程与内存 | ffmpeg 参数固定带 `-threads 2`（`CompressPolicy.FFMPEG_THREADS`）：HEVC 长视频按默认"核数"路解码会把帧缓冲与内存撑爆。压缩前还查一次可用空间（`requiredFreeBytes()` = 源 + 两遍产物），不够就直接不编 |

## 4. 构建与安装

```powershell
cd D:\code_projects\myblog\androidapp
.\gradlew.bat :app:assembleDebug --console=plain          # 首次 ~1 分钟，增量 ~20 秒
D:\AndroidSDK\platform-tools\adb.exe install -r app\build\outputs\apk\debug\app-debug.apk
D:\AndroidSDK\platform-tools\adb.exe shell am force-stop com.smartblog.app
D:\AndroidSDK\platform-tools\adb.exe shell am start -n com.smartblog.app/.MainActivity
```

**起始地址是构建期注入的**（`BuildConfig.START_URL`；缺省 = `https://bruccese.com`，不再进地址表单）：

```powershell
# 模拟器：指向宿主机的 dev server（10.0.2.2 是模拟器 NAT 约定的宿主回环）
.\gradlew.bat :app:assembleDebug -PstartUrl=http://10.0.2.2:3000
# 缺省（不传参数）= 生产默认地址 https://bruccese.com，见 AppUrl.kt
.\gradlew.bat :app:assembleDebug
```

| 场景 | URL |
|---|---|
| 默认（生产） | `https://bruccese.com` —— App 首启直达，用户可从右下角 ⋮ 改（存在 App 里，与构建无关） |
| 模拟器 | `-PstartUrl=http://10.0.2.2:3000`（`10.0.2.2` 是模拟器 NAT 约定的**宿主机回环**地址，不是 `127.0.0.1`——那是模拟器自己） |
| 生产（换域名） | 改 `AppUrl.DEFAULT_SITE_URL` 一处即可；构建期覆盖用 `-PstartUrl=https://<域名>` |

> ⚠️ `-PstartUrl=` 传空串会**退回 `AppUrl.DEFAULT_SITE_URL`**（老文档说"留空让用户自己填"，那条已作废：首启不再有地址表单）。
> ⚠️ **换默认域名时**把旧默认值追加进 `AppUrl.LEGACY_DEFAULT_URLS`，否则老装机里那个"构建期默认值"会被当成用户自定义地址一直用下去。

**出真机包**（ABI 也是构建期注入，见 §3）：

```powershell
.\gradlew.bat :app:assembleRelease "-PgvAbi=arm64-v8a" "-PstartUrl=" --console=plain
# → app\build\outputs\apk\release\app-release.apk  （release 用 debug key 签名，可直接侧载）
```

构建后核对元信息（名字 / 图标 / ABI / minSdk 一次看全）：

```powershell
& "$(Get-ChildItem 'D:\AndroidSDK\build-tools' -Directory | Sort-Object Name -Descending | Select-Object -First 1)\aapt2.exe" dump badging app\build\outputs\apk\release\app-release.apk |
  Select-String "^package|application-label:|native-code|sdkVersion"
```

## 4b. 仓库里**没有** Gradle wrapper（只提交源码与构建配置）

`androidapp/.gitignore` 会忽略 `gradle/wrapper/`、`gradlew`、`gradlew.bat`：`gradle-wrapper.jar` 是 45KB 二进制，属依赖不属源码（原则同 P-092）。

**本机不受影响**：这些文件就在 `androidapp/` 里，`.\gradlew.bat` 照常用。

**全新克隆要先用 `gradle wrapper` 把 jar 生出来**（实测 `gradlew` 不会自举，jar 缺失直接报 `Unable to access jarfile .../gradle-wrapper.jar`）。三条路任选：

```powershell
# ① 用本机已缓存的 Gradle 发行版（wrapper 下载过的，就在下面这个目录里）
& "$env:USERPROFILE\.gradle\wrapper\dists\gradle-9.4.1-bin\<hash>\gradle-9.4.1\bin\gradle.bat" wrapper --gradle-version 9.4.1
# ② 从另一个已有 wrapper 的工程拷（本机的 gradle-wrapper.jar 最初就是从 D:\code_projects 下的 Java 工程借的）
# ③ 直接用系统装的 gradle（本机没装，故不适用）
```

生成后 `git status` 里仍然看不到它——那是**预期行为**，它本就不该进版本库。

## 5. 模拟器（本机无 `avdmanager`，AVD 是手写的）

- AVD 名 `myblog_test`（显示名 "MyBlog Test (Android 11)"），系统镜像 `android-30 / google_apis / x86_64`（Android 11，与用户手机同大版本）
- **AVD 配置在标准位置**：`C:\Users\<你>\.android\avd\myblog_test.ini` + `myblog_test.avd\config.ini`
  → 因此 **Android Studio 的 Device Manager 也能列出并启动它**（Studio 读的就是这个目录）
- 镜像目录：`D:\AndroidSDK\system-images\android-30\google_apis\x86_64\`
  ⚠️ 解压官方 zip 后会**多嵌套一层**（`x86_64/x86_64/system.img`），要上提一层
- 启动后自检：`emulator -accel-check` 应报 `WHPX ... is installed and usable`（本机 ✓）

### 启动 / 关闭 / 看应用列表

```powershell
# 一键：起模拟器（已在跑则复用）→ 等开机 → 装最新 debug 包 → 拉起 App。双击也行
androidapp\tools\start-emulator.bat

# 只想起模拟器
D:\AndroidSDK\emulator\emulator.exe -avd myblog_test -no-boot-anim -no-audio
D:\AndroidSDK\emulator\emulator.exe -list-avds        # 列出所有 AVD

# 关闭（或直接关模拟器窗口）
D:\AndroidSDK\platform-tools\adb.exe -s emulator-5554 emu kill
```

| 想做的事 | 怎么做 |
|---|---|
| **打开应用列表（应用抽屉）** | 在模拟器主屏幕上**从底部向上滑**；或先按 Home 键（底部中间圆点）再上滑。App 名字是 **SmartBlog**，蓝色「和自己对话」气泡图标 |
| 回主屏 | `adb shell input keyevent 3` |
| 看当前前台是谁 | `adb shell dumpsys activity activities \| findstr mResumedActivity` |
| 改 App 里的地址（不改代码） | 右下角 ⋮ →「修改网站地址」；或直接改 `shared_prefs/smartblog.xml`（见下） |

> ⚠️ **直接改 `shared_prefs/smartblog.xml` 的手艺**（验证时很有用：不用重新构建就能让 App 指向别的端口）：
> 必须先 `am force-stop`，否则 App 内存里那份缓存会在退出时把文件覆盖回去。
> ```powershell
> & $adb shell am force-stop com.smartblog.app
> # 写一个 <map><string name="site_url">http://10.0.2.2:3011/probe</string></map>（UTF-8 无 BOM）
> & $adb push prefs.xml /data/local/tmp/smartblog.xml
> & $adb shell "run-as com.smartblog.app cp /data/local/tmp/smartblog.xml shared_prefs/smartblog.xml"
> ```
> 验完记得 `run-as com.smartblog.app rm -f shared_prefs/smartblog.xml` 复位。

## 5b. 宿主纯逻辑的 JVM 单测（不需要模拟器）

`app/src/test/java/com/smartblog/app/` 下的测试跑在 JVM 上，**秒级**，不需要模拟器也不需要设备：

```powershell
cd D:\code_projects\myblog\androidapp
.\gradlew.bat :app:testDebugUnitTest --console=plain        # 结果 XML: app\build\test-results\testDebugUnitTest\
```

只依赖 `testImplementation("junit:junit:4.13.2")` 与 `testImplementation("org.json:json:20240303")`（见 `app/build.gradle.kts`，两者都只进测试期、不进 APK）。**不引 Robolectric**：那一层要么用真机/模拟器验（见 [debug.md](debug.md)），要么把逻辑抽成不依赖 Android 的纯函数再单测——`AppUrl.kt`（地址规则）与 `PushRules.kt`（通知层判定）就是这么抽的。

> ⚠️ **`org.json` 必须用真实现**：`android.jar` 里它只有桩，JVM 单测一调就 `Method optString in org.json.JSONObject not mocked`。别用 `unitTests.isReturnDefaultValues = true` 糊过去（那会让 `JSONObject` 返回假值，测试看着绿、实际什么都没验证）。

> ⚠️ **改 `-PstartUrl` 时加 `--no-build-cache --no-configuration-cache`**（或 `--rerun-tasks`）：Gradle 会拿旧缓存里那份 `BuildConfig` 重建 APK，参数看着生效、装的却是旧地址（实测 `pm clear` 后 App 进了 `https://bruccese.com` 而不是 dev server）。装完用 `adb logcat -s SmartBlog:I` 看第一行 `进入站点：…` 确认。

> 加测试文件后要按**用例名**确认它真的跑了（`TEST-com.smartblog.app.AppUrlTest.xml` 里的 `tests=` 计数）——Gradle 会复用在跑的任务，只看 `BUILD SUCCESSFUL` 可能什么都没执行。

> ⚠️ **真机也插着的时候**：`adb` 会同时看到模拟器和真机，不带 `-s` 的命令会报 `more than one device`——统一带 `-s emulator-5554`（脚本里已自动探测串号）。
> ⚠️ **同一个 AVD 不能起两个实例**（会互相锁冲突），所以脚本先探测、已在跑就直接复用。
> ⚠️ **`start-emulator.bat` 必须是 CRLF 换行 + ANSI(GBK) 编码**：cmd.exe 按系统代码页读 `.bat`，用 UTF-8 存会让中文串**吞掉后面一个 ASCII 字符**（实测把 `app-debug.apk` 切成 `ebug.apk`），脚本当场崩。
> 用 PowerShell 改这个文件要写成：`[IO.File]::WriteAllText($p, ($t -replace "\r?\n","\r\n"), [Text.Encoding]::GetEncoding(936))`——`Set-Content -Encoding oem` 实测**不生效**，且默认写 LF。

## 6. 体积（实测拆解，别按 AAR 压缩尺寸估）

| 产物 | 大小 |
|---|---|
| `app-release.apk`（arm64-v8a，给真机） | **186.4 MB**（解包 195.6 MB，157 个文件） |
| `app-debug.apk`（x86_64，给模拟器） | **206.4 MB**（x86_64 的 libxul 比 arm64 还大：157.8 MB；debug 的 dex 也更多） |

**里面装的是什么**（release 实测，数字为压缩后体积）：

| 部分 | 大小 | 是什么 |
|---|---|---|
| `lib/arm64-v8a/libxul.so` | **145.4 MB** | **整个 Gecko 内核**：HTML/CSS 排版、SpiderMonkey JS/WASM JIT、WebRender 渲染、网络栈…… |
| `assets/omni.ja` | 13.8 MB（解包 44.9 MB） | 内核的 JS 模块 / 浏览器 chrome / 本地化，4069 个条目：`chrome`(1942) `localization`(1383) `modules`(443) `moz-src`(157) `actors`(47) `hyphenation`(46)… 踩过的 `modules/FilePickerDelegate.sys.mjs` 就在里面 |
| `classes*.dex`（2 个） | 5.2 MB | App 自己的 Kotlin + androidx + GeckoView 的 Java API |
| 其余 11 个 `.so` | ≈ 21 MB | NSS 加密（libnss3 / libfreebl3 / libsoftokn3）、媒体解码（libgkcodecs / libmozavcodec / libmozavutil）、崩溃上报（libcrashtools / libcrashhelper）、libmozglue… |
| `res/` + `resources.arsc` | 0.2 MB | 图标、开屏 logo、字符串、主题 |
| `META-INF/` | ≈ 0 | 37 个签名/清单条目 |

**为什么这些 `.so` 没被压缩**：AGP 默认 `extractNativeLibs=false`（`useLegacyPackaging=false`）——`.so` 按页对齐、以 **stored** 方式放进 APK，安装时不解包、运行时直接 mmap，省内存也省启动时间。代价就是 `lib/` 那 167 MB 几乎原样占用。

**这些体积和站点代码无关**：APK 里**一行博客代码都没有**——站点是 `main/` 的 Next.js（542 个 ts/tsx、约 5.7 万行），全部从服务器加载。壳自己的源码只有约 2430 行 Kotlin（`MainActivity.kt` 901 + `PickerViews.kt` 449 + `AlbumPickerView.kt` 496 + `FormPrompts.kt` 334 + `HostUi.kt` 247）。

**想瘦身**：内核不可约（`libxul.so` 是编译产物）。能做的只有：**只打一个 ABI**（已做，见 §3；双 ABI 等于翻倍）、开 R8 + 资源压缩（`isMinifyEnabled` 目前是 `false`，能省的是 dex 那几 MB，对内核无效）。

装机前确认设备**可用空间 ≥ 400 MB**（安装包 + 解包后的 `.so`）。

## 7. HTTP 与 cookie 的两条前提

1. **局域网明文 HTTP 只适合自用调试**。dev 下 `lib/auth/session.ts` 的 `secure: process.env.NODE_ENV === "production"` 为 `false`，所以 `http://` 下 session/CSRF cookie 能正常回传；**生产必须 HTTPS**，否则 cookie 不回传、登录必然失败。
2. App 侧明文访问会**弹一次警告**（`maybeWarnInsecure`，**看 URL 协议**，不维护地址表；曾经用 `NetworkSecurityPolicy.isCleartextTrafficPermitted()` 判定，但清单开了 `usesCleartextTraffic` 之后那个 API 永远返回 true，等于把警告悄悄关掉——详见 [architecture.md](architecture.md) §6）。
