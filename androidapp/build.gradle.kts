plugins {
    // 本机 SDK 只有 android-37.0（ApiLevel=37.0 的新式次版本平台），AGP 8.x 全线不支持。
    // androidx.core 1.19.0 又硬性要求 AGP >= 9.1.0，故取 9.1.0。
    id("com.android.application") version "9.1.0" apply false
}