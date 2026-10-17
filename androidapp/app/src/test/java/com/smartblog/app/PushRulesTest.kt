package com.smartblog.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 通知层纯逻辑的 JVM 单测（`gradlew :app:testDebugUnitTest`）。
 *
 * 覆盖的都是"错了会静默炸信任"的地方：管理员收了自家推送、首次安装收到一屏历史、
 * 同一条内容反复提醒、把别的站点的内容当成"我的博客更新了"。
 */
class PushRulesTest {

    private val deltaBody = """
        {
          "serverTime": "2026-10-03T12:00:00.000Z",
          "nextCursor": "2026-10-03T12:00:00.000Z",
          "posts": [
            {"href":"/posts/abc123/hello","title":"你好","excerpt":"摘要  一行\n两行","publishedAt":"2026-10-03T11:00:00.000Z","createdAt":"2026-10-03T11:00:00.000Z"},
            {"href":"/posts/def456/locked","title":"上锁的园子","excerpt":null,"publishedAt":"2026-10-03T10:00:00.000Z","createdAt":"2026-10-03T10:00:00.000Z"}
          ],
          "moments": [
            {"id":7,"href":"/moments#moment-7","text":"刚到山上","createdAt":"2026-10-03T11:30:00.000Z"}
          ]
        }
    """.trimIndent()

    /** 解析增量：文章与瞬间都进条目，指纹稳定 */
    @Test
    fun parseDelta_keepsPostsAndMomentsWithStableFingerprints() {
        val delta = PushRules.parseDelta(deltaBody)
        assertEquals(3, delta.items.size)
        assertEquals("2026-10-03T12:00:00.000Z", delta.nextCursor)

        val post = delta.items[0]
        assertEquals(NotifyItem.Kind.POST, post.kind)
        assertEquals("/posts/abc123/hello", post.href)
        assertEquals("摘要 一行 两行", post.text)          // 压空白成一行
        assertEquals("post:/posts/abc123/hello", post.fingerprint)

        // 没摘要的文章：正文回退成标题，不能是空串
        assertEquals("上锁的园子", delta.items[1].text)

        val moment = delta.items[2]
        assertEquals(NotifyItem.Kind.MOMENT, moment.kind)
        assertEquals("moment:7", moment.fingerprint)
        assertEquals("新瞬间", moment.title)
    }

    /** 坏 JSON 或缺字段当没有新内容，不抛 */
    @Test
    fun parseDelta_toleratesBrokenPayload() {
        assertEquals(0, PushRules.parseDelta("not json").items.size)
        assertNull(PushRules.parseDelta("{}").nextCursor)
        // 缺 href 的条目直接跳过，不让整批失败
        val partial = PushRules.parseDelta("""{"posts":[{"title":"没链接"}],"moments":[]}""")
        assertEquals(0, partial.items.size)
    }

    /** 只有服务端说 app 且不是管理员时才允许提醒（用户钦定的规则） */
    @Test
    fun mayNotify_requiresAppFlagAndNoAdmin() {
        assertTrue(PushRules.mayNotify(appFlag = true, admin = false))
        assertFalse(PushRules.mayNotify(appFlag = true, admin = true))
        // 地址被指到别的站点（对方不会带我们的 UA 标记）→ 不提醒
        assertFalse(PushRules.mayNotify(appFlag = false, admin = false))
        assertFalse(PushRules.mayNotify(appFlag = null, admin = null))
        // admin 为 null（旧服务端）不阻断，只要求 app 标记
        assertTrue(PushRules.mayNotify(appFlag = true, admin = null))
    }

    /** 管理员态粘性：只在明确的登录/登出信号上翻转 */
    @Test
    fun adminState_sticksUntilExplicitLoginOrLogout() {
        assertTrue(PushRules.adminStateAfterNavigation(false, "https://bruccese.com/admin"))
        assertTrue(PushRules.adminStateAfterNavigation(false, "https://bruccese.com/admin/posts"))
        assertTrue(
            PushRules.adminStateAfterNavigation(
                false,
                "https://bruccese.com/admin/backups?tab=1#top",
            ),
        )
        // 前台页面不改状态（否则管理员刷两篇文章就又收到自己的推送）
        assertTrue(PushRules.adminStateAfterNavigation(true, "https://bruccese.com/posts/abc/x"))
        assertFalse(PushRules.adminStateAfterNavigation(false, "https://bruccese.com/"))
        // 登录页是明确的"未登录"信号
        assertFalse(PushRules.adminStateAfterNavigation(true, "https://bruccese.com/admin/login"))
        assertFalse(PushRules.adminStateAfterNavigation(true, "https://bruccese.com/admin/setup"))
        // 解析不出来的地址不动状态
        assertTrue(PushRules.adminStateAfterNavigation(true, null))
        assertTrue(PushRules.adminStateAfterNavigation(true, ""))
        // 注意 `/administrator` 不是 `/admin`，不能误判
        assertFalse(PushRules.adminStateAfterNavigation(false, "https://bruccese.com/administrator"))
    }

    /** 首次只建基线，不弹通知 */
    @Test
    fun firstRun_setsBaselineWithoutNotifying() {
        val items = PushRules.parseDelta(deltaBody).items
        assertTrue(
            PushRules.newItemsToNotify(
                delta = items,
                notified = emptyList(),
                baselineJustSet = true,
                allowNotify = true,
            ).isEmpty(),
        )
    }

    /** 已经提醒过的条目不会重复提醒 */
    @Test
    fun alreadyNotifiedItemsAreSkipped() {
        val items = PushRules.parseDelta(deltaBody).items
        val toNotify = PushRules.newItemsToNotify(
            delta = items,
            notified = listOf("moment:7"),
            baselineJustSet = false,
            allowNotify = true,
        )
        assertEquals(2, toNotify.size)
        assertFalse(toNotify.any { it.fingerprint == "moment:7" })
    }

    /** 管理员态或被挡住时一条都不推 */
    @Test
    fun allowNotifyFalseYieldsNothing() {
        val items = PushRules.parseDelta(deltaBody).items
        assertTrue(
            PushRules.newItemsToNotify(items, emptyList(), baselineJustSet = false, allowNotify = false)
                .isEmpty(),
        )
    }

    /** 指纹记忆有上限，且保留最近的 */
    @Test
    fun mergeNotifiedKeepsRecentWithinLimit() {
        val previous = (1..PushRules.NOTIFIED_MEMORY).map { "post:/posts/$it" }
        val merged = PushRules.mergeNotified(previous, listOf("moment:99"))
        assertEquals(PushRules.NOTIFIED_MEMORY, merged.size)
        assertEquals("moment:99", merged.last())
        assertFalse(merged.contains("post:/posts/1"))
        // 重复并入不增长
        assertEquals(merged, PushRules.mergeNotified(merged, listOf("moment:99")))
    }

    /** 游标必须是能解析的 ISO 时间戳（坏游标宁可丢一轮，也不能重推旧内容） */
    @Test
    fun usableCursorAcceptsOnlyIsoTimestamps() {
        assertEquals(
            "2026-10-03T12:00:00.000Z",
            PushRules.usableCursor("2026-10-03T12:00:00.000Z"),
        )
        assertNull(PushRules.usableCursor("昨天"))
        assertNull(PushRules.usableCursor("2026-10-03"))
        assertNull(PushRules.usableCursor(""))
        assertNull(PushRules.usableCursor(null))
        // 带偏移量（不是 Z）也要认
        assertEquals(
            "2026-10-03T12:00:00+08:00",
            PushRules.usableCursor("2026-10-03T12:00:00+08:00"),
        )
    }

    /** 落地地址：站内路径拼 origin，绝对地址原样 */
    @Test
    fun absoluteUrlJoinsOriginForSitePaths() {
        assertEquals(
            "https://bruccese.com/posts/abc/x",
            PushRules.absoluteUrl("https://bruccese.com", "/posts/abc/x"),
        )
        assertEquals(
            "http://10.0.2.2:3000/moments#moment-7",
            PushRules.absoluteUrl("http://10.0.2.2:3000/", "/moments#moment-7"),
        )
        assertEquals(
            "https://cdn.example.com/a.png",
            PushRules.absoluteUrl("https://bruccese.com", "https://cdn.example.com/a.png"),
        )
    }

    /** 超长文案截断成一行 */
    @Test
    fun flattenCollapsesWhitespaceAndTruncates() {
        val long = "字".repeat(PushRules.POST_TEXT_CHARS + 20)
        val text = PushRules.flatten(long, PushRules.POST_TEXT_CHARS)
        assertEquals(PushRules.POST_TEXT_CHARS + 1, text.length)
        assertTrue(text.endsWith("…"))
        assertEquals("", PushRules.flatten(null, 10))
    }
}
