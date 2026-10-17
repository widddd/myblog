package com.smartblog.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 压缩策略的边界测试。
 *
 * 盯的是「阈值口径」和「一定会塞进站点上限」这两件事 —— 它们错了的表现分别是
 * 「该压的没压（用户等半天传不上去）」和「压完还是 413」，都属于要复盘的那类问题。
 */
class CompressPolicyTest {

    private fun meta(
        sizeBytes: Long = 5L * 1024 * 1024,
        durationMs: Long = 10_000,
        bitrateBps: Long = 2_000_000,
        width: Int = 1280,
        height: Int = 720,
    ) = VideoMeta(
        sizeBytes = sizeBytes,
        durationMs = durationMs,
        bitrateBps = bitrateBps,
        width = width,
        height = height,
    )

    @Test
    fun `码率正好 4Mbps 不压，超过才压`() {
        assertFalse(CompressPolicy.shouldCompress(meta(bitrateBps = 4_000_000), true, 0))
        assertTrue(CompressPolicy.shouldCompress(meta(bitrateBps = 4_000_001), true, 0))
    }

    @Test
    fun `大小正好 50MB 不压，超过才压`() {
        val exactly = 50L * 1024 * 1024
        assertFalse(
            CompressPolicy.shouldCompress(
                meta(sizeBytes = exactly, durationMs = 600_000, bitrateBps = 1_000_000),
                true,
                0,
            ),
        )
        assertTrue(
            CompressPolicy.shouldCompress(
                meta(sizeBytes = exactly + 1, durationMs = 600_000, bitrateBps = 1_000_000),
                true,
                0,
            ),
        )
    }

    @Test
    fun `关掉勾选框就永远不压`() {
        val huge = meta(sizeBytes = 300L * 1024 * 1024, bitrateBps = 40_000_000)
        assertFalse(CompressPolicy.shouldCompress(huge, false, 10L * 1024 * 1024))
    }

    @Test
    fun `超过站点上限也要压（否则上传必被 413 拒）`() {
        val tenMbSite = 10L * 1024 * 1024
        // 码率和 50MB 都没超，但站点只收 10MB
        assertTrue(
            CompressPolicy.shouldCompress(
                meta(sizeBytes = 20L * 1024 * 1024, bitrateBps = 1_000_000),
                true,
                tenMbSite,
            ),
        )
        // 站点上限还没取到（0）时，只按 4Mbps / 50MB 判
        assertFalse(
            CompressPolicy.shouldCompress(
                meta(sizeBytes = 20L * 1024 * 1024, bitrateBps = 1_000_000),
                true,
                0,
            ),
        )
    }

    @Test
    fun `码率拿不到时用体积除时长反推`() {
        // 20 MiB / 10s = 16.78 Mbps → 超阈值
        val inferred = CompressPolicy.effectiveBitrate(
            meta(sizeBytes = 20L * 1024 * 1024, durationMs = 10_000, bitrateBps = 0),
        )
        assertEquals(16_777_216L, inferred)
        assertTrue(
            CompressPolicy.shouldCompress(
                meta(sizeBytes = 20L * 1024 * 1024, durationMs = 10_000, bitrateBps = 0),
                true,
                0,
            ),
        )
        // 时长非法 → 反推不出来，给 0（不拿它当「超阈值」）
        assertEquals(0L, CompressPolicy.effectiveBitrate(meta(durationMs = 0, bitrateBps = 0)))
    }

    @Test
    fun `长视频按站点上限反推码率并降档`() {
        // 60 秒要塞进 10MB：CRF 那遍估出来超标 → 反推码率（约 1.16 Mbps）并降到 720p 以上一档（1280）
        val plan = CompressPolicy.plan(
            meta(durationMs = 60_000, sizeBytes = 40L * 1024 * 1024, bitrateBps = 12_000_000),
            10L * 1024 * 1024,
        )
        val bps = plan.videoBitrateBps
        assertTrue(bps != null)
        assertEquals(CompressPolicy.HD_LONG_EDGE, plan.maxLongEdge)
        // 反推要留余量：按这个码率编完必须塞进目标体积
        val estimate = (bps!! + CompressPolicy.AUDIO_BITRATE_BPS) / 8.0 * 60.0
        assertTrue(estimate <= plan.targetBytes)
    }

    @Test
    fun `长到压不进去时守住码率下限，宁可超体积也不糊成一片`() {
        // 10 分钟塞 10MB 需要 128 kbps，那已经不是视频了：下限 600 kbps 胜出
        val plan = CompressPolicy.plan(
            meta(durationMs = 600_000, sizeBytes = 200L * 1024 * 1024, bitrateBps = 8_000_000),
            10L * 1024 * 1024,
        )
        assertEquals(CompressPolicy.MIN_VIDEO_BITRATE_BPS, plan.videoBitrateBps)
        assertEquals(CompressPolicy.SD_LONG_EDGE, plan.maxLongEdge)
    }

    @Test
    fun `容器不是站点收的两种就必压（mkv- mov 这种先转容器，与体积无关）`() {
        // 站点 VIDEO_TYPES 只收 mp4/webm；.mkv 原样上传会被 UNSUPPORTED_MEDIA_TYPE 拒
        val mkv = meta(sizeBytes = 1_000, durationMs = 1_000, bitrateBps = 100_000).copy(mime = "video/x-matroska")
        assertTrue(CompressPolicy.isForeignContainer("video/x-matroska"))
        assertTrue(CompressPolicy.shouldCompress(mkv, true, 0))
        // 体积/时长都是 0（MediaStore pending 行）也照样要压：这条不依赖它们
        assertTrue(
            CompressPolicy.shouldCompress(
                VideoMeta(sizeBytes = 0, durationMs = 0, mime = "video/x-matroska"),
                true,
                10L * 1024 * 1024,
            ),
        )
        // mp4/webm 不受这条影响；mime 拿不到（空）时也不据此判
        assertFalse(CompressPolicy.isForeignContainer("video/mp4"))
        assertFalse(CompressPolicy.isForeignContainer("video/webm"))
        assertFalse(CompressPolicy.isForeignContainer(""))
        assertFalse(CompressPolicy.shouldCompress(meta(), true, 0))
        // 关掉勾选框仍然一律不压（用户口径：这个也可以关）
        assertFalse(CompressPolicy.shouldCompress(mkv, false, 0))
    }

    @Test
    fun `mergeMeta：探测值只补 0 值，原有真值优先`() {
        val measured = VideoMeta(sizeBytes = 0, durationMs = 0, bitrateBps = 0, width = 0, height = 0, mime = "video/x-matroska")
        val probed = VideoMeta(sizeBytes = 237_000_852, durationMs = 61_000, bitrateBps = 31_000_000, width = 1080, height = 2400, mime = "video/x-matroska")
        val merged = CompressPolicy.mergeMeta(measured, probed)
        assertEquals(237_000_852L, merged.sizeBytes)
        assertEquals(61_000L, merged.durationMs)
        assertEquals(1080, merged.width)
        // 探测拿不到（0）时保留原值：不让"补一道"把已知信息抹掉
        val partial = CompressPolicy.mergeMeta(
            VideoMeta(sizeBytes = 5_000_000, durationMs = 10_000, mime = "video/mp4"),
            VideoMeta(sizeBytes = 0, durationMs = 0),
        )
        assertEquals(5_000_000L, partial.sizeBytes)
        assertEquals(10_000L, partial.durationMs)
        assertEquals("video/mp4", partial.mime)
    }

    @Test
    fun `短小 mp4 不压（回归：改造前也不会压）`() {
        assertFalse(
            CompressPolicy.shouldCompress(
                meta(sizeBytes = 3_000_000, durationMs = 20_000, bitrateBps = 1_200_000).copy(mime = "video/mp4"),
                true,
                10L * 1024 * 1024,
            ),
        )
    }

    @Test
    fun `短视频走 CRF 一遍，长边不超过 1080p`() {
        val short = CompressPolicy.plan(meta(), 10L * 1024 * 1024)
        assertNull(short.videoBitrateBps)
        assertEquals(CompressPolicy.FULL_HD_LONG_EDGE, short.maxLongEdge)
        assertEquals(10L * 1024 * 1024, short.targetBytes)
        assertTrue(CompressPolicy.exceedsTarget(short.targetBytes + 1, short))
        assertFalse(CompressPolicy.exceedsTarget(short.targetBytes, short))
    }

    @Test
    fun `站点上限拿不到时按 50MB 当目标`() {
        val plan = CompressPolicy.plan(meta(), 0)
        assertEquals(CompressPolicy.MAX_SIZE_BYTES, plan.targetBytes)
    }

    @Test
    fun `缩放只缩小不放大，横竖屏选对边`() {
        assertNull(CompressPolicy.scaleFilter(meta(width = 1280, height = 720), 1920))
        assertNull(CompressPolicy.scaleFilter(meta(width = 0, height = 0), 1920))
        assertEquals(
            "scale=1920:-2",
            CompressPolicy.scaleFilter(meta(width = 3840, height = 2160), 1920),
        )
        assertEquals(
            "scale=-2:1920",
            CompressPolicy.scaleFilter(meta(width = 1080, height = 2400), 1920),
        )
    }

    @Test
    fun `ffmpeg 参数：CRF 一遍与码率一遍各自成形`() {
        val crfArgs = CompressPolicy.ffmpegArgs(
            meta(width = 3840, height = 2160),
            CompressPolicy.plan(meta(), 50L * 1024 * 1024),
            "/tmp/in.mp4",
            "/tmp/out.mp4",
        )
        assertTrue(crfArgs.contains("libx264"))
        assertTrue(crfArgs.contains("aac"))
        assertTrue(crfArgs.contains("+faststart"))
        assertTrue(crfArgs.contains("scale=1920:-2"))
        assertTrue(crfArgs.contains("-crf"))
        assertFalse(crfArgs.contains("-b:v"))
        // 只留第一路画面 + 可选的第一路声音（两个 -map）+ 剥元信息（隐私）
        assertEquals(2, crfArgs.count { it == "-map" })
        assertTrue(crfArgs.contains("0:a:0?"))
        assertTrue(crfArgs.contains("-map_metadata"))
        assertEquals("/tmp/out.mp4", crfArgs.last())

        val bitratePlan = CompressPolicy.plan(
            meta(durationMs = 600_000, sizeBytes = 200L * 1024 * 1024, bitrateBps = 8_000_000),
            10L * 1024 * 1024,
        )
        val bitrateArgs = CompressPolicy.ffmpegArgs(
            meta(width = 3840, height = 2160),
            bitratePlan,
            "/tmp/in.mp4",
            "/tmp/out.mp4",
        )
        assertTrue(bitrateArgs.contains("-b:v"))
        assertFalse(bitrateArgs.contains("-crf"))
        assertTrue(bitrateArgs.contains("scale=720:-2"))
    }

    @Test
    fun `参数带线程上限（限制 HEVC 长视频的内存峰值）`() {
        val plan = CompressPolicy.plan(meta(), 10L * 1024 * 1024)
        val args = CompressPolicy.ffmpegArgs(meta(), plan, "/tmp/in.mkv", "/tmp/out.mp4")
        val at = args.indexOf("-threads")
        assertTrue("参数里必须有 -threads", at >= 0)
        assertEquals(CompressPolicy.FFMPEG_THREADS.toString(), args[at + 1])
        assertTrue(CompressPolicy.FFMPEG_THREADS in 1..4)
    }

    @Test
    fun `硬规则：30 分钟以上一律不许发，关掉勾选框也不能绕过`() {
        val thirtyOne = VideoMeta(sizeBytes = 5_000_000, durationMs = 31 * 60 * 1000L, mime = "video/mp4")
        val exactly30 = VideoMeta(sizeBytes = 5_000_000, durationMs = 30 * 60 * 1000L, mime = "video/mp4")
        assertTrue(CompressPolicy.isTooLong(thirtyOne))
        assertFalse("正好 30 分钟算通过（严格大于才拦）", CompressPolicy.isTooLong(exactly30))
        // 关键：勾选框关掉（enabled=false）时，规则仍然拦下来（不是压缩策略，是产品规则）
        val off = CompressPolicy.decide(thirtyOne, false, 0)
        assertFalse(off.compress)
        assertTrue(off.refusal!!.contains("30 分钟"))
        assertTrue(off.refusal!!.contains("31:00"))
        // 没带压缩器的设备（enabled 永远 false）同样拦
        assertTrue(CompressPolicy.decide(VideoMeta(sizeBytes = 0, durationMs = 45 * 60 * 1000L, mime = ""), false, 0).refusal != null)
        // 正好 30 分钟、体积也合规 → 放行（不压、不拒绝）
        val pass = CompressPolicy.decide(exactly30, true, 50L * 1024 * 1024)
        assertFalse(pass.compress)
        assertNull(pass.refusal)
    }

    @Test
    fun `时钟格式化：短于 1 小时用 m_ss，超过用 h_mm_ss`() {
        assertEquals("0:34", CompressPolicy.clockOf(34_000))
        assertEquals("42:01", CompressPolicy.clockOf(2_521_216))
        assertEquals("1:02:03", CompressPolicy.clockOf(3_723_000))
    }

    @Test
    fun `decide：42 分钟 226MB 的 mkv 命中 30 分钟规则，直接拒绝且不许启动 ffmpeg`() {
        // 用户实测的那条屏录：H.265、2521 秒 237000852 字节、站点上限 10MB。
        // 它先是撞上 30 分钟硬规则（42:01 > 30:00）→ 结论必须是「别压 + 一句人话」；
        // 否则手机上白编十几分钟、产物 200MB，还可能在 native 层把 App 拖崩（实测闪退）。
        val huge = VideoMeta(
            sizeBytes = 237_000_852,
            durationMs = 2_521_216,
            bitrateBps = 752_000,
            width = 2560,
            height = 1600,
            mime = "video/x-matroska",
        )
        val decision = CompressPolicy.decide(huge, true, 10L * 1024 * 1024)
        assertFalse(decision.compress)
        assertNull(decision.plan)
        assertTrue(decision.refusal!!.contains("42:01"))
        assertTrue(decision.refusal!!.contains("30 分钟"))
        assertTrue(decision.refusal!!.contains("剪短"))
    }

    @Test
    fun `decide：没超 30 分钟但塞不进上限时，走「压不进去」拒绝（含目标体积）`() {
        // 20 分钟、8Mbps 的原片塞 10MB：连 600kbps 下限都要 ~109MB → 拒绝，并告诉用户上限是多少
        val long = VideoMeta(
            sizeBytes = 1_200_000_000,
            durationMs = 20 * 60 * 1000L,
            bitrateBps = 8_000_000,
            width = 1920,
            height = 1080,
            mime = "video/mp4",
        )
        assertFalse(CompressPolicy.isTooLong(long))
        val decision = CompressPolicy.decide(long, true, 10L * 1024 * 1024)
        assertFalse(decision.compress)
        assertTrue(decision.refusal!!.contains("10MB"))
        assertTrue(decision.refusal!!.contains("上传大小上限"))
    }

    @Test
    fun `decide：34 秒的 2_2MB mkv 要压（容器不在白名单）且不是拒绝`() {
        val small = VideoMeta(
            sizeBytes = 2_293_457,
            durationMs = 34_134,
            bitrateBps = 537_518,
            width = 2560,
            height = 1600,
            mime = "video/x-matroska",
        )
        val decision = CompressPolicy.decide(small, true, 10L * 1024 * 1024)
        assertTrue(decision.compress)
        assertNull(decision.refusal)
        // 码率取「目标体积反推（≈2Mbps）」与「源码率（537kbps）」的较小值，再被质量下限 600kbps 兜住：
        // 结论是按 600kbps / 720p 编 → 产物 ≈3.1MB。比原 2.2MB 略大是**转码的代价**
        // （HEVC 换 H.264 才能让浏览器播得出来），但绝不会像「按 2Mbps 编」那样交一个 8MB 的"压缩版"。
        assertEquals(CompressPolicy.MIN_VIDEO_BITRATE_BPS, decision.plan!!.videoBitrateBps)
        assertEquals(CompressPolicy.SD_LONG_EDGE, decision.plan!!.maxLongEdge)
    }

    @Test
    fun `decide：不用压的文件给出干净结论（不压、不拒绝）`() {
        val fine = meta(sizeBytes = 3_000_000, durationMs = 20_000, bitrateBps = 1_200_000)
            .copy(mime = "video/mp4")
        val decision = CompressPolicy.decide(fine, true, 10L * 1024 * 1024)
        assertFalse(decision.compress)
        assertNull(decision.plan)
        assertNull(decision.refusal)
        // 关掉勾选框同样「不压、不拒绝」—— 那不是错误，不该弹提示
        val off = CompressPolicy.decide(fine.copy(mime = "video/x-matroska"), false, 0)
        assertFalse(off.compress)
        assertNull(off.refusal)
    }

    @Test
    fun `requiredFreeBytes：源体积已知按源 + 两遍产物算，未知也要有下限`() {
        val known = VideoMeta(sizeBytes = 237_000_852, durationMs = 2_521_216)
        assertEquals(
            237_000_852L + 10L * 1024 * 1024 * 2,
            CompressPolicy.requiredFreeBytes(known, 10L * 1024 * 1024),
        )
        val unknown = VideoMeta(sizeBytes = 0, durationMs = 0)
        assertEquals(
            10L * 1024 * 1024 * 3 + 10L * 1024 * 1024 * 2,
            CompressPolicy.requiredFreeBytes(unknown, 10L * 1024 * 1024),
        )
    }
}
