package com.smartblog.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PickedFileNameTest {

    private val longWeiboName =
        "img-1792197890327e459ffaeb3a3cf7e2dce3bb514cab86d7bb60809b3af4acc87584006850f56b.jpg"

    @Test
    fun `超长微博图片名压到上限并保留扩展名`() {
        val safe = PickedFileName.sanitize(longWeiboName)
        assertTrue(safe.length <= PickedFileName.MAX_LENGTH)
        assertTrue(safe.endsWith(".jpg"))
        assertTrue(safe.startsWith("img-"))
    }

    @Test
    fun `非法字符替换且中文名有稳定兜底`() {
        assertEquals("dir_bad_name.png", PickedFileName.sanitize("../dir\\bad:name.png"))
        assertEquals("voice_1.m4a", PickedFileName.sanitize("voice 1.m4a"))
        // 中文主体会整体变成 _，清理后为空 → 用 fallback
        assertEquals("fallback.jpg", PickedFileName.sanitize("录音.jpg", fallback = "fallback"))
    }

    @Test
    fun `没有扩展名与空名字都可用`() {
        val noExt = PickedFileName.sanitize("clip", fallback = "picked")
        assertEquals("clip", noExt)
        assertEquals("fallback.webm", PickedFileName.sanitize("", fallback = "fallback.webm"))
    }
}
