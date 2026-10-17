package com.smartblog.app

/**
 * 相册视图能接的媒体组合。
 *
 * 站点的 `<input type="file" accept="…">` 是宿主与站点之间唯一的契约（GeckoView 把 accept
 * 变成 `FilePrompt.mimeTypes`）。这里把「这一组 mimeTypes 要不要交给自有相册」定成一条纯逻辑，
 * 好让 JVM 单测能直接盯住它 —— 见 docs/moment-video-spec.md。
 */
data class AlbumMedia(val images: Boolean, val videos: Boolean) {
    val both: Boolean get() = images && videos
}

/**
 * `accept` → 相册视图的媒体组合；返回 `null` = **不接管**，仍走系统选择器。
 *
 * 入参就是 GeckoView `FilePrompt.mimeTypes` 的原样（`Array<String>`，可能为 null），
 * 所以不做类型转换、直接判 —— 判定逻辑集中在这里，`MainActivity` 只问结论。
 *
 * 规则（与 docs/android/architecture.md §6b 的表一致）：
 *  - 全部以 `image/` 开头 → 只图片（原来的行为，封面 / 编辑器插图 / 折叠组都走这条）
 *  - 全部以 `video/` 开头 → 只视频（编辑器「插入视频」也能用上自动压缩）
 *  - `image/` + `video/` 混着 → 图片 + 视频（瞬间配图、媒体库「相册视图」）
 *  - 出现 `audio/`、扩展名映射（`text/markdown`、`application/gzip`…）或空列表 → 不接管
 *
 * 为什么音频要挡掉：媒体库「文件视图」是图片/视频/音频三合一的 accept，让相册接管就等于
 * 用户再也选不到音频；混合媒体本来就该交给系统选择器。
 */
fun albumMediaForTypes(types: Array<String>?): AlbumMedia? {
    if (types.isNullOrEmpty()) {
        return null
    }
    var images = false
    var videos = false
    for (raw in types) {
        when {
            raw.trim().lowercase().startsWith("image/") -> images = true
            raw.trim().lowercase().startsWith("video/") -> videos = true
            else -> return null
        }
    }
    return if (images || videos) AlbumMedia(images = images, videos = videos) else null
}

/**
 * 站点在 App 模式下给「录音」按钮挂的**自造 accept 标记**。
 * 与 `main/src/lib/upload/limits.ts` 的 `VOICE_RECORD_MIME` 同口径 —— 改一处必须同时改另一处。
 */
const val VOICE_RECORD_MIME = "audio/x-smartblog-voice"

/**
 * 这一发文件请求是不是「要一段录音」→ 宿主弹**原生录音界面**，不是相册、也不是系统选择器。
 *
 * 站点给了两个信号（见 docs/moment-audio-spec.md §2.5），认到任意一个就算：
 *  1. accept 里有自造标记 `VOICE_RECORD_MIME`（最明确）；
 *  2. `capture` 属性存在且 accept **全是音频**（HTML 标准里"用麦克风录一段"的表达方式）。
 *
 * ⚠️ `capture` 的**真实形状是 `Int` 字段**（`javap` 实读 GeckoView 157 的 AAR：
 * `public final int capture`，AAR 里没有公开常量，所以只判"非 0 即表示带了这个属性"），
 * 不是 `String` —— 曾经按 String 写，编译期就炸（见 P-187）。
 *
 * 为什么第二个条件要卡"全是音频"：`capture` 是通用属性，哪天一篇文章的封面输入框也带上它，
 * 就会把录音器弹出来 —— 只认音频类请求才安全。
 * 也**不能**把"纯 audio accept"一律当成录音：媒体库「文件视图」和编辑器「插入音频」都是
 * audio 类 accept，那样用户就再也选不到现成的音频文件了（与 `albumMediaForTypes` 挡掉音频同一个理由）。
 */
fun isVoiceRecordRequest(types: Array<String>?, capture: Int): Boolean {
    val list = types.orEmpty().map { it.trim().lowercase() }.filter { it.isNotEmpty() }
    if (list.any { it == VOICE_RECORD_MIME }) {
        return true
    }
    return capture != 0 && list.isNotEmpty() && list.all { it.startsWith("audio/") }
}
