package com.smartblog.app

import android.content.Context
import android.media.MediaRecorder
import android.util.Log
import java.io.File

/**
 * 录音执行层：`MediaRecorder`（MPEG_4 + AAC，128 kbps / 44.1 kHz / **单声道**）→ `cacheDir/voice/`。
 *
 * 为什么是 M4A/AAC 而不是 MP3：用户本轮拍板"不强制 MP3、用系统原生编码"
 * （见 docs/moment-audio-spec.md）。Android 的 `MediaRecorder` 没有 MP3 编码器，
 * 要 MP3 就得换 ffmpeg 包或引 LAME 移植 —— 代价不成比例；AAC/M4A 全平台（含 iOS Safari）都能播。
 *
 * 纪律（与 `VideoCompressor.clearCache()` / `PhotoFiles.clearEditedDir()` 同一套）：
 * 产物只在**本次会话**里活着，每次打开录音界面前清一次目录；交给 Gecko 之后就归它了。
 */
internal class AudioRecorder(private val context: Context) {

    companion object {
        private const val TAG = "SmartBlog"

        /** 产物目录（cacheDir 下，系统清缓存时会一起回收） */
        private const val OUTPUT_DIR = "voice"

        /** 128 kbps（产品口径就是 128k） */
        private const val BIT_RATE = 128_000

        private const val SAMPLE_RATE = 44_100

        fun outputDir(context: Context): File = File(context.cacheDir, OUTPUT_DIR)

        /** 每次打开录音界面之前清一次（与相册/视频压缩同一时机） */
        fun clearOutputDir(context: Context) {
            outputDir(context).listFiles()?.forEach { it.delete() }
        }
    }

    private var recorder: MediaRecorder? = null
    private var file: File? = null

    /**
     * 开始录音。返回产物文件；失败（没权限 / 麦克风被占 / 设备不支持）返回 null，
     * 调用方给一句人话并关掉界面（**绝不让页面一直等在那儿**）。
     */
    @Suppress("DEPRECATION")
    fun start(): File? {
        release()
        val dir = outputDir(context)
        if (!dir.exists() && !dir.mkdirs()) {
            Log.w(TAG, "录音目录建不出来：${dir.absolutePath}")
            return null
        }
        val target = File(dir, "voice-${System.currentTimeMillis()}.m4a")
        val media = MediaRecorder()
        return try {
            media.setAudioSource(MediaRecorder.AudioSource.MIC)
            media.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            media.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            media.setAudioEncodingBitRate(BIT_RATE)
            media.setAudioSamplingRate(SAMPLE_RATE)
            media.setAudioChannels(1)
            media.setOutputFile(target.absolutePath)
            media.prepare()
            media.start()
            recorder = media
            file = target
            Log.i(TAG, "开始录音：${target.name}")
            target
        } catch (error: Exception) {
            Log.w(TAG, "启动录音失败", error)
            runCatching { media.release() }
            target.delete()
            null
        }
    }

    /** 本帧最大振幅（0..32767）；不在录音时是 0。 */
    fun amplitude(): Int = runCatching { recorder?.maxAmplitude ?: 0 }.getOrDefault(0)

    /** 停止并交出文件；没录到数据（0 字节）算失败，返回 null 并清掉残文件。 */
    fun stop(): File? {
        val media = recorder ?: return null
        recorder = null
        return try {
            media.stop()
            runCatching { media.reset() }
            media.release()
            val target = file
            file = null
            if (target != null && target.length() > 0) {
                Log.i(TAG, "录音完成：${target.length()} 字节")
                target
            } else {
                target?.delete()
                Log.w(TAG, "录音产物是空的，已丢弃")
                null
            }
        } catch (error: Exception) {
            // 录了不到一帧就停（或设备出错）时 stop() 会抛 —— 当失败处理，别把坏文件交出去
            Log.w(TAG, "停止录音失败", error)
            runCatching { media.reset() }
            runCatching { media.release() }
            file?.delete()
            file = null
            null
        }
    }

    /**
     * 取消：停掉、把产物删掉，并**无条件释放麦克风**（用户点"取消"/退出界面/App 被切走）。
     *
     * 这里不能再用 `file ?: return` 做早退：录音刚启动失败、或调用方在 `stop()` 之后又走
     * 一次清理时，`file` 可能是 null，但 `MediaRecorder` 仍可能持有 MIC。`release()` 本身
     * 也不保证停掉采集，所以清理顺序固定为 `stop → reset → release`，每一步都容错。
     */
    fun cancel() {
        releaseMedia(deleteOutput = true)
    }

    fun release() {
        releaseMedia(deleteOutput = true)
    }

    private fun releaseMedia(deleteOutput: Boolean) {
        val media = recorder
        recorder = null
        val target = file
        file = null

        if (media != null) {
            runCatching { media.stop() }
            runCatching { media.reset() }
            runCatching { media.release() }
        }
        if (deleteOutput) {
            target?.delete()
        }
    }
}
