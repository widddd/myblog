package com.smartblog.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 语音录音的阈值与算术（见 docs/moment-audio-spec.md）。
 *
 * 这些数字直接决定"录到 5 分钟自动停"和"裁剪出来的到底是哪一段"，写错一次就是**静默**发出一条
 * 被剪坏的语音，所以全部由单测钉住（与 `CompressPolicyTest` 同一个理由）。
 */
class VoiceRecorderPolicyTest {

    @Test
    fun `单条上限 5 分钟，站点单文件上限可以把它压得更短`() {
        // 默认 10MB：128kbps ≈ 16KB/s → 625 秒，所以是 5 分钟这条规则先到
        assertEquals(
            VoiceRecorderPolicy.MAX_DURATION_MS,
            VoiceRecorderPolicy.maxRecordMs(10L * 1024 * 1024),
        )
        // 站点把上限调到 1MiB → 只够录 65 秒（1_048_576 ÷ 16_000 = 65.536，取整 65；录长了上传必然 413）
        assertEquals(65_000L, VoiceRecorderPolicy.maxRecordMs(1024L * 1024))
        // 上限被设得极小也别算出 0 秒：给 5 秒下限
        assertEquals(VoiceRecorderPolicy.MIN_RECORD_MS, VoiceRecorderPolicy.maxRecordMs(1_000L))
        // 取不到上限（0/负数）时只认 5 分钟
        assertEquals(VoiceRecorderPolicy.MAX_DURATION_MS, VoiceRecorderPolicy.maxRecordMs(0))
        assertEquals(VoiceRecorderPolicy.MAX_DURATION_MS, VoiceRecorderPolicy.maxRecordMs(-1))
    }

    @Test
    fun `振幅换算：静音地板 + 开方曲线 + 满量程夹取`() {
        assertEquals(0, VoiceRecorderPolicy.amplitudeToLevel(0))
        assertEquals(0, VoiceRecorderPolicy.amplitudeToLevel(300))
        assertEquals(0, VoiceRecorderPolicy.amplitudeToLevel(-5))
        // 32767 / 4 ≈ 8192 → 开方后正好一半高
        assertEquals(50, VoiceRecorderPolicy.amplitudeToLevel(8192))
        assertEquals(100, VoiceRecorderPolicy.amplitudeToLevel(32767))
        assertEquals(100, VoiceRecorderPolicy.amplitudeToLevel(99_999))
    }

    @Test
    fun `下采样取组内最大值（平均会把语音尖峰抹平）`() {
        assertEquals(listOf(90, 30), VoiceRecorderPolicy.downSample(listOf(10, 90, 20, 30), 2))
        // 本来就不长 → 原样返回（顺带夹取）
        assertEquals(listOf(10, 20), VoiceRecorderPolicy.downSample(listOf(10, 20), 4))
        assertEquals(listOf(5, 100, 0), VoiceRecorderPolicy.downSample(listOf(5, 200, -3), 3))
        assertEquals(emptyList<Int>(), VoiceRecorderPolicy.downSample(emptyList(), 4))
        assertEquals(emptyList<Int>(), VoiceRecorderPolicy.downSample(listOf(1, 2), 0))
        // 压缩后长度固定
        assertEquals(5, VoiceRecorderPolicy.downSample(List(37) { 40 }, 5).size)
    }

    @Test
    fun `裁剪区间：夹取、最小时长、贴边不越界`() {
        assertEquals(TrimRange(0, 10_000), VoiceRecorderPolicy.trimRange(0.0, 1.0, 10_000))
        assertEquals(TrimRange(2_000, 6_000), VoiceRecorderPolicy.trimRange(0.2, 0.6, 10_000))
        // 反向拖（左手柄跑到右手柄右边）也按"左小右大"处理
        assertEquals(TrimRange(2_000, 6_000), VoiceRecorderPolicy.trimRange(0.6, 0.2, 10_000))
        // 两个手柄拖到一起 → 至少留 1 秒（往后补）
        assertEquals(TrimRange(3_000, 4_000), VoiceRecorderPolicy.trimRange(0.3, 0.3, 10_000))
        // 拖到最右端 → 往左顶，不能越过末尾
        assertEquals(TrimRange(9_000, 10_000), VoiceRecorderPolicy.trimRange(1.0, 1.0, 10_000))
        // 越界值夹回 0..1
        assertEquals(TrimRange(0, 10_000), VoiceRecorderPolicy.trimRange(-1.0, 2.0, 10_000))
        // 没有时长就没有区间
        assertEquals(TrimRange(0, 0), VoiceRecorderPolicy.trimRange(0.2, 0.6, 0))
        // 非法比率不能把整段录音判成 0 秒
        assertEquals(TrimRange(0, 10_000), VoiceRecorderPolicy.trimRange(Double.NaN, 1.0, 10_000))
        assertEquals(TrimRange(0, 10_000), VoiceRecorderPolicy.trimRange(0.0, Double.NaN, 10_000))
        // 比最小时长还短的录音：整段保留，不凭空造时间
        assertEquals(TrimRange(0, 400), VoiceRecorderPolicy.trimRange(0.0, 1.0, 400))
    }

    @Test
    fun `整段没动就别重封装`() {
        assertTrue(VoiceRecorderPolicy.isFullRange(TrimRange(0, 10_000), 10_000))
        assertTrue(VoiceRecorderPolicy.isFullRange(TrimRange(20, 9_980), 10_000))
        assertFalse(VoiceRecorderPolicy.isFullRange(TrimRange(0, 9_000), 10_000))
        assertFalse(VoiceRecorderPolicy.isFullRange(TrimRange(500, 10_000), 10_000))
    }

    @Test
    fun `时钟文案与站点侧 momentClock 一致`() {
        assertEquals("0:00", VoiceRecorderPolicy.clockOf(0))
        assertEquals("0:00", VoiceRecorderPolicy.clockOf(-5))
        assertEquals("0:34", VoiceRecorderPolicy.clockOf(34_000))
        assertEquals("5:00", VoiceRecorderPolicy.clockOf(300_000))
        assertEquals("42:01", VoiceRecorderPolicy.clockOf(2_521_216))
        assertEquals("1:02:03", VoiceRecorderPolicy.clockOf(3_723_000))
    }

    @Test
    fun `实时波形方向：从最左开始向右长，满了之后整条向左滚`() {
        val slots = VoiceRecorderPolicy.LIVE_SLOTS
        // 数组下标 0 = 窗口里最旧那根 → 最左槽位；末尾 = 最新那根 → 最右槽位
        assertEquals(0, VoiceRecorderPolicy.liveSlot(0))
        assertEquals(slots - 1, VoiceRecorderPolicy.liveSlot(slots - 1))
        // 录到 3 秒（30 根）时只占最左边连续的 0…29 槽
        val slots30 = (0 until 30).map { VoiceRecorderPolicy.liveSlot(it) }
        assertEquals(0, slots30.min())
        assertEquals(29, slots30.max())
        // 绘制只拿最近 LIVE_SLOTS 根；窗口满后来一根，数组头被丢掉，下标整体前移 = 视觉上整条向左滚
        val before = (0 until slots).toList()
        val after = (before + slots).takeLast(slots)
        assertEquals(1, after.first())
        assertEquals(slots, after.last())
        assertEquals(VoiceRecorderPolicy.liveSlot(slots - 1), VoiceRecorderPolicy.liveSlot(after.lastIndex))
        // 越界下标夹在两端
        assertEquals(0, VoiceRecorderPolicy.liveSlot(-1))
        assertEquals(slots - 1, VoiceRecorderPolicy.liveSlot(slots + 5))
    }
}
