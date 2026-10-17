plugins {
    id("com.android.application")
    // AGP 9.0 起 Kotlin 支持内置，不能再应用 org.jetbrains.kotlin.android
}

/**
 * 目标 ABI（GeckoView 的 AAR 是按 ABI 分开发布的）。
 *   模拟器 x86_64（默认）: 不加参数
 *   真机 arm64          : -PgvAbi=arm64-v8a
 *   老 32 位真机         : -PgvAbi=armeabi-v7a
 */
val gvAbi = (project.findProperty("gvAbi") as String?) ?: "x86_64"

/**
 * 这个构建里有没有 ffmpeg。
 *
 * `ffmpeg-kit-min-gpl` 只发布 arm64-v8a 与 x86_64（见 docs/android/build.md §3b）：
 * armeabi-v7a 构建**不加**这个依赖，`BuildConfig.FFMPEG_ENABLED=false` → 相册里
 * 「自动压缩视频」置灰、视频原样上传。降级要比构建失败好。
 */
val ffmpegEnabled = gvAbi != "armeabi-v7a"

android {
    namespace = "com.smartblog.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.smartblog.app"
        minSdk = 26          // GeckoView 的 AndroidManifest 要求 minSdk 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.1.3"

        // 首次启动访问的地址。**默认就是生产域名**（App 首启不再进"请输入网站地址"，
        // 见 AppUrl.kt 与 docs/android/architecture.md §2）；地址存在 App 里，之后随时可改。
        //   默认（生产）: https://bruccese.com
        //   模拟器      : -PstartUrl=http://10.0.2.2:3000 （10.0.2.2 = 模拟器约定的宿主机回环）
        // 留空（`-PstartUrl=`）会退回 AppUrl.DEFAULT_SITE_URL，不会进地址表单。
        val startUrl = (project.findProperty("startUrl") as String?) ?: "https://bruccese.com"
        buildConfigField("String", "START_URL", "\"$startUrl\"")

        // ffmpeg 是否可用（见上）：相册视图据此决定「自动压缩视频」能不能勾
        buildConfigField("boolean", "FFMPEG_ENABLED", ffmpegEnabled.toString())

        // 只打目标 ABI：ffmpeg 的 AAR 里两套 so 都在，不过滤会把整个包撑大一倍
        ndk {
            abiFilters += gvAbi
        }
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // GeckoView：自带 Gecko 内核，不依赖系统 WebView。
    // ⚠️ ABI 必须与目标设备一致：用错时 App 一启动就 SIGILL 退出（见 docs/android/build.md §3）。
    implementation("org.mozilla.geckoview:geckoview-$gvAbi:157.0.20260924084938")

    // ComponentActivity / onBackPressedDispatcher 来自这里。
    // GeckoView 的 POM 不含 androidx.activity，必须显式声明。
    implementation("androidx.activity:activity-ktx:1.11.0")

    // 视频压缩：ffmpeg（min-gpl = 基础 FFmpeg + x264）。
    // 原版 `com.arthenica:ffmpeg-kit-*` 已于 2025-04 退役并从仓库下架；这里用社区维护的
    // drop-in 包（Maven Central、SDK 35 / 16KB 对齐、ABI 只有 arm64-v8a + x86_64）。
    // ⚠️ 含 x264 ⇒ 该 AAR 是 **GPL-3.0**，整个 App 按 GPL-3.0 分发（用户决策，见 docs/moment-video-spec.md）。
    if (ffmpegEnabled) {
        implementation("dev.ffmpegkit-maintained:ffmpeg-kit-min-gpl:8.1.7")

        // ⚠️ **必须显式声明**：`com.arthenica:smart-exception-java` 是 ffmpeg-kit 的必需运行时依赖
        // （`FFmpegKitConfig` 的静态初始化会调 `com.arthenica.smartexception.java.Exceptions`），
        // 但那个维护版 AAR 的 POM **里没有 <dependencies> 段**，Gradle 拉不到它。
        // 缺了的后果不是「少个功能」而是**第一次点压缩就闪退**：
        //   FATAL EXCEPTION: NoClassDefFoundError: com/arthenica/smartexception/java/Exceptions
        //     at com.arthenica.ffmpegkit.FFmpegKitConfig.<clinit>
        // 类的实现仍在 Maven Central（原厂 group，0.2.1 未下架），所以补这一行即可。
        // 证据与排查过程见 docs/pitfalls.md P-183 与 docs/android/build.md §3b。
        implementation("com.arthenica:smart-exception-java:0.2.1")
    }

    // 宿主侧纯逻辑（站点地址规则 / 通知层 / 相册媒体判定 / 压缩策略）的单测：
    // `gradlew :app:testDebugUnitTest` 跑在 JVM 上，不需要模拟器。只 junit，不引 Robolectric。
    testImplementation("junit:junit:4.13.2")
    // `org.json` 在 android.jar 里只有**桩**（没实现），单测一调就抛
    // "Method optString in org.json.JSONObject not mocked"。这里补真实现件（仅测试期，不进 APK）——
    // 比开 `unitTests.isReturnDefaultValues = true` 强：那样 `JSONObject` 会返回 null/0 这种假值，
    // 测试看着绿、实际什么都没验证。
    testImplementation("org.json:json:20240303")
}

// GeckoView 传递依赖带入 kotlin-stdlib 2.4.20（元数据 2.4.0），
// 而 AGP 9.x 内置的 Kotlin 编译器只读到 2.3.x → 编译报
// "Incompatible classes were found in dependencies"。压到与编译器同版本。
configurations.configureEach {
    resolutionStrategy {
        force("org.jetbrains.kotlin:kotlin-stdlib:2.2.10")
        force("org.jetbrains.kotlin:kotlin-stdlib-jdk7:2.2.10")
        force("org.jetbrains.kotlin:kotlin-stdlib-jdk8:2.2.10")
    }
}
