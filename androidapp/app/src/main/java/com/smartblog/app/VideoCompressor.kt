package com.smartblog.app

import android.content.Context
import android.net.Uri
import android.util.Log
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegSession
import com.arthenica.ffmpegkit.FFmpegSessionCompleteCallback
import com.arthenica.ffmpegkit.ReturnCode
import com.arthenica.ffmpegkit.StatisticsCallback
import java.io.File
import java.io.FileOutputStream

/**
 * 视频压缩执行层（**唯一碰 ffmpeg 的地方**）。
 *
 * 依赖是 `dev.ffmpegkit-maintained:ffmpeg-kit-min-gpl`（社区维护的 drop-in 包，含 x264，
 * GPL-3.0 —— 见 docs/android/build.md 与 docs/moment-video-spec.md）。这一层只做四件事：
 *  1. 把 `content://` 拷成真实文件（ffmpeg 只吃路径；顺手也让输入与原文件解耦）；
 *  2. 按 [CompressPolicy] 给出的参数跑 ffmpeg（**参数列表**形式，不做 shell 拼接）；
 *  3. 第一遍 CRF 之后产物仍超站点上限 → 按体积反推码率再压一遍；
 *  4. 失败/取消一律回「没有产物」——调用方据此交原视频，绝不把半成品或坏文件交出去。
 *
 * 线程：所有回调来自 ffmpeg 自己的线程，**UI 更新由调用方 runOnUiThread**（与相册里其它异步解码同规矩）。
 */
class VideoCompressor(private val context: Context) {

    private var session: FFmpegSession? = null

    @Volatile
    private var cancelled = false

    /** 取消当前这一次压缩（勾选框旁边那个「取消」按钮，以及从相册退出时）。 */
    fun cancel() {
        cancelled = true
        // AAR 里只有 cancel() / cancel(long)：用 sessionId（javap 实读，见 docs/android/build.md）
        session?.let { runCatching { FFmpegKit.cancel(it.sessionId) } }
        session = null
    }

    fun compress(
        source: Uri,
        meta: VideoMeta,
        serverMaxBytes: Long,
        onProgress: (percent: Int) -> Unit,
        onDone: (File?) -> Unit,
    ) {
        cancelled = false
        onProgress(0)
        Thread {
            // 空间闸门：先算要多少，不够就别开编 —— 输入副本 + 最多两遍产物，
            // 42 分钟的视频要 ~700MB，边编边满盘只会得到一个半成品（或把设备拖崩）。
            val needed = CompressPolicy.requiredFreeBytes(meta, serverMaxBytes)
            val free = runCatching { context.cacheDir.usableSpace }.getOrDefault(0L)
            if (free in 1 until needed) {
                Log.w(LOG_TAG, "缓存空间不足：需要 $needed 字节，可用 $free 字节")
                onDone(null)
                return@Thread
            }
            val input = runCatching { copyToCache(source) }.getOrNull()
            if (input == null || cancelled) {
                Log.w(LOG_TAG, "压缩前拷贝源视频失败或已取消：$source")
                onDone(null)
                return@Thread
            }
            val firstPlan = CompressPolicy.plan(meta, serverMaxBytes)
            val firstOutput = newOutputFile("pass1")
            // 第一遍占 0–60%，真要第二遍时再占 60–100%
            runPass(input, meta, firstPlan, firstOutput, base = 0, span = 60, onProgress) { ok ->
                if (!ok || cancelled) {
                    firstOutput.delete()
                    input.delete()
                    onDone(null)
                    return@runPass
                }
                if (!CompressPolicy.exceedsTarget(firstOutput.length(), firstPlan)) {
                    input.delete()
                    onDone(firstOutput)
                    return@runPass
                }
                Log.i(
                    LOG_TAG,
                    "第一遍产物 ${firstOutput.length()} 字节仍超上限 ${firstPlan.targetBytes}，按目标码率再压一遍",
                )
                val fittedPlan = CompressPolicy.planBySize(meta, serverMaxBytes)
                val secondOutput = newOutputFile("pass2")
                runPass(input, meta, fittedPlan, secondOutput, base = 60, span = 40, onProgress) { ok2 ->
                    firstOutput.delete()
                    input.delete()
                    if (!ok2 || cancelled) {
                        secondOutput.delete()
                        onDone(null)
                        return@runPass
                    }
                    onProgress(100)
                    onDone(secondOutput)
                }
            }
        }.start()
    }

    /** 跑一遍 ffmpeg；`onDone(true)` 只在「返回码成功且产物非空」时给。 */
    private fun runPass(
        input: File,
        meta: VideoMeta,
        plan: CompressPlan,
        output: File,
        base: Int,
        span: Int,
        onProgress: (Int) -> Unit,
        onDone: (Boolean) -> Unit,
    ) {
        val args = CompressPolicy.ffmpegArgs(meta, plan, input.absolutePath, output.absolutePath)
        Log.i(LOG_TAG, "开始压缩：${input.length()} 字节 → 目标 ${plan.targetBytes} 字节")
        val complete =
            FFmpegSessionCompleteCallback { finished ->
                session = null
                val ok =
                    ReturnCode.isSuccess(finished.returnCode) &&
                        output.exists() &&
                        output.length() > 0
                if (!ok) {
                    Log.w(
                        LOG_TAG,
                        "压缩失败：state=${finished.state} rc=${finished.returnCode}",
                    )
                } else {
                    Log.i(LOG_TAG, "压缩完成：${input.length()} → ${output.length()} 字节")
                }
                onDone(ok)
            }
        // 进度 = ffmpeg 报的已处理时长 / 视频总时长（`Statistics.getTime()` 是毫秒）
        val progress =
            StatisticsCallback { stats ->
                if (cancelled) {
                    return@StatisticsCallback
                }
                val percent =
                    if (meta.durationMs > 0) {
                        ((stats.time / meta.durationMs) * 100).toInt()
                    } else {
                        0
                    }
                onProgress(base + (percent.coerceIn(0, 100) * span / 100))
            }
        // 参数走 String[]（javap 实读：AAR 里只有 executeWithArgumentsAsync(String[], …)）。
        //
        // ⚠️ 这一句必须接 **Throwable**：ffmpeg-kit 的**类加载失败**是 `NoClassDefFoundError`（Error 不是
        // Exception）。实测就发生过一次：维护版 AAR 的 POM 漏声明 `smart-exception-java`，第一次调用
        // `FFmpegKit.<clinit>` 就抛 Error → 没人接 → **进程直接死**（用户看到的就是「点压缩闪退」）。
        // 接住之后最差也只是「这一遍没压成，交原文件」，绝不会把 App 带走。
        try {
            session = FFmpegKit.executeWithArgumentsAsync(args.toTypedArray(), complete, null, progress)
        } catch (error: Throwable) {
            Log.e(LOG_TAG, "启动 ffmpeg 失败，按这一遍没压成处理：$error")
            session = null
            onDone(false)
        }
    }

    /**
     * 把 `content://` 拷进缓存目录。
     *
     * 不直接用 `FFmpegKitConfig.getSafParameterForRead()`：那条路要求内容提供者支持
     * SAF 文件描述符，实测机型差异大；先拷一份最笨也最稳，文件名还留在手里（日志好看）。
     */
    private fun copyToCache(source: Uri): File? {
        val dir = File(context.cacheDir, INPUT_DIR)
        if (!dir.exists() && !dir.mkdirs()) {
            return null
        }
        dir.listFiles()?.forEach { it.delete() }
        val target = File(dir, "input-${System.currentTimeMillis()}${extensionOf(source)}")
        return try {
            context.contentResolver.openInputStream(source)?.use { input ->
                FileOutputStream(target).use { output -> input.copyTo(output) }
            } ?: return null
            if (target.length() <= 0) {
                target.delete()
                null
            } else {
                target
            }
        } catch (error: Exception) {
            Log.w(LOG_TAG, "拷贝待压缩视频失败：$source", error)
            target.delete()
            null
        }
    }

    private fun extensionOf(uri: Uri): String {
        val fromPath = uri.lastPathSegment?.substringAfterLast('.', "")?.lowercase()
        return if (fromPath in VIDEO_EXTENSIONS) ".$fromPath" else ".mp4"
    }

    private fun newOutputFile(tag: String): File {
        val dir = File(context.cacheDir, OUTPUT_DIR).apply { if (!exists()) mkdirs() }
        return File(dir, "compress-${System.currentTimeMillis()}-$tag.mp4")
    }

    companion object {
        private const val LOG_TAG = "SmartBlog"

        /** 压缩产物目录：由 `AlbumPickerView` 在**每次打开相册前**清一次（同 `PhotoFiles.clearEditedDir`） */
        internal const val OUTPUT_DIR = "compressed"
        private const val INPUT_DIR = "compress-input"

        private val VIDEO_EXTENSIONS =
            setOf("mp4", "m4v", "mov", "mkv", "webm", "3gp", "ts", "avi")

        /**
         * 清掉上一次会话留下的压缩产物与输入副本。
         *
         * ⚠️ 与编辑产物同一个时机要求：**只能在打开相册之前调**。点「完成」时
         * `closeAlbumPicker()`（→ `shutdown()`）先跑、`confirmPending()` 之后才把文件交给页面，
         * 页面还要拿它去上传 —— 在 shutdown 里清会把刚压好的文件删掉。
         */
        fun clearCache(context: Context) {
            File(context.cacheDir, OUTPUT_DIR).listFiles()?.forEach { it.delete() }
            File(context.cacheDir, INPUT_DIR).listFiles()?.forEach { it.delete() }
        }
    }
}
