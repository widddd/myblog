package com.smartblog.app

import org.json.JSONObject
import java.net.URI
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** 一条待提醒的条目（文章或瞬间）。`kind` 决定进哪个渠道、图标与点击后去哪。 */
data class NotifyItem(
    val kind: Kind,
    val href: String,
    val title: String,
    val text: String,
    val fingerprint: String,
) {
    enum class Kind { POST, MOMENT }
}

/** `/api/feed/updates` 的解析结果：同一批新条目 + 服务端给的下一个游标。 */
data class FeedDelta(
    val items: List<NotifyItem>,
    val nextCursor: String?,
)

/**
 * 通知层的**纯逻辑**（无 Android API，JVM 单测覆盖）：
 * 客户端标识的可允许判定、URL → 管理员态、`/api/feed/updates` 的行 → 通知条目、文案清洗。
 *
 * 站点侧的契约见 `main/src/lib/feed/`（updates.ts 等）与 `main/src/app/api/feed/updates/route.ts`；
 * 通知层只是**消费者**，不在这里重算"什么是新内容"（那是服务端 `createdAt > since` 的事）。
 */
object PushRules {

    /** 两个渠道：文章与瞬间分开，用户能在系统设置里单独关掉一个。 */
    const val CHANNEL_POSTS = "posts"
    const val CHANNEL_MOMENTS = "moments"

    /**
     * 通知里的瞬间正文上限。**与站点侧 `MOMENT_NOTIFY_CHARS` 保持同一个数**：
     * 服务端已经截过一次（`momentNotifyText()`），这里再截一次只是防御
     * ——客户端不能假设服务端永远先截（测试/旧版本/直连别的实例都可能不截）。
     */
    const val MOMENT_TEXT_CHARS = 60

    /** 通知里文章摘要的上限（服务端发的是全文摘要，通知栏放不下）。 */
    const val POST_TEXT_CHARS = 100

    /** 每轮的 `limit`：通知只用来"告诉你有什么新的"，不需要翻页。 */
    const val FEED_LIMIT = 20

    /** 已提醒指纹的记忆条数（防重复提醒；只保留最近这些）。 */
    const val NOTIFIED_MEMORY = 120

    /** 前台轮询间隔：App 可见时（用户正拿着手机）走这个，接近实时。 */
    const val FOREGROUND_INTERVAL_MS = 60_000L

    /**
     * 后台巡检间隔。走 `AlarmManager.setAndAllowWhileIdle()`（**不需要**
     * `SCHEDULE_EXACT_ALARM` 权限），系统会把唤醒合并到维护窗口：
     * 亮屏时基本按时，Doze 里可能被推迟到十几分钟一次——这是省电与及时性的固有取舍，
     * 想更实就该上常驻前台服务（本版本刻意不做，见 docs/android/push-plan.md）。
     */
    const val BACKGROUND_INTERVAL_MS = 12 * 60 * 1000L

    /** 网络超时：前台宽松 10s，后台 20s（后台可能是刚被唤醒、网络还没起来）。 */
    const val TIMEOUT_FOREGROUND_MS = 10_000
    const val TIMEOUT_BACKGROUND_MS = 20_000

    /**
     * 这一发请求是不是 **本站 App** 自己发的（判定依据取自 `/api/client/status` 的 `app` 字段）。
     *
     * ⚠️ **必须在服务端说 `app: true` 时才发通知**：`/api/client/status` 与 `/api/feed/updates`
     * 都是公开接口，任何脚本都能拿到内容。这条检查不是安全边界（通知栏也没啥可偷的），
     * 它的作用是**防止用户把地址指到别的站点上**，App 却按"我的博客更新了"弹通知——
     * 那会让"推荐/通知"这种信任关系指向错误的地方。
     */
    fun mayNotify(appFlag: Boolean?, admin: Boolean?): Boolean =
        appFlag == true && admin != true

    /**
     * 当前是否处于「管理员态」（**服务端不可判时的兜底**）。
     *
     * 为什么在 App 里判：GeckoView 157 的公开 API 里**没有 cookie 访问**
     * （`GeckoRuntime.getCookieManager()` 已移除，AAR `javap` 实读确认），
     * 而 `myblog.session` 是 HttpOnly —— 宿主拿不到会话 cookie，也就无法替服务端回答
     * "这个 App 是不是登录着后台"。
     * 兜底规则（**粘性**，只在明确的登录/登出信号上翻转）：
     *  - 看到 `/admin`（且不是登录页/创建页）→ 认为已登录 → 之后**一直**按管理员处理；
     *  - 看到 `/admin/login` → 明确的登出/失败信号 → 取消管理员态；
     *  - 其它页面（前台文章、瞬间…）不改变状态 —— 否则管理员刷两篇文章就又会收到自己的推送。
     */    fun adminStateAfterNavigation(currentAdmin: Boolean, url: String?): Boolean {
        val path = adminPath(url) ?: return currentAdmin
        return when {
            path == "/admin/login" || path == "/admin/setup" -> false
            path == "/admin" || path.startsWith("/admin/") -> true
            else -> currentAdmin
        }
    }

    /** 取 URL 的路径部分（去掉 query / fragment）；解析不出来返回 null。 */
    fun adminPath(url: String?): String? {
        if (url.isNullOrBlank()) {
            return null
        }
        return runCatching {
            val parsed = URI(url)
            val path = parsed.path ?: return null
            path.ifEmpty { "/" }
        }.getOrNull()
    }

    /** 解析 `/api/feed/updates`：坏 JSON / 缺字段一律当"没有新内容"，不抛。 */
    fun parseDelta(body: String): FeedDelta {
        val root = runCatching { JSONObject(body) }.getOrNull()
            ?: return FeedDelta(emptyList(), null)
        val cursor = root.optString("nextCursor").takeIf { it.isNotBlank() }

        val posts = root.optJSONArray("posts")?.let { array ->
            (0 until array.length()).mapNotNull { index ->
                val row = array.optJSONObject(index) ?: return@mapNotNull null
                val href = row.optString("href").takeIf { it.isNotBlank() } ?: return@mapNotNull null
                val title = row.optString("title").takeIf { it.isNotBlank() } ?: return@mapNotNull null
                NotifyItem(
                    kind = NotifyItem.Kind.POST,
                    href = href,
                    title = title,
                    text = flatten(row.optString("excerpt").ifBlank { title }, POST_TEXT_CHARS),
                    fingerprint = postFingerprint(href),
                )
            }
        } ?: emptyList()

        val moments = root.optJSONArray("moments")?.let { array ->
            (0 until array.length()).mapNotNull { index ->
                val row = array.optJSONObject(index) ?: return@mapNotNull null
                val href = row.optString("href").takeIf { it.isNotBlank() } ?: return@mapNotNull null
                val id = row.optLong("id", -1L).takeIf { it > 0 } ?: return@mapNotNull null
                NotifyItem(
                    kind = NotifyItem.Kind.MOMENT,
                    href = href,
                    title = "新瞬间",
                    text = flatten(row.optString("text"), MOMENT_TEXT_CHARS),
                    fingerprint = "moment:$id",
                )
            }
        } ?: emptyList()

        return FeedDelta(posts + moments, cursor)
    }

    /** 通知点击后的落地地址：服务端给的是站内路径，拼成绝对地址。 */
    fun absoluteUrl(origin: String, href: String): String {
        if (href.startsWith("http://") || href.startsWith("https://")) {
            return href
        }
        val base = origin.trimEnd('/')
        return if (href.startsWith("/")) "$base$href" else "$base/$href"
    }

    /**
     * 指纹列表的收口：新条目并入、去重、**只保留最近 `memory` 条**。
     * 顺序即"最近程度"（服务端按时间倒序给），所以保留尾部最旧的淘汰。
     */
    fun mergeNotified(
        previous: List<String>,
        added: List<String>,
        memory: Int = NOTIFIED_MEMORY,
    ): List<String> {
        val merged = LinkedHashSet<String>()
        merged.addAll(previous)
        merged.addAll(added)
        val list = merged.toList()
        return if (list.size <= memory) list else list.subList(list.size - memory, list.size)
    }

    /** 新条目里**该发**的那些：已提醒过的、以及被抑制条件挡掉的都不要。 */
    fun newItemsToNotify(
        delta: List<NotifyItem>,
        notified: List<String>,
        baselineJustSet: Boolean,
        allowNotify: Boolean,
    ): List<NotifyItem> {
        if (baselineJustSet || !allowNotify) {
            return emptyList()
        }
        val known = notified.toHashSet()
        return delta.filterNot { known.contains(it.fingerprint) }
    }

    /** 把任意文本压成一行（通知栏换行会被吃掉），超长截断加省略号。 */
    fun flatten(raw: String?, maxChars: Int): String {
        val flat = raw.orEmpty().replace(Regex("\\s+"), " ").trim()
        return if (flat.length <= maxChars) flat else flat.take(maxChars) + "…"
    }

    /** 指纹：文章用**站内路径**（publicId+slug 在里面），瞬间用 id。 */
    fun postFingerprint(href: String): String = "post:$href"

    /**
     * 服务端让回的游标原样用（它是服务端时间，不信手机时钟）。
     * 只做"必须是个能解析的时间戳"的检查：解析不出来就当没有游标 → 下一轮重新建基线，
     * 宁可丢一轮提醒，也不能拿着坏游标把旧内容当新的重推一遍。
     */
    fun usableCursor(raw: String?): String? {
        if (raw.isNullOrBlank()) {
            return null
        }
        return if (parseIsoMillis(raw) != null) raw else null
    }

    /** ISO 8601（带时区）→ 毫秒；解析不出来返回 null。 */
    fun parseIsoMillis(raw: String?): Long? {
        if (raw.isNullOrBlank()) {
            return null
        }
        val patterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
        )
        for (pattern in patterns) {
            runCatching {
                val format = SimpleDateFormat(pattern, Locale.US)
                format.timeZone = TimeZone.getTimeZone("UTC")
                return format.parse(raw)?.time
            }
        }
        return null
    }
}
