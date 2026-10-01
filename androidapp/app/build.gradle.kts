plugins {
    id("com.android.application")
    // AGP 9.0 起 Kotlin 支持内置，不能再应用 org.jetbrains.kotlin.android
}

android {
    namespace = "com.smartblog.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.smartblog.app"
        minSdk = 26          // GeckoView 的 AndroidManifest 要求 minSdk 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // 起始地址：**只作为首次填地址时的预填值**，用户存过之后就以 App 里的为准
        // （见 docs/android/architecture.md §2）。
        //   模拟器（默认）: 10.0.2.2 是 Android 模拟器约定的宿主回环地址
        //   真机          : 建议传空 -PstartUrl= ，让输入框留白由用户自己填
        //   生产          : -PstartUrl=https://你的域名
        val startUrl = (project.findProperty("startUrl") as String?) ?: "http://10.0.2.2:3000"
        buildConfigField("String", "START_URL", "\"$startUrl\"")
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
    // ⚠️ ABI 必须与目标设备一致：用错时 App 一启动就 SIGILL 退出（见 docs/android/build.md §3），
    // 所以做成构建期可注入，改目标不用动源码：
    //   模拟器 x86_64（默认）: 不加参数
    //   真机 arm64           : -PgvAbi=arm64-v8a
    //   老 32 位真机          : -PgvAbi=armeabi-v7a
    val gvAbi = (project.findProperty("gvAbi") as String?) ?: "x86_64"
    implementation("org.mozilla.geckoview:geckoview-$gvAbi:157.0.20260924084938")

    // ComponentActivity / onBackPressedDispatcher 来自这里。
    // GeckoView 的 POM 不含 androidx.activity，必须显式声明。
    implementation("androidx.activity:activity-ktx:1.11.0")
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