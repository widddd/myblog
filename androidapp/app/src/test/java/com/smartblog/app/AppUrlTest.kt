package com.smartblog.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 站点地址规则的单元测试（`gradlew :app:testDebugUnitTest`，纯 JVM、不需要模拟器）。
 *
 * 覆盖的都是"改错了就会静默丢登录态或丢掉用户设置"的地方：
 * 默认地址、历史默认值迁移、补协议默认 https、UA 追加标记。
 */
class AppUrlTest {

    @Test
    fun `默认地址是生产域名的 https`() {
        assertEquals("https://bruccese.com", AppUrl.DEFAULT_SITE_URL)
    }

    @Test
    fun `没存过地址时用默认地址而不是空`() {
        // 用户决策：首启不再进"请输入网站地址"，直接进默认站点
        assertNull(AppUrl.resolveStoredUrl(null))
        assertNull(AppUrl.resolveStoredUrl(""))
        assertNull(AppUrl.resolveStoredUrl("   "))
    }

    @Test
    fun `历史默认值被重写成当前默认地址`() {
        assertEquals(
            AppUrl.DEFAULT_SITE_URL,
            AppUrl.resolveStoredUrl(AppUrl.LEGACY_EMULATOR_URL),
        )
        // 带末尾斜杠的同一地址也要命中（normalize 先去斜杠再比对）
        assertEquals(
            AppUrl.DEFAULT_SITE_URL,
            AppUrl.resolveStoredUrl("${AppUrl.LEGACY_EMULATOR_URL}/"),
        )
    }

    @Test
    fun `用户自己填过的地址一律不动`() {
        assertEquals("http://192.168.1.10:3000", AppUrl.resolveStoredUrl("http://192.168.1.10:3000"))
        assertEquals("https://blog.example.com", AppUrl.resolveStoredUrl("https://blog.example.com/"))
        // 只差一个端口：是用户在局域网里自己选的地址，绝不能当成默认值吞掉
        assertEquals("http://10.0.2.2:3001", AppUrl.resolveStoredUrl("http://10.0.2.2:3001"))
        // 已经就是默认地址：保持原样
        assertEquals("https://bruccese.com", AppUrl.resolveStoredUrl("https://bruccese.com"))
    }

    @Test
    fun `归一化：补 https、去末尾斜杠、拒绝非法输入`() {
        assertEquals("https://bruccese.com", AppUrl.normalize("bruccese.com"))
        assertEquals("https://bruccese.com", AppUrl.normalize("  bruccese.com/  "))
        assertEquals("https://bruccese.com", AppUrl.normalize("https://bruccese.com/"))
        assertEquals("http://10.0.2.2:3000", AppUrl.normalize("http://10.0.2.2:3000"))

        assertNull(AppUrl.normalize(""))
        assertNull(AppUrl.normalize("   "))
        assertNull(AppUrl.normalize("ftp://bruccese.com"))
        assertNull(AppUrl.normalize("https://"))
        // 别的协议不能被"补协议"吞掉变成合法地址（曾经会变成 https://ftp://bruccese.com）
        assertNull(AppUrl.normalize("file:///tmp/x"))
    }

    @Test
    fun `UA 追加标记：保留内核默认 UA 原文，且不重复追加`() {
        val base = "Mozilla/5.0 (Android 11; Mobile; rv:157.0) Gecko/157.0 Firefox/157.0"
        assertEquals("$base SmartBlog/0.1.2", AppUrl.withSmartBlogTag(base, "0.1.2"))
        // 已经带过标记（比如宿主重启后又设一次）→ 原样返回
        assertEquals(
            "$base SmartBlog/0.1.2",
            AppUrl.withSmartBlogTag("$base SmartBlog/0.1.2", "9.9.9"),
        )
        // 内核没给 UA 时不能拼出一个以空格开头的串
        assertEquals("Mozilla/5.0 SmartBlog/0.1.2", AppUrl.withSmartBlogTag(null, "0.1.2"))
        assertEquals("Mozilla/5.0 SmartBlog/0.1.2", AppUrl.withSmartBlogTag("  ", "0.1.2"))
    }

    // ---------------------------------------------------------------- origin（通知深链 / 宿主请求）

    @Test
    fun `originOf 只留 scheme host port`() {
        assertEquals("https://bruccese.com", AppUrl.originOf("https://bruccese.com/posts/abc?x=1#f"))
        assertEquals("http://10.0.2.2:3000", AppUrl.originOf("http://10.0.2.2:3000/posts/abc"))
        assertEquals("https://bruccese.com", AppUrl.originOf("https://bruccese.com"))
        // 没写协议 → 先走 normalize 补 https
        assertEquals("https://bruccese.com", AppUrl.originOf("bruccese.com/admin"))
        // 默认端口去掉、scheme/host 统一小写
        assertEquals("https://blog.example.com", AppUrl.originOf("HTTPS://Blog.Example.com:443/x"))
        assertEquals("http://blog.example.com", AppUrl.originOf("http://blog.example.com:80/x"))
    }

    @Test
    fun `originOf 拒绝非法地址`() {
        assertNull(AppUrl.originOf(null))
        assertNull(AppUrl.originOf(""))
        assertNull(AppUrl.originOf("ftp://bruccese.com/x"))
        assertNull(AppUrl.originOf("file:///tmp/x"))
        assertNull(AppUrl.originOf("https://"))
    }

    @Test
    fun `通知深链只落 origin：下次启动回首页而不是那篇文章`() {
        val deepLink = "https://bruccese.com/posts/1a2b3c/hello-world"
        val stored = AppUrl.originOf(deepLink)
        assertEquals("https://bruccese.com", stored)
        // 下次启动读回的是站点首页（回归：修之前这里会等于那条文章地址）
        assertEquals("https://bruccese.com", AppUrl.resolveStoredUrl(stored))
        assertNotEquals(deepLink, AppUrl.resolveStoredUrl(stored))
    }
}
