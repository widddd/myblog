pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
        // GeckoView 来自 Mozilla 仓库
        maven { url = uri("https://maven.mozilla.org/maven2/") }
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://maven.mozilla.org/maven2/") }
    }
}

rootProject.name = "smartblog-client"
include(":app")