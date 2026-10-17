package com.smartblog.app

import java.net.URI

/**
 * 站点地址与客户端标识的**唯一事实源**（纯逻辑，无 Android 依赖 → 直接单测）。
 *
 * 三件事在这里定：
 *  1. **默认站点地址**：`DEFAULT_SITE_URL`。App 首次启动就进它，不再弹"请输入网站地址"
 *     （用户决策，2026-10-03）；地址仍可由右下角 ⋮ →「修改网站地址」随时改。
 *  2. **历史默认值的迁移**：`LEGACY_DEFAULT_URLS` 里的地址只有"编译期默认值"这一个来源，
 *     命中就重写成当前默认；用户自己敲过的地址一律不动（那是用户数据，见
 *     docs/android/architecture.md §2）。
 *  3. **客户端标识**：UA 追加 ` SmartBlog/<版本>`，站点据此识别"这一发来自 App"
 *     （服务端判定见 `main/src/lib/client/detect.ts`，两边的标记必须一致）。
 */
object AppUrl {

    /**
     * 默认站点地址。**生产域名，必须是 HTTPS**：
     * 生产 cookie 带 `Secure`，明文 HTTP 下会话 cookie 不回传，后台直接登不进去（见 P-116）。
     * 想改默认地址只改这里一处。
     */
    const val DEFAULT_SITE_URL = "https://bruccese.com"

    /** 首版（0.1.1 及以前）的编译期默认值：模拟器约定的宿主机回环地址。 */
    const val LEGACY_EMULATOR_URL = "http://10.0.2.2:3000"

    /**
     * 历史上当过"默认值"的地址。命中的已存地址会被重写成 [DEFAULT_SITE_URL] ——
     * 因为**用户不可能手敲出这些默认值**（它们是构建时注入的初值），命中即说明没被改过。
     * 以后换默认域名时，把旧默认值追加到这里（规矩同 `templates.ts` 的出厂代码升版）。
     */
    val LEGACY_DEFAULT_URLS: Set<String> = setOf(LEGACY_EMULATOR_URL)

    /** UA 追加的标记（大小写不敏感；`SmartBlog/0.1.2` 与裸 `SmartBlog` 站点都认）。 */
    const val SMARTBLOG_TAG = "SmartBlog"

    /** BuildConfig.START_URL 是构建期注入值，可能是空串（`-PstartUrl=` 就是让它留空）。 */
    private fun buildStartUrl(): String? = BuildConfig.START_URL.trim().ifBlank { null }

    /**
     * 首次启动该访问哪里：**编译期注入值优先，其次默认地址**。
     * `-PstartUrl=http://10.0.2.2:3000` 就是模拟器开发用的覆盖手段（见 docs/android/build.md §4）。
     */
    fun initialSiteUrl(): String = normalize(buildStartUrl()) ?: DEFAULT_SITE_URL

    /**
     * 读 SharedPreferences 时的收口：没存过 → null（由调用方落到 [initialSiteUrl]）；
     * 存过 → 归一化 + 历史默认值迁移。
     */
    fun resolveStoredUrl(raw: String?): String? {
        if (raw.isNullOrBlank()) {
            return null
        }
        val normalized = normalize(raw) ?: return null
        return if (normalized in LEGACY_DEFAULT_URLS) DEFAULT_SITE_URL else normalized
    }

    /**
     * 构建偏好里那个会发出去的 UA：`<内核默认 UA> SmartBlog/<版本>`。
     *
     * 追加式而不是整体替换：前面的浏览器指纹原样保留，站点侧任何按 UA 判定形态的地方都不吃亏
     * （这是 WebView 类客户端的通行做法）。已经带过标记就不重复追加。
     */
    fun withSmartBlogTag(defaultUserAgent: String?, version: String): String {
        val base = defaultUserAgent?.trim().orEmpty().ifBlank { "Mozilla/5.0" }
        if (base.contains(SMARTBLOG_TAG, ignoreCase = true)) {
            return base
        }
        return "$base $SMARTBLOG_TAG/$version"
    }

    /**
     * 地址归一化：没写协议按 `https://` 补；只接受 http/https 且必须有主机名；末尾斜杠去掉。
     *
     * 补协议默认 **https**（原来是 http）：生产地址是 HTTPS，而用户在真机上手敲域名时
     * 最可能漏协议，补 http 会让他在第一次访问就丢掉登录态（P-116）。
     * 要在模拟器上连本机 dev server，明文 http 必须显式写全（`http://10.0.2.2:3000`）。
     */
    fun normalize(raw: String?): String? {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty()) {
            return null
        }
        val withScheme = when {
            SCHEME_PREFIX.containsMatchIn(text) -> text
            // 大写协议（HTTP://）也要认；`URI` 的 scheme 本来就大小写不敏感，这里只为判断入口
            text.lowercase().startsWith("http://") || text.lowercase().startsWith("https://") -> text
            else -> "https://$text"
        }
        return try {
            val parsed = URI(withScheme)
            val scheme = parsed.scheme?.lowercase()
            if (scheme != "http" && scheme != "https") {
                return null
            }
            if (parsed.host.isNullOrBlank()) {
                return null
            }
            withScheme.trimEnd('/')
        } catch (error: Exception) {
            null
        }
    }

    /**
     * 只取 origin（`scheme://host[:port]`），去掉路径 / 查询 / 片段。
     *
     * 为什么要有这一条（单一事实源）：
     *  - **通知深链**：点通知打开的是文章 / 瞬间的**具体页面**，落盘只能落 origin。
     *    曾经把整条文章地址写进 `site_url`，之后每次启动都停在那篇文章（用户报过的 bug）；
     *  - 宿主自己的接口请求（取上传上限、推送同步）也要先取 origin 再拼路径：
     *    存的地址可能本身就是某个具体页面（如 `/admin`），直接往后拼会 404。
     *
     * 规则：`normalize()` 先过一遍（补 https、拒非法）；再取 `host` + 非默认端口；
     * scheme / host 统一小写（避免 `https://Blog.com` 与 `https://blog.com` 在偏好里存成两条）。
     */
    fun originOf(raw: String?): String? {
        val normalized = normalize(raw) ?: return null
        return runCatching {
            val parsed = URI(normalized)
            val scheme = parsed.scheme?.lowercase() ?: return null
            if (scheme != "http" && scheme != "https") return null
            val host = parsed.host ?: return null
            val port = parsed.port
            val defaultPort = (scheme == "http" && port == 80) || (scheme == "https" && port == 443)
            if (port <= 0 || defaultPort) {
                "$scheme://${host.lowercase()}"
            } else {
                "$scheme://${host.lowercase()}:$port"
            }
        }.getOrNull()
    }

    /**
     * 「这个串已经带了协议」的判定：字母开头的 scheme + `://`。
     *
     * 必须有这一条 —— 只看 `startsWith("http")` 的话，`ftp://x` 会被当成"没写协议"而补成
     * `https://ftp://x`，而 `URI("https://ftp://x")` 的主机名恰好非空、于是**静默变成合法地址**
     * （踩过：单测当场抓出来）。补协议之前先确认它不是别的协议。
     */
    private val SCHEME_PREFIX = Regex("^[A-Za-z][A-Za-z0-9+.\\-]*://")
}
