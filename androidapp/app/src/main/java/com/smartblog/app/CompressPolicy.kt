package com.smartblog.app

/**
 * 视频压缩策略（**纯逻辑，无 android.\*，配 JVM 单测**）。
 *
 * 用户口径（2026-10-11，见 docs/moment-video-spec.md）：
 *  - 相册视图里有一个「自动压缩视频」勾选框（默认开，可关）；
 *  - **码率 > 4 Mbps** 或 **大小 > 50 MB** 时自动压缩；
 *  - 另外补了一条工程上必须的触发：超过**站点单文件上限**（`GET /api/upload/limits` 的 `maxBytes`，
 *    默认 10MB）也压 —— 否则那样大小的视频传上去只会被服务端 413 拒掉。
 *
 * 目标参数做过取舍：
 *  - x264 `-preset veryfast` + `-crf 24`：手机端 CPU 编得动，画质对博客配图足够；
 *  - `-maxrate 4M -bufsize 8M`：把码率硬压在阈值以内（CRF 只管质量不管码率）；
 *  - 长边上限 1920 且**不放大**；AAC 128k；`+faststart` 让网页能边下边播；
 *  - 显式 `-map 0:v:0 -map 0:a:0?` + `-map_metadata -1`：只留一路画面/声音，
 *    顺手**剥掉 GPS 等元信息**（原视频文件本身不动，这在压缩产物上做）；
 *  - 一遍 CRF 之后如果产物仍超过站点上限，则按「时长 × 目标体积」反推码率再压一遍
 *    （此时降长边到 1280 / 720），保证一定塞得进站点。
 */
data class VideoMeta(
    val sizeBytes: Long,
    val durationMs: Long,
    /** MediaStore 给的码率；拿不到给 0（`effectiveBitrate()` 会用体积和时长反推） */
    val bitrateBps: Long = 0,
    val width: Int = 0,
    val height: Int = 0,
    /** 真实 mime（`video/x-matroska` 这种「不是站点收的格式」也要压，见 `shouldCompress()`） */
    val mime: String = "",
)

/** 一次压缩的目标参数（纯数据，便于单测断言）。 */
data class CompressPlan(
    val maxLongEdge: Int,
    /** 非空 = 用目标码率编（第二遍 / 按体积反推），空 = 走 CRF */
    val videoBitrateBps: Long?,
    val crf: Int,
    val preset: String,
    val audioBitrateBps: Int,
    /** 产物要压到多少字节以内（= 站点单文件上限，拿不到时按 50MB） */
    val targetBytes: Long,
)

/**
 * 「这条视频要不要压、能不能压」的结论。
 *
 * `compress=false && refusal != null` 是**明确拒绝**：压了也塞不进站点上限（连码率下限都救不回来）。
 * 这时**绝不能**再启动 ffmpeg —— 42 分钟的视频在手机上要编十几分钟，最后交一个 200MB 的产物，
 * 既浪费时间又白占空间（实测：真机上直接闪退，栈里连 Java 异常都没有，是 native/内存那层挂的）。
 */
data class CompressDecision(
    val compress: Boolean,
    val plan: CompressPlan?,
    /** 不能压的原因（给用户看的一句人话）；能压 / 本来就不需要压时为 null */
    val refusal: String?,
)

object CompressPolicy {

    /** 码率阈值：4 Mbps（严格大于才压） */
    const val MAX_BITRATE_BPS = 4_000_000L

    /** 体积阈值：50 MB（严格大于才压） */
    const val MAX_SIZE_BYTES = 50L * 1024 * 1024

    const val FULL_HD_LONG_EDGE = 1920
    const val HD_LONG_EDGE = 1280
    const val SD_LONG_EDGE = 720
    const val DEFAULT_CRF = 24
    const val DEFAULT_PRESET = "veryfast"
    const val AUDIO_BITRATE_BPS = 128_000

    /** 按体积反推码率时给容器开销留的余量 */
    const val SIZE_HEADROOM = 0.92

    /** 码率下限（再低就没法看了；到这一步说明该劝用户剪短而不是继续压） */
    const val MIN_VIDEO_BITRATE_BPS = 600_000L

    /** ffmpeg 线程数上限（见 `ffmpegArgs()`：限制解码帧缓冲与内存峰值） */
    const val FFMPEG_THREADS = 2

    /**
     * **硬规则：视频时长上限 30 分钟**（与站点 `lib/moments/compose-rules.ts` 同一口径）。
     *
     * 这不是「压不进去」那种技术判断，而是产品规则：半小时以上的视频**一律不许发**。
     * 它必须在勾选框关掉、甚至这台设备没带压缩器（armeabi-v7a）时同样生效 —— 规则不依赖功能开关。
     */
    const val MAX_DURATION_MS = 30 * 60 * 1000L

    /** 是否超过时长上限（时长未知 = 0 时不算超，交给能拿到时长的路径去拦）。 */
    fun isTooLong(meta: VideoMeta): Boolean = meta.durationMs > MAX_DURATION_MS

    /** 超时长的提示语（含实际时长，方便用户判断剪到哪里）。 */
    fun tooLongMessage(meta: VideoMeta): String =
        "这段视频 ${clockOf(meta.durationMs)} 超过 30 分钟上限：请先剪短再发"

    /** `m:ss` / `h:mm:ss`。 */
    fun clockOf(durationMs: Long): String {
        val seconds = durationMs / 1000
        return if (seconds >= 3600) {
            String.format("%d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
        } else {
            String.format("%d:%02d", seconds / 60, seconds % 60)
        }
    }

    /**
     * 站点**收**的容器（`lib/upload/handle.ts` 的 `VIDEO_TYPES` 就是这两个）。
     *
     * 别的容器（`.mkv` / `.mov` / `.3gp`…）站点会以 `UNSUPPORTED_MEDIA_TYPE` 拒掉，
     * 所以在客户端就得压一道 —— 压缩正好也是「转成 mp4」的那一步。
     */
    val SITE_VIDEO_MIMES = setOf("video/mp4", "video/webm")

    /** mime 已知且不是站点收的两种 → 必须压（转容器）；mime 空（拿不到）时不据此判。 */
    fun isForeignContainer(mime: String): Boolean =
        mime.isNotBlank() && mime.lowercase() !in SITE_VIDEO_MIMES

    /** 真实码率：优先 MediaStore 的 bitrate，缺了用 `体积 × 8 / 时长` 推；都不可得给 0。 */
    fun effectiveBitrate(meta: VideoMeta): Long {
        if (meta.bitrateBps > 0) {
            return meta.bitrateBps
        }
        if (meta.durationMs <= 0 || meta.sizeBytes <= 0) {
            return 0
        }
        return meta.sizeBytes * 8_000 / meta.durationMs
    }

    /**
     * 要不要压。
     *
     * @param enabled 勾选框；关掉就永远不压（用户明确要求「这个也可以关了」）
     * @param serverMaxBytes 站点单文件上限；<=0 表示还不知道（只按 4Mbps / 50MB / 容器判）
     */
    fun shouldCompress(meta: VideoMeta, enabled: Boolean, serverMaxBytes: Long): Boolean {
        if (!enabled) {
            return false
        }
        // 容器不在站点白名单里 ⇒ 必压（先判它：这条不依赖体积/时长，pending 行也能救回来）
        if (isForeignContainer(meta.mime)) {
            return true
        }
        // 下面几条都要体积；体积未知（MediaStore 的 pending 行）时不动，交给 MediaProbe 补真值
        if (meta.sizeBytes <= 0) {
            return false
        }
        if (effectiveBitrate(meta) > MAX_BITRATE_BPS) {
            return true
        }
        if (meta.sizeBytes > MAX_SIZE_BYTES) {
            return true
        }
        return serverMaxBytes > 0 && meta.sizeBytes > serverMaxBytes
    }

    /**
     * 用「探测到的真值」补上 MediaStore 缺的字段（**只在原值为 0/空时填**）。
     *
     * 为什么必须有这一步：`adb push` 进去的视频在 MediaStore 里是 `_size`/`_duration` 为 NULL 的
     * pending 行（本机实测），直接读会得到 0 → `shouldCompress()` 判「不用压」→ 大文件原样上传被站点拒。
     * 纯函数、配单测；探测本身在 `MediaProbe.kt`（要 android API）。
     */
    fun mergeMeta(measured: VideoMeta, probed: VideoMeta): VideoMeta =
        VideoMeta(
            sizeBytes = if (measured.sizeBytes > 0) measured.sizeBytes else probed.sizeBytes,
            durationMs = if (measured.durationMs > 0) measured.durationMs else probed.durationMs,
            bitrateBps = if (measured.bitrateBps > 0) measured.bitrateBps else probed.bitrateBps,
            width = if (measured.width > 0) measured.width else probed.width,
            height = if (measured.height > 0) measured.height else probed.height,
            mime = if (measured.mime.isNotBlank()) measured.mime else probed.mime,
        )

    /** 目标参数：先按 CRF 一遍；预估塞不进目标体积时改成按体积反推码率 + 降长边。 */
    fun plan(meta: VideoMeta, serverMaxBytes: Long): CompressPlan {
        val targetBytes = targetOf(serverMaxBytes)
        val durationSec = meta.durationMs / 1000.0
        // CRF 那遍的码率上限就是 MAX_BITRATE_BPS：用它估最坏产物体积
        val estimatedBytes =
            if (durationSec > 0) {
                (MAX_BITRATE_BPS + AUDIO_BITRATE_BPS) / 8.0 * durationSec
            } else {
                0.0
            }
        if (durationSec <= 0 || estimatedBytes <= targetBytes) {
            return CompressPlan(
                maxLongEdge = FULL_HD_LONG_EDGE,
                videoBitrateBps = null,
                crf = DEFAULT_CRF,
                preset = DEFAULT_PRESET,
                audioBitrateBps = AUDIO_BITRATE_BPS,
                targetBytes = targetBytes,
            )
        }
        return planBySize(meta, serverMaxBytes)
    }

    /**
     * **一定**按目标体积反推码率的那一版（第二遍用）。
     *
     * 第一遍走 CRF 时产物仍超站点上限就退回这里：`目标体积 × 8 × 余量 / 时长 - 音频码率`
     * 就是视频码率；低于 [MIN_VIDEO_BITRATE_BPS] 时守住下限（10 分钟要塞进 10MB 本来就
     * 不该靠压，硬压只会糊成一片 —— 宁可让站点拒一次，也不要交一个看不出内容的文件）。
     */
    fun planBySize(meta: VideoMeta, serverMaxBytes: Long): CompressPlan {
        val targetBytes = targetOf(serverMaxBytes)
        val durationSec = meta.durationMs / 1000.0
        val totalBps =
            if (durationSec > 0) {
                (targetBytes * 8.0 * SIZE_HEADROOM / durationSec).toLong()
            } else {
                MIN_VIDEO_BITRATE_BPS + AUDIO_BITRATE_BPS
            }
        // 两条约束取小：① 目标体积反推的码率；② **源视频自己的码率**。
        // 第 ② 条容易被忽略：一条 34 秒 2.2MB 的 mkv（537kbps）按 10MB 上限反推是 2Mbps，
        // 照这个编「压缩」出来的文件比原文件还大 —— 压缩绝不能把文件压大。源码率拿不到时不设这条限。
        val fromTarget = totalBps - AUDIO_BITRATE_BPS
        val sourceBps = effectiveBitrate(meta)
        val ceiling = if (sourceBps > 0) minOf(fromTarget, sourceBps) else fromTarget
        val videoBps = maxOf(MIN_VIDEO_BITRATE_BPS, ceiling)
        val longEdge = when {
            videoBps < 900_000 -> SD_LONG_EDGE
            videoBps < 1_800_000 -> HD_LONG_EDGE
            else -> FULL_HD_LONG_EDGE
        }
        return CompressPlan(
            maxLongEdge = longEdge,
            videoBitrateBps = videoBps,
            crf = DEFAULT_CRF,
            preset = DEFAULT_PRESET,
            audioBitrateBps = AUDIO_BITRATE_BPS,
            targetBytes = targetBytes,
        )
    }

    private fun targetOf(serverMaxBytes: Long): Long =
        if (serverMaxBytes > 0) serverMaxBytes else MAX_SIZE_BYTES

    /**
     * 最终裁决：**要不要压 + 压得进去吗**。
     *
     * 比 `shouldCompress()` 多一层「值不值得压」：按 [planBySize] 反推出的码率（含下限）估一遍产物体积，
     * 如果连码率下限都塞不进目标体积，说明这段视频**不该靠压来解决**（42 分钟要塞进 10MB 需要 30kbps，
     * 那不是视频）。此时直接拒绝并给一句人话，绝不启动 ffmpeg：手机上编十几分钟、产物 200MB、
     * 还可能在 native 层把 App 拖崩（本机实测过的闪退）。
     */
    fun decide(meta: VideoMeta, enabled: Boolean, serverMaxBytes: Long): CompressDecision {
        // ① 硬规则先判：30 分钟以上一律不许发 —— **与勾选框、与有没有压缩器都无关**。
        //    （放在最前面，是为了让「关掉自动压缩」也不能绕过这条规则。）
        if (isTooLong(meta)) {
            return CompressDecision(compress = false, plan = null, refusal = tooLongMessage(meta))
        }
        if (!shouldCompress(meta, enabled, serverMaxBytes)) {
            return CompressDecision(compress = false, plan = null, refusal = null)
        }
        val plan = plan(meta, serverMaxBytes)
        val bitrate = plan.videoBitrateBps
        val durationSec = meta.durationMs / 1000.0
        if (bitrate != null && durationSec > 0) {
            val estimatedBytes = (bitrate + plan.audioBitrateBps) / 8.0 * durationSec
            if (estimatedBytes > plan.targetBytes) {
                return CompressDecision(
                    compress = false,
                    plan = null,
                    refusal = refusalMessage(meta, plan.targetBytes),
                )
            }
        }
        return CompressDecision(compress = true, plan = plan, refusal = null)
    }

    /** 拒绝时给用户看的一句话（含时长与目标体积，别只说「不行」）。 */
    fun refusalMessage(meta: VideoMeta, targetBytes: Long): String {
        val mb = targetBytes / (1024 * 1024)
        return "这段视频 ${clockOf(meta.durationMs)} 太长，压不到 ${mb}MB 以内：请先剪短，或在后台把「上传大小上限」调大"
    }

    /** 产物还超标吗（第二遍的判据）。 */
    fun exceedsTarget(outputBytes: Long, plan: CompressPlan): Boolean =
        plan.targetBytes > 0 && outputBytes > plan.targetBytes

    /**
     * 压缩需要的最小可用空间：源视频一份副本 + 两遍产物的余量。
     *
     * 源体积未知（MediaStore 没给、兜底也拿不到）时按目标体积的 3 倍算 —— 至少能挡住"盘满还硬编"。
     */
    fun requiredFreeBytes(meta: VideoMeta, serverMaxBytes: Long = 0): Long {
        val sourcePart = if (meta.sizeBytes > 0) meta.sizeBytes else targetOf(serverMaxBytes) * 3
        return sourcePart + targetOf(serverMaxBytes) * 2
    }

    /**
     * 缩放滤镜：**不放大**（源比目标小就完全不写 `-vf`），横屏限宽、竖屏限高。
     *
     * 刻意不用 `scale='min(1920,iw)':-2` 那种表达式：filtergraph 里逗号要转义，
     * 少一层引号就会静默变成「两个滤镜」；宽高从 MediaStore 就能拿到，直接算更稳。
     */
    fun scaleFilter(meta: VideoMeta, maxLongEdge: Int): String? {
        val longEdge = maxOf(meta.width, meta.height)
        if (longEdge <= 0 || longEdge <= maxLongEdge) {
            return null
        }
        return if (meta.width >= meta.height) {
            "scale=$maxLongEdge:-2"
        } else {
            "scale=-2:$maxLongEdge"
        }
    }

    /** 一条 ffmpeg 命令（参数列表形式交给 `FFmpegKit.executeWithArgumentsAsync`，不做 shell 拼接）。 */
    fun ffmpegArgs(
        meta: VideoMeta,
        plan: CompressPlan,
        inputPath: String,
        outputPath: String,
    ): List<String> {
        val args = mutableListOf("-y", "-hide_banner", "-nostdin")

        // 只留第一路画面 + 可选的第一路声音：字幕/数据流（有的是乱七八糟的附件）不进产物
        args += listOf("-i", inputPath, "-map", "0:v:0", "-map", "0:a:0?")

        // 线程数封顶：HEVC 长视频在手机上解码时，默认「核数路」会把帧缓冲和内存撑爆
        // （实测机型上表现为直接闪退，Java 层什么都抓不到）。2 路足够压 720p/1080p。
        args += listOf("-threads", FFMPEG_THREADS.toString())

        scaleFilter(meta, plan.maxLongEdge)?.let { args += listOf("-vf", it) }

        args += listOf("-c:v", "libx264", "-preset", plan.preset, "-pix_fmt", "yuv420p")
        val bitrate = plan.videoBitrateBps
        if (bitrate != null) {
            args += listOf(
                "-b:v", bitrate.toString(),
                "-maxrate", (bitrate * 3 / 2).toString(),
                "-bufsize", (bitrate * 3).toString(),
            )
        } else {
            args += listOf(
                "-crf", plan.crf.toString(),
                "-maxrate", MAX_BITRATE_BPS.toString(),
                "-bufsize", (MAX_BITRATE_BPS * 2).toString(),
            )
        }
        args += listOf(
            "-c:a", "aac",
            "-b:a", plan.audioBitrateBps.toString(),
            // 剥掉元信息：原视频文件不动，压缩产物不带 GPS / 设备型号
            "-map_metadata", "-1",
            "-movflags", "+faststart",
            outputPath,
        )
        return args
    }
}
