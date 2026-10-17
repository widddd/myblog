package com.smartblog.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 「哪个 accept 交给自有相册」的回归测试。
 *
 * 这条判定同时被瞬间配图、媒体库「相册视图」、编辑器插图/插视频用到；判错的表现是**静默**的
 * （不该接管时接管了 = 用户选不到音频；该接管时没接管 = 又回到系统选择器，视频不压缩），
 * 所以必须由单测盯住，不能靠手感。见 docs/moment-video-spec.md。
 */
class MediaKindsTest {

    @Test
    fun `纯图片 accept 交给自有相册（原行为不变）`() {
        assertEquals(
            AlbumMedia(images = true, videos = false),
            albumMediaForTypes(arrayOf("image/png", "image/jpeg")),
        )
    }

    @Test
    fun `纯视频 accept 也交给自有相册（编辑器插视频可用上压缩）`() {
        assertEquals(
            AlbumMedia(images = false, videos = true),
            albumMediaForTypes(arrayOf("video/mp4", "video/webm")),
        )
    }

    @Test
    fun `图片加视频的 accept 交给相册并同时给两类`() {
        // 瞬间配图 / 媒体库「相册视图」的 accept（MEDIA_UPLOAD_MIME_TYPES）
        val media = albumMediaForTypes(
            arrayOf(
                "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif",
                "video/mp4", "video/webm",
            ),
        )
        assertEquals(AlbumMedia(images = true, videos = true), media)
        assertTrue(media!!.both)
    }

    @Test
    fun `带音频的混合媒体不接管（否则音频选不到）`() {
        // 媒体库「文件视图」是三合一：必须落回系统选择器
        assertNull(albumMediaForTypes(arrayOf("image/png", "video/mp4", "audio/mpeg")))
        assertNull(albumMediaForTypes(arrayOf("audio/mpeg")))
    }

    @Test
    fun `扩展名 accept 不接管`() {
        // 导入 Markdown / 更新包走扩展名（Gecko 映射成 text/*、application/*）
        assertNull(albumMediaForTypes(arrayOf("text/markdown")))
        assertNull(albumMediaForTypes(arrayOf("application/gzip")))
        assertNull(albumMediaForTypes(arrayOf("image/png", "text/markdown")))
    }

    @Test
    fun `空列表与大小写空白都收得住`() {
        assertNull(albumMediaForTypes(null))
        assertNull(albumMediaForTypes(emptyArray()))
        assertEquals(AlbumMedia(true, false), albumMediaForTypes(arrayOf(" IMAGE/PNG ")))
        assertEquals(AlbumMedia(false, true), albumMediaForTypes(arrayOf("Video/QuickTime")))
    }

    /**
     * 「这一发是不是要录音」：站点与宿主的录音契约（见 docs/moment-audio-spec.md §2.5）。
     * 判错的后果是**静默**的：少认 = 点了麦克风弹文件选择器；多认 = 编辑器"插入音频"/媒体库文件视图
     * 再也选不到现成音频文件。两头都必须由单测盯住。
     */
    @Test
    fun `录音请求认自造标记与 capture`() {
        assertTrue(isVoiceRecordRequest(arrayOf(VOICE_RECORD_MIME), 0))
        assertTrue(
            isVoiceRecordRequest(
                arrayOf(VOICE_RECORD_MIME, "audio/webm", "audio/mp4", "audio/ogg"),
                2,
            ),
        )
        // 只有 capture（accept 全是音频）也认 —— 万一 Gecko 把自造 MIME 过滤掉了，这条路兜底。
        // capture 的真实类型是 Int（javap 实读 AAR），非 0 即"带了这个属性"（见 P-187）
        assertTrue(isVoiceRecordRequest(arrayOf("audio/webm", "audio/mp4"), 1))
        assertTrue(isVoiceRecordRequest(arrayOf(" audio/webm "), 2))
    }

    @Test
    fun `录音请求不能误吞别的音频入口`() {
        // 纯音频、没有 capture 也没有标记 → 不认：媒体库「文件视图」/ 编辑器「插入音频」要能选文件
        assertFalse(isVoiceRecordRequest(arrayOf("audio/mpeg"), 0))
        assertFalse(
            isVoiceRecordRequest(
                arrayOf("audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg"),
                0,
            ),
        )
        // capture 但 accept 不是纯音频 → 不认（capture 是通用属性，别被别的输入框带跑）
        assertFalse(isVoiceRecordRequest(arrayOf("image/png"), 1))
        assertFalse(isVoiceRecordRequest(arrayOf("image/png", "audio/mpeg"), 1))
        assertFalse(isVoiceRecordRequest(null, 1))
        assertFalse(isVoiceRecordRequest(emptyArray(), 1))
        assertFalse(isVoiceRecordRequest(null, 0))
    }
}
