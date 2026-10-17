package com.smartblog.app

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.util.Log
import java.io.File
import java.nio.ByteBuffer

/**
 * 裁剪执行层：**`MediaExtractor` + `MediaMuxer`，不重编码**。
 *
 * 为什么不用 ffmpeg：App 里那套 ffmpeg-kit 是 `min-gpl`，只用来压视频；音频裁剪根本用不上编码器
 * —— 直接把所选区间里的采样原样搬进一个新容器，既没有二次损失，也不给 APK 再添体积
 * （见 docs/moment-audio-spec.md §2.5）。
 *
 * 精度：AAC 每一帧都是同步帧，`seekTo(start, SEEK_TO_PREVIOUS_SYNC)` 落点误差 ≈ 一帧（21ms 量级），
 * 起点的 PTS 会被平移成 0，所以剪出来的东西**从头就能播**。
 */
internal object AudioTrimmer {

    private const val TAG = "SmartBlog"

    /** 读不到 KEY_MAX_INPUT_SIZE 时的兜底缓冲 */
    private const val FALLBACK_BUFFER_BYTES = 64 * 1024

    /**
     * 把 `[range.startMs, range.endMs)` 剪出来写到 [output]。
     *
     * @return 成功时返回 [output]；失败返回 null（**调用方兜底交原文件**，绝不交半成品）
     */
    fun trim(input: File, range: TrimRange, output: File): File? {
        if (range.durationMs <= 0 || !input.exists()) {
            return null
        }
        var extractor: MediaExtractor? = null
        var muxer: MediaMuxer? = null
        var muxerStarted = false
        var written = 0
        return try {
            extractor = MediaExtractor().apply { setDataSource(input.absolutePath) }
            val trackIndex = firstAudioTrack(extractor) ?: return null
            val format = extractor.getTrackFormat(trackIndex)
            extractor.selectTrack(trackIndex)

            muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            val outTrack = muxer.addTrack(format)
            muxer.start()
            muxerStarted = true

            val startUs = range.startMs * 1000
            val endUs = range.endMs * 1000
            extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

            val maxInput = if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
                format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE)
            } else {
                0
            }
            val buffer = ByteBuffer.allocate(maxOf(maxInput, FALLBACK_BUFFER_BYTES))
            val info = MediaCodec.BufferInfo()

            while (true) {
                buffer.clear()
                val size = extractor.readSampleData(buffer, 0)
                if (size < 0) {
                    break
                }
                val timeUs = extractor.sampleTime
                if (timeUs < 0 || timeUs >= endUs) {
                    break
                }
                // 落点可能比 start 早一帧：早于起点的那部分丢掉，保证 PTS 单调且从 0 开始
                if (timeUs >= startUs) {
                    info.offset = 0
                    info.size = size
                    info.presentationTimeUs = timeUs - startUs
                    info.flags = if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) {
                        MediaCodec.BUFFER_FLAG_KEY_FRAME
                    } else {
                        0
                    }
                    muxer.writeSampleData(outTrack, buffer, info)
                    written += 1
                }
                if (!extractor.advance()) {
                    break
                }
            }

            if (written == 0) {
                Log.w(TAG, "裁剪区间里没有可写的采样，放弃重封装")
                null
            } else {
                Log.i(TAG, "裁剪完成：${written} 个采样，${output.length()} 字节")
                output
            }
        } catch (error: Exception) {
            Log.w(TAG, "裁剪失败", error)
            null
        } finally {
            if (muxerStarted) {
                runCatching { muxer?.stop() }
            }
            runCatching { muxer?.release() }
            runCatching { extractor?.release() }
            // 失败时别把半成品留在缓存里（成功时它是最终产物）
            if (written == 0) {
                output.delete()
            }
        }
    }

    private fun firstAudioTrack(extractor: MediaExtractor): Int? {
        for (index in 0 until extractor.trackCount) {
            val mime = extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("audio/")) {
                return index
            }
        }
        return null
    }
}
