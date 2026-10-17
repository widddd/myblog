package com.smartblog.app

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.Log

/**
 * 视频元信息的**兜底探测**：只在 MediaStore 缺字段时才补真值。
 *
 * 背景（本机实测的两个坑）：
 *  1. `adb push` 进相册的视频在 MediaStore 里是 **pending 行**（`_size` / `_duration` 为 NULL），
 *     读出来是 0 → `shouldCompress()` 判「不用压」→ 大文件原样交给页面，而站点只收 mp4/webm，必然被拒；
 *  2. 反过来，`MediaMetadataRetriever` 在**大 H.265/HEVC 文件**上是很重的一步（要解索引/样本表），
 *     实测把 App 拖崩过。所以：**MediaStore 齐了就别调它**，缺什么才补什么。
 *
 * 触发一次真正的媒体扫描（`content call … scan_volume`）之后，size/duration/宽高都会齐，
 * 正常路径下一次 native 调用都不会发生。调用点只在点了「完成」之后，不会为网格里每个视频都跑。
 */
object MediaProbe {

    private const val LOG_TAG = "SmartBlog"

    /** 缺哪个补哪个；都不缺就原样返回（**零 native 调用**）。 */
    fun fillMissing(context: Context, uri: Uri, measured: VideoMeta): VideoMeta {
        val needSize = measured.sizeBytes <= 0
        val needMetadata =
            measured.durationMs <= 0 ||
                measured.width <= 0 ||
                measured.height <= 0 ||
                measured.bitrateBps <= 0
        if (!needSize && !needMetadata) {
            return measured
        }
        val probed = probe(context, uri, measured.mime, needMetadata)
        val merged = CompressPolicy.mergeMeta(measured, probed)
        Log.i(
            LOG_TAG,
            "视频元信息兜底：原(size=${measured.sizeBytes} duration=${measured.durationMs} " +
                "${measured.width}x${measured.height} bitrate=${measured.bitrateBps}) → " +
                "补后(size=${merged.sizeBytes} duration=${merged.durationMs} " +
                "${merged.width}x${merged.height} bitrate=${merged.bitrateBps})",
        )
        return merged
    }

    private fun probe(
        context: Context,
        uri: Uri,
        mime: String,
        withMetadata: Boolean,
    ): VideoMeta {
        val size = runCatching {
            val length = context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: 0L
            if (length > 0) length else 0L
        }.getOrDefault(0L)

        var durationMs = 0L
        var width = 0
        var height = 0
        var bitrateBps = 0L
        if (withMetadata) {
            val retriever = MediaMetadataRetriever()
            try {
                retriever.setDataSource(context, uri)
                durationMs = retriever
                    .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                    ?.toLongOrNull()
                    ?.takeIf { it > 0 } ?: 0L
                width = retriever
                    .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
                    ?.toIntOrNull()
                    ?.takeIf { it > 0 } ?: 0
                height = retriever
                    .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
                    ?.toIntOrNull()
                    ?.takeIf { it > 0 } ?: 0
                bitrateBps = retriever
                    .extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)
                    ?.toLongOrNull()
                    ?.takeIf { it > 0 } ?: 0L
            } catch (error: Exception) {
                Log.w(LOG_TAG, "读取视频元信息失败，按 MediaStore 的值走：$uri", error)
            } finally {
                runCatching { retriever.release() }
            }
        }

        return VideoMeta(
            sizeBytes = size,
            durationMs = durationMs,
            bitrateBps = bitrateBps,
            width = width,
            height = height,
            mime = mime,
        )
    }
}
