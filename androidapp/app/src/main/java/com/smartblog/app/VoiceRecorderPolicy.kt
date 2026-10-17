package com.smartblog.app

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * 语音录音的**纯逻辑**（无 Android 依赖，JVM 单测直接盯）。
 *
 * 与站点侧同一套产品口径（见 docs/moment-audio-spec.md，站点那侧在
 * `main/src/lib/moments/compose-rules.ts` 的 `MOMENT_MAX_AUDIO_MS` / `MOMENT_MAX_AUDIOS`）：
 * 单条 ≤ 5 分钟、128 kbps 单声道；上限同时受站点单文件上限约束（折成"最多能录多久"）。
 *
 * 拆出来的理由和 `CompressPolicy.kt` 一样：阈值与算术一旦写进 View，就再也测不了了。
 */
object VoiceRecorderPolicy {

    /** 单条语音硬上限：5 分钟（站点侧 `MOMENT_MAX_AUDIO_MS` 同值） */
    const val MAX_DURATION_MS = 5 * 60 * 1000L

    /** 至少给 5 秒：站点单文件上限被设得极小时也别录出一个 0 秒的文件 */
    const val MIN_RECORD_MS = 5_000L

    /** 128 kbps 单声道 ≈ 16 KB/s —— 用来把"站点单文件上限"折成"最多录多久" */
    const val BYTES_PER_SECOND = 16_000L

    /** 裁剪后至少留 1 秒（两个手柄拖到一起也别交出 0 秒文件） */
    const val MIN_TRIM_MS = 1_000L

    /**
     * 实时波形的**采样间隔**（毫秒）：一格 = 一格时间。
     *
     * 与 [LIVE_SLOTS] 一起定死"一行只显示十秒钟"：前 10 秒波形从左往右长出来，
     * 之后整条往左滚 —— 屏幕上永远是**过去 10 秒**（用户口径）。
     */
    const val SAMPLE_MS = 100L

    /** 实时波形的时间窗口：10 秒 */
    const val LIVE_WINDOW_MS = 10_000L

    /** 实时波形的槽位数 = 10 秒 ÷ 100ms（绘制时按它算每格宽度，所以不会越录越细） */
    const val LIVE_SLOTS = (LIVE_WINDOW_MS / SAMPLE_MS).toInt()

    /** 裁剪界面显示整段波形的柱数 */
    const val REVIEW_BARS = 120

    /**
     * 录制态：窗口里第 [arrayIndex] 根（0 = 窗口里**最旧**那根，末尾 = 最新）画在第几个槽位。
     *
     * 口径（用户定的，别自己改）：槽位 0 在最左、`slots - 1` 在最右；
     * **从最左边开始向右生长**；窗口满了之后每来一根，整条**向左滑动**一格，
     * 最旧的那根从左边滑出去，最新的一根始终落在最右边。
     *
     * 因为 `setLive()` 只保留最近 `LIVE_SLOTS` 根，数组下标与槽位同向：
     * `slot = arrayIndex`，夹在 `0..slots-1`。
     */
    fun liveSlot(arrayIndex: Int, slots: Int = LIVE_SLOTS): Int =
        arrayIndex.coerceIn(0, (slots - 1).coerceAtLeast(0))

    /** `MediaRecorder.getMaxAmplitude()` 的满量程（0..32767） */
    private const val AMPLITUDE_FULL_SCALE = 32_767.0

    /** 静音地板：低于它就画 0，免得静音段抖出一排细刺 */
    private const val SILENCE_AMPLITUDE = 300

    /**
     * 这次最多能录多久：`min(5 分钟, 站点单文件上限 ÷ 16 KB/s)`。
     * 站点把上限调到 1MiB 时 → 65 秒（1_048_576 ÷ 16_000），录出来的东西才传得上去（与视频压缩同一个思路）。
     */
    fun maxRecordMs(serverMaxBytes: Long): Long {
        if (serverMaxBytes <= 0) {
            return MAX_DURATION_MS
        }
        val bySize = (serverMaxBytes / BYTES_PER_SECOND) * 1000
        return min(MAX_DURATION_MS, bySize).coerceAtLeast(MIN_RECORD_MS)
    }

    /** 振幅 → 0–100 的柱高；开方曲线让小音量也看得见（与站点侧 `peakFromAmplitude` 同思路）。 */
    fun amplitudeToLevel(amplitude: Int): Int {
        if (amplitude <= SILENCE_AMPLITUDE) {
            return 0
        }
        val ratio = (amplitude.coerceAtMost(AMPLITUDE_FULL_SCALE.toInt()) / AMPLITUDE_FULL_SCALE)
        return (sqrt(ratio) * 100).roundToInt().coerceIn(0, 100)
    }

    /**
     * 把任意长度的柱序列压成 [bars] 根：每组取**最大值**（平均会把语音的尖峰抹平，
     * 看起来就不像波形了）。空输入返回空列表。
     */
    fun downSample(levels: List<Int>, bars: Int): List<Int> {
        if (levels.isEmpty() || bars <= 0) {
            return emptyList()
        }
        if (levels.size <= bars) {
            return levels.map { it.coerceIn(0, 100) }
        }
        val result = ArrayList<Int>(bars)
        for (index in 0 until bars) {
            val start = index * levels.size / bars
            val end = max(start + 1, (index + 1) * levels.size / bars)
            var peak = 0
            for (cursor in start until min(end, levels.size)) {
                peak = max(peak, levels.getOrElse(cursor) { 0 }.coerceIn(0, 100))
            }
            result.add(peak)
        }
        return result
    }

    /**
     * 两个手柄的位置（0–1）→ 实际裁剪区间：
     * 夹进 `0..durationMs`、保证 ≥ [MIN_TRIM_MS]（优先往后补，贴到末尾就往前顶）、保证 start < end。
     */
    fun trimRange(startRatio: Double, endRatio: Double, durationMs: Long): TrimRange {
        if (durationMs <= 0) {
            return TrimRange(0, 0)
        }
        val safeStart = if (startRatio.isFinite()) startRatio else 0.0
        val safeEnd = if (endRatio.isFinite()) endRatio else 1.0
        val low = min(safeStart, safeEnd).coerceIn(0.0, 1.0)
        val high = max(safeStart, safeEnd).coerceIn(0.0, 1.0)
        var start = (low * durationMs).toLong()
        var end = (high * durationMs).toLong()
        if (end - start < MIN_TRIM_MS) {
            end = min(durationMs, start + MIN_TRIM_MS)
            start = max(0L, end - MIN_TRIM_MS)
        }
        start = start.coerceIn(0L, durationMs)
        end = end.coerceIn(0L, durationMs)
        return TrimRange(startMs = start, endMs = end)
    }

    /** 这个区间是不是"整段没动"（是就交原文件，不重封装）。 */
    fun isFullRange(range: TrimRange, durationMs: Long, toleranceMs: Long = 50L): Boolean =
        range.startMs <= toleranceMs && range.endMs >= durationMs - toleranceMs

    /** `m:ss` / `h:mm:ss`（与站点侧 `momentClock()` 同一套写法） */
    fun clockOf(ms: Long): String {
        val totalSeconds = max(0L, ms) / 1000
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val seconds = totalSeconds % 60
        return if (hours > 0) {
            "%d:%02d:%02d".format(hours, minutes, seconds)
        } else {
            "%d:%02d".format(minutes, seconds)
        }
    }
}

/** 裁剪区间（毫秒）。`startMs` 含、`endMs` 不含。 */
data class TrimRange(val startMs: Long, val endMs: Long) {
    val durationMs: Long get() = max(0L, endMs - startMs)
}
