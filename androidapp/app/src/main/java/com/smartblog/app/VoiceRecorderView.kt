package com.smartblog.app

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.animation.ValueAnimator
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * App 的原生录音界面（**小窗**，苹果式弹入动画）。
 *
 * 用户口径（见 docs/moment-audio-spec.md §2.5）：
 *  - 点发布区麦克风 → 宿主弹这个小窗（不是网页那张卡片：App 模式下页面根本不会渲染它）；
 *  - 录制中：实时波形 + 计时 + 停止；
 *  - **停止后不直接上传**：显示整段波形，可以拖两端截取/裁剪时长、可以试听，确认后才把文件
 *    经既有的 `FilePrompt` 通道交回页面（页面走现成的上传链路，宿主不碰 cookie、不自己上传）。
 *
 * 生命周期：`onHostPause()`（App 被切到后台）直接取消 —— 本项目刻意不申请前台服务
 * （见 docs/android/push-plan.md 的「不要 FOREGROUND_SERVICE」），后台继续录音既不合法也不该做。
 */
internal class VoiceRecorderView(
    private val activity: Activity,
    /** 这一次最多能录多久：min(5 分钟, 站点单文件上限 ÷ 16KB/s)，见 [VoiceRecorderPolicy.maxRecordMs] */
    private val maxRecordMs: Long,
    private val onFinished: (File) -> Unit,
    private val onCancelled: () -> Unit,
) {

    private enum class Phase { RECORDING, REVIEW, PROCESSING }

    private companion object {
        const val TAG = "SmartBlog"

        /** 波形采样间隔：≈16 帧/秒，够顺，也不至于每帧都重排布局 */
        const val TICK_MS = VoiceRecorderPolicy.SAMPLE_MS

        /** 小窗最大宽度 */
        const val CARD_MAX_DP = 460

        /** 试听进度轮询间隔 */
        const val PLAY_TICK_MS = 80L
    }

    private val palette = hostPalette(activity)
    private val dialog = Dialog(activity)
    private val handler = Handler(Looper.getMainLooper())
    private val recorder = AudioRecorder(activity)

    private val titleView = hostText(activity, "录音", sizeSp = 17f, color = palette.title, bold = true)
    private val timerView = hostText(activity, "0:00", sizeSp = 32f, color = palette.title, bold = true)
        .apply { typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD) }
    private val hintView = hostText(activity, sizeSp = 13f, color = palette.hint)
    /** 裁剪态：选区两端的时刻（`起 0:03` / `止 0:12`），只显示两端不够直观，标出来就知道剪掉了多少 */
    private val trimStartView = hostText(activity, sizeSp = 12f, color = palette.hint)
    private val trimEndView = hostText(activity, sizeSp = 12f, color = palette.hint)
    private val waveform = WaveformView(activity, palette)
    private val cancelButton = smallButton("取消")
    private val stopButton = smallButton("停止", primary = true)
    private val redoButton = smallButton("重录")
    private val playButton = smallButton("试听")
    private val useButton = smallButton("使用", primary = true)

    private val recordActions = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        addActionButton(cancelButton)
        addActionButton(stopButton)
    }
    private val reviewActions = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        addActionButton(redoButton)
        addActionButton(playButton)
        addActionButton(useButton)
    }
    private val card = LinearLayout(activity)
    /** 裁剪态的起止时刻行（buildCard 里建好，updateTrimLabels 更新） */
    private var trimLabelsView: LinearLayout? = null

    private var phase = Phase.RECORDING
    private var recordedFile: File? = null
    private var durationMs = 0L
    private var startedAt = 0L
    private var startRatio = 0.0
    private var endRatio = 1.0
    private var closed = false

    /** 全程振幅样本（每 60ms 一根）：实时波形取尾巴，裁剪界面下采样整段 */
    private val levels = ArrayList<Int>(4096)

    private var player: MediaPlayer? = null
    private var previewing = false

    private val tickRunnable = object : Runnable {
        override fun run() {
            if (phase != Phase.RECORDING) {
                return
            }
            levels.add(VoiceRecorderPolicy.amplitudeToLevel(recorder.amplitude()))
            val elapsed = SystemClock.elapsedRealtime() - startedAt
            timerView.text = VoiceRecorderPolicy.clockOf(elapsed)
            waveform.setLive(levels)
            if (elapsed >= maxRecordMs) {
                // 到顶自动停（站点那侧也是硬上限，别让用户白录一段发不出去的）
                stopRecording()
                return
            }
            handler.postDelayed(this, TICK_MS)
        }
    }

    private val playTickRunnable = object : Runnable {
        override fun run() {
            val media = player ?: return
            if (!previewing) {
                return
            }
            val position = runCatching { media.currentPosition }.getOrDefault(0)
            waveform.setPlayRatio(if (durationMs > 0) position.toFloat() / durationMs else -1f)
            if (position >= currentRange().endMs) {
                pausePreview(reset = true)
                return
            }
            handler.postDelayed(this, PLAY_TICK_MS)
        }
    }

    // ---------------------------------------------------------------- 对外

    fun show() {
        if (activity.isFinishing || activity.isDestroyed) {
            onCancelled()
            return
        }
        buildCard()
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.setContentView(card)
        dialog.setCanceledOnTouchOutside(false)
        // 返回键 = 取消（录制中被系统弹窗抢焦点也走这条，绝不静默丢录音）
        dialog.setOnCancelListener { cancel() }
        dialog.window?.let { window ->
            window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            val attrs = window.attributes
            attrs.gravity = Gravity.CENTER
            attrs.dimAmount = 0.45f
            window.attributes = attrs
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            // 录音时别让屏幕黑掉（没有前台服务，屏幕灭了就真的在后台录了）
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            window.setLayout(cardWidth(), ViewGroup.LayoutParams.WRAP_CONTENT)
        }
        // 弹入动画：从下方 26dp 处淡入 + 轻微缩放 —— 苹果那套小窗的手感
        card.alpha = 0f
        card.translationY = dp(activity, 26).toFloat()
        card.scaleX = 0.94f
        card.scaleY = 0.94f
        dialog.show()
        card.animate()
            .alpha(1f)
            .translationY(0f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(260L)
            .setInterpolator(DecelerateInterpolator())
            .start()
        startRecording()
    }

    /** App 被切到后台：停录 + 取消（不申请前台服务，后台录音不该发生）。 */
    fun onHostPause() {
        if (closed) {
            return
        }
        Log.i(TAG, "宿主进入后台，取消录音")
        cancel()
    }

    /** Activity 销毁兜底：只释放资源，不再回调。 */
    fun shutdown() {
        closed = true
        handler.removeCallbacks(tickRunnable)
        handler.removeCallbacks(playTickRunnable)
        // cancel() 现在自己完成 stop → reset → release；这里不要再拆成两步，
        // 否则任何一个中间态都可能把“持有 MIC 的 MediaRecorder”留到下次录音。
        recorder.cancel()
        releasePlayer()
        if (dialog.isShowing) {
            runCatching { dialog.dismiss() }
        }
    }

    // ---------------------------------------------------------------- 布局

    private fun buildCard() {
        wireActions()
        card.orientation = LinearLayout.VERTICAL
        card.setPadding(dp(activity, 18), dp(activity, 16), dp(activity, 18), dp(activity, 16))
        card.background = rounded(activity, palette.surface, 18)

        val header = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(titleView)
            addView(View(activity), LinearLayout.LayoutParams(0, 0, 1f))
            addView(timerView)
        }
        // ⚠️ 行容器**必须**给 MATCH_PARENT：里面的按钮是「width=0 + weight=1」，
        // 父容器若按 WRAP_CONTENT 量（addView 不给 LayoutParams 的默认值），加权子项只能分到 0 宽
        // —— 按钮就变成看不见、也点不到（真机上就是"取消/停止点了没反应"，见 P-189）。
        card.addView(
            header,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ),
        )

        waveform.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(activity, 72),
        ).apply { topMargin = dp(activity, 12) }
        waveform.onTrimChanged = { start, end ->
            startRatio = start
            endRatio = end
            updateTimer()
            updateTrimLabels()
            // 试听中拖手柄 = 按新起点重新定位：拖到哪就听到哪（不然听着的还是老选区）
            if (previewing) {
                runCatching { player?.seekTo(currentRange().startMs.toInt()) }
            }
        }
        // 点选区里的任意位置 = 从那儿试听（裁剪时最常用的动作）
        waveform.onSeekRequest = { ratio -> previewFrom(ratio) }
        card.addView(waveform)

        val trimLabels = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(trimStartView)
            addView(View(activity), LinearLayout.LayoutParams(0, 0, 1f))
            addView(trimEndView)
            visibility = View.GONE
        }
        card.addView(
            trimLabels,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(activity, 6) },
        )
        trimLabelsView = trimLabels

        hintView.setPadding(0, dp(activity, 10), 0, dp(activity, 14))
        card.addView(hintView)

        noteActions(recordActions)
        noteActions(reviewActions)
        card.addView(recordActions)
        card.addView(reviewActions)
        updateUi()
    }

    /** 把动作行按"占满一行"加进卡片 —— 与上面 header 同一个理由（否则按钮 0 宽）。 */
    private fun noteActions(row: LinearLayout) {
        row.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        )
    }

    /** 往动作行里塞一个等宽按钮：`width=0 + weight=1` 平分整行，非首个留 8dp 间距。 */
    private fun LinearLayout.addActionButton(button: Button) {
        addView(
            button,
            LinearLayout.LayoutParams(0, dp(activity, 44), 1f).apply {
                if (childCount > 0) {
                    marginStart = dp(activity, 8)
                }
            },
        )
    }

    /**
     * 按钮接线 —— **这是真机上"取消/停止点了没反应"的根因**（P-189）。
     *
     * 光把按钮画出来是不够的：`Button` 不会自己找活干，没有 `setOnClickListener` 就是一排好看的摆设。
     * 改这个界面时，新增按钮必须在这里挂上，或者干脆在 `smallButton()` 里强制要求传回调。
     */
    private fun wireActions() {
        cancelButton.setOnClickListener { cancel() }
        stopButton.setOnClickListener { stopRecording() }
        redoButton.setOnClickListener {
            // 重录：先把试听停掉、把旧的 MediaPlayer 放掉（录音文件马上会被 clearOutputDir 删掉）
            pausePreview(reset = true)
            releasePlayer()
            startRecording()
        }
        playButton.setOnClickListener { togglePreview() }
        useButton.setOnClickListener { confirm() }
    }

    private fun smallButton(label: String, primary: Boolean = false): Button =
        Button(activity).apply {
            text = label
            isAllCaps = false
            setTextColor(if (primary) palette.onPrimary else palette.title)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            background = if (primary) {
                rounded(activity, palette.primary, 12)
            } else {
                rounded(activity, tint(palette.primary, 0.10f), 12)
            }
            // 尺寸交给 addActionButton 给（这里定 LP 会在"尚不知父容器多宽"时写死 0 宽）
        }

    private fun cardWidth(): Int {
        val screen = activity.resources.displayMetrics.widthPixels
        return min(screen - dp(activity, 32), dp(activity, CARD_MAX_DP))
    }

    // ---------------------------------------------------------------- 录制

    private fun startRecording() {
        // 上一次留下的产物只活到交付为止：新会话开始先清干净（与相册/视频压缩同一时机）
        AudioRecorder.clearOutputDir(activity)
        levels.clear()
        val file = recorder.start()
        if (file == null) {
            toast("录音启动失败：检查麦克风权限后重试")
            cancel()
            return
        }
        phase = Phase.RECORDING
        startedAt = SystemClock.elapsedRealtime()
        updateUi()
        handler.postDelayed(tickRunnable, TICK_MS)
    }

    private fun stopRecording() {
        handler.removeCallbacks(tickRunnable)
        val file = recorder.stop()
        if (file == null) {
            toast("没有录到声音，再试一次")
            // 没数据就当这次作废，回录制态
            startRecording()
            return
        }
        recordedFile = file
        durationMs = max(1L, SystemClock.elapsedRealtime() - startedAt)
        phase = Phase.REVIEW
        startRatio = 0.0
        endRatio = 1.0
        releasePlayer()
        waveform.setReview(VoiceRecorderPolicy.downSample(levels, VoiceRecorderPolicy.REVIEW_BARS))
        waveform.setHandles(startRatio, endRatio)
        waveform.animateReveal()
        updateUi()
    }

    private fun currentRange(): TrimRange =
        VoiceRecorderPolicy.trimRange(startRatio, endRatio, durationMs)

    private fun updateUi() {
        recordActions.visibility = if (phase == Phase.RECORDING) View.VISIBLE else View.GONE
        reviewActions.visibility = if (phase == Phase.RECORDING) View.GONE else View.VISIBLE
        trimLabelsView?.visibility = if (phase == Phase.REVIEW) View.VISIBLE else View.GONE
        when (phase) {
            Phase.RECORDING -> {
                titleView.text = "录音"
                hintView.text = "最长 ${VoiceRecorderPolicy.clockOf(maxRecordMs)} · 说完了点「停止」"
                waveform.reviewMode = false
                stopButton.isEnabled = true
                waveform.layoutParams = waveform.layoutParams.apply { height = dp(activity, 72) }
            }
            Phase.REVIEW -> {
                titleView.text = "剪一段"
                hintView.text = "拖动两端截取 · 点波形任意位置试听 · 满意再点「使用」"
                waveform.reviewMode = true
                redoButton.isEnabled = true
                playButton.isEnabled = true
                useButton.isEnabled = true
                waveform.layoutParams = waveform.layoutParams.apply { height = dp(activity, 96) }
            }
            Phase.PROCESSING -> {
                titleView.text = "处理中"
                hintView.text = "正在裁剪…"
                redoButton.isEnabled = false
                playButton.isEnabled = false
                useButton.isEnabled = false
            }
        }
        waveform.requestLayout()
        waveform.invalidate()
        updateTimer()
        updateTrimLabels()
    }

    /** 裁剪态两端时刻：`起 0:03` / `止 0:12`（搭配顶部的「已选 0:09 / 0:15」一起看） */
    private fun updateTrimLabels() {
        val range = currentRange()
        trimStartView.text = "起 ${VoiceRecorderPolicy.clockOf(range.startMs)}"
        trimEndView.text = "止 ${VoiceRecorderPolicy.clockOf(range.endMs)}"
    }

    private fun updateTimer() {
        timerView.text = when (phase) {
            Phase.RECORDING -> VoiceRecorderPolicy.clockOf(SystemClock.elapsedRealtime() - startedAt)
            Phase.REVIEW, Phase.PROCESSING ->
                "${VoiceRecorderPolicy.clockOf(currentRange().durationMs)} / " +
                    VoiceRecorderPolicy.clockOf(durationMs)
        }
    }

    private fun confirm() {
        val file = recordedFile ?: return
        val range = currentRange()
        if (VoiceRecorderPolicy.isFullRange(range, durationMs)) {
            // 整段没动：直接把原文件交出去（不重封装、无二次损失）
            finishWith(file)
            return
        }
        phase = Phase.PROCESSING
        updateUi()
        pausePreview(reset = true)
        val output = File(
            AudioRecorder.outputDir(activity),
            "voice-${System.currentTimeMillis()}-trim.m4a",
        )
        val trimmed = AudioTrimmer.trim(file, range, output)
        if (trimmed == null) {
            // 裁剪失败不装作没事：整段交出去，并说清楚
            toast("裁剪没成功，已按整段上传")
            finishWith(file)
            return
        }
        finishWith(trimmed)
    }

    private fun finishWith(file: File) {
        if (closed) {
            return
        }
        closed = true
        handler.removeCallbacks(tickRunnable)
        releasePlayer()
        recorder.release()
        runCatching { dialog.dismiss() }
        onFinished(file)
    }

    private fun cancel() {
        if (closed) {
            return
        }
        closed = true
        handler.removeCallbacks(tickRunnable)
        releasePlayer()
        recorder.cancel()
        if (dialog.isShowing) {
            runCatching { dialog.dismiss() }
        }
        onCancelled()
    }

    // ---------------------------------------------------------------- 试听

    private fun ensurePlayer(file: File): MediaPlayer? {
        player?.let { return it }
        return try {
            val media = MediaPlayer()
            media.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            media.setDataSource(file.absolutePath)
            media.prepare()
            player = media
            media
        } catch (error: Exception) {
            Log.w(TAG, "试听打不开录音文件", error)
            toast("这段录音暂时放不了，可以直接点「使用」")
            null
        }
    }

    private fun togglePreview() {
        if (previewing) {
            pausePreview(reset = false)
            return
        }
        val file = recordedFile ?: return
        val media = ensurePlayer(file) ?: return
        val range = currentRange()
        runCatching {
            media.seekTo(range.startMs.toInt())
            media.start()
            previewing = true
            playButton.text = "暂停"
            handler.post(playTickRunnable)
        }.onFailure {
            Log.w(TAG, "试听失败", it)
            toast("试听失败，可以直接点「使用」")
        }
    }

    private fun pausePreview(reset: Boolean) {
        previewing = false
        playButton.text = "试听"
        runCatching { player?.pause() }
        if (reset) {
            waveform.setPlayRatio(-1f)
        }
        handler.removeCallbacks(playTickRunnable)
    }

    /**
     * 从波形的某个位置开始试听（拖动裁剪的另一半体验：想听哪儿点哪儿）。
     *
     * 点选区**外面**不会走到这里 —— `WaveformView` 自己就忽略了，免得听着听着跑出选区。
     */
    private fun previewFrom(ratio: Double) {
        val file = recordedFile ?: return
        val media = ensurePlayer(file) ?: return
        val range = currentRange()
        if (range.endMs - range.startMs <= 0) {
            return
        }
        val at = (durationMs * ratio.coerceIn(0.0, 1.0))
            .toLong()
            .coerceIn(range.startMs, max(range.startMs, range.endMs - 1))
        runCatching {
            media.seekTo(at.toInt())
            if (!previewing) {
                media.start()
                previewing = true
                playButton.text = "暂停"
                handler.post(playTickRunnable)
            }
        }.onFailure {
            Log.w(TAG, "试听失败", it)
            toast("试听失败，可以直接点「使用」")
        }
    }

    private fun releasePlayer() {
        handler.removeCallbacks(playTickRunnable)
        previewing = false
        player?.let { media ->
            runCatching { if (media.isPlaying) media.stop() }
            runCatching { media.release() }
        }
        player = null
    }

    private fun toast(message: String) {
        runCatching {
            Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
        }
    }

    // ---------------------------------------------------------------- 波形

    /**
     * 条状波形（自绘）：
     *  - 录制态：只画最近 [VoiceRecorderPolicy.LIVE_SLOTS] 根，新的一根从右边追加；满了之后整条向左滚；
     *  - 裁剪态：画整段 + 两个可拖的端点 + 选区外压暗 + 试听游标。
     */
    private class WaveformView(context: Context, private val palette: Palette) : View(context) {

        private var bars: List<Int> = emptyList()
        private var playRatio = -1f
        private var dragging: Int? = null

        /** 裁剪态开关：false = 实时波形（不可拖） */
        var reviewMode = false
            set(value) {
                field = value
                invalidate()
            }

        /** 入场进度（0–1）：波形逐根长出来的动画 */
        private var reveal = 1f

        var onTrimChanged: ((Double, Double) -> Unit)? = null

        /** 点选区内部 = 从这里试听（手柄以外的位置） */
        var onSeekRequest: ((Double) -> Unit)? = null

        /** 离手柄多近算"要拖它"（再远就当成"点这里试听"） */
        private val handleSlop = dp(context, 22).toFloat()

        private var startRatio = 0.0
        private var endRatio = 1.0

        private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeCap = Paint.Cap.ROUND }
        private val dimPaint = Paint().apply { color = tint(palette.title, 0.18f) }
        private val handlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.primary
            strokeWidth = dp(context, 2).toFloat()
            strokeCap = Paint.Cap.ROUND
        }
        private val cursorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.primary
            strokeWidth = dp(context, 2).toFloat()
        }

        fun setLive(levels: List<Int>) {
            // 只留最近 10 秒（100 格 × 100ms）；绘制时按固定槽位算宽度，所以会自然往左滚
            bars = levels.takeLast(VoiceRecorderPolicy.LIVE_SLOTS)
            reveal = 1f
            if (reviewMode) {
                reviewMode = false
            }
            invalidate()
        }

        fun setReview(levels: List<Int>) {
            bars = levels
            reviewMode = true
            playRatio = -1f
            invalidate()
        }

        fun setHandles(start: Double, end: Double) {
            startRatio = start
            endRatio = end
            invalidate()
        }

        fun setPlayRatio(ratio: Float) {
            playRatio = ratio
            invalidate()
        }

        /** 剪完/录完之后让波形"长出来"（入场动画的一部分） */
        fun animateReveal() {
            reveal = 0f
            invalidate()
            ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 320L
                interpolator = DecelerateInterpolator()
                addUpdateListener { animator ->
                    reveal = animator.animatedValue as Float
                    invalidate()
                }
                start()
            }
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val span = (width - paddingLeft - paddingRight).toFloat()
            if (span <= 0f || bars.isEmpty()) {
                return
            }
            val centerY = height / 2f
            val maxHalf = max(dp(context, 2).toFloat(), (height - dp(context, 10)) / 2f)
            // 录制态：**固定 10 秒的槽位宽度**（一格 = SAMPLE_MS），前 10 秒只填左边那几个槽、
            // 之后整条往左滚 —— 屏幕上永远是"过去 10 秒"，而且格子不会越录越细（用户口径）。
            // 裁剪态：整段录制铺满整条（这才是"显示全部"），所以按实际根数分。
            val slots = if (reviewMode) bars.size else VoiceRecorderPolicy.LIVE_SLOTS
            val step = span / slots.coerceAtLeast(1)
            barPaint.strokeWidth = (step * 0.55f)
                .coerceIn(dp(context, 1).toFloat(), dp(context, 4).toFloat())

            val startX = paddingLeft + span * startRatio.toFloat()
            val endX = paddingLeft + span * endRatio.toFloat()
            val playX = if (playRatio >= 0f) paddingLeft + span * playRatio.coerceIn(0f, 1f) else -1f

            bars.forEachIndexed { index, level ->
                if ((index + 1f) / bars.size > reveal) {
                    return@forEachIndexed
                }
                // 槽位：窗口没满时从最左边开始向右长；满了之后整条向左滚一格。
                // 算式在 VoiceRecorderPolicy.liveSlot 里，配单测。
                val slot = if (reviewMode) index else VoiceRecorderPolicy.liveSlot(index)
                val x = paddingLeft + step * (slot + 0.5f)
                val half = max(dp(context, 1).toFloat(), maxHalf * (level / 100f))
                val inside = x >= startX && x <= endX
                val played = playX < 0f || x <= playX
                barPaint.color = when {
                    !reviewMode && !played -> tint(palette.primary, 0.35f)
                    !reviewMode -> palette.primary
                    !inside -> tint(palette.title, 0.16f)
                    played -> palette.primary
                    else -> tint(palette.primary, 0.72f)
                }
                canvas.drawLine(x, centerY - half, x, centerY + half, barPaint)
            }

            if (reviewMode) {
                // 选区外压暗，选区一眼可见
                if (startX > paddingLeft) {
                    canvas.drawRect(paddingLeft.toFloat(), 0f, startX, height.toFloat(), dimPaint)
                }
                if (endX < paddingLeft + span) {
                    canvas.drawRect(endX, 0f, paddingLeft + span, height.toFloat(), dimPaint)
                }
                val handleTop = dp(context, 4).toFloat()
                val handleBottom = height - dp(context, 4).toFloat()
                canvas.drawLine(startX, handleTop, startX, handleBottom, handlePaint)
                canvas.drawLine(endX, handleTop, endX, handleBottom, handlePaint)
                canvas.drawCircle(startX, handleTop, dp(context, 6).toFloat(), handlePaint)
                canvas.drawCircle(endX, handleTop, dp(context, 6).toFloat(), handlePaint)
            }
        }

        override fun onTouchEvent(event: MotionEvent): Boolean {
            if (!reviewMode || bars.isEmpty()) {
                return false
            }
            val span = (width - paddingLeft - paddingRight).toFloat()
            if (span <= 0f) {
                return false
            }
            val ratio = ((event.x - paddingLeft) / span).coerceIn(0f, 1f).toDouble()
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    val startX = paddingLeft + span * startRatio.toFloat()
                    val endX = paddingLeft + span * endRatio.toFloat()
                    val nearStart = abs(event.x - startX) <= handleSlop
                    val nearEnd = abs(event.x - endX) <= handleSlop
                    val inside = event.x >= startX && event.x <= endX
                    if (inside && !nearStart && !nearEnd) {
                        // 点的是选区内部（离两端都远）：从这儿试听，不算拖拽
                        dragging = null
                        onSeekRequest?.invoke(ratio)
                        return true
                    }
                    dragging = if (abs(event.x - startX) <= abs(event.x - endX)) 0 else 1
                    parent?.requestDisallowInterceptTouchEvent(true)
                    applyDrag(ratio)
                }
                MotionEvent.ACTION_MOVE -> {
                    if (dragging == null) {
                        return false
                    }
                    applyDrag(ratio)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    dragging = null
                    parent?.requestDisallowInterceptTouchEvent(false)
                }
                else -> return false
            }
            return true
        }

        private fun destroyDrawingCacheSafely(): Boolean = bars.isEmpty()

        private fun applyDrag(ratio: Double) {
            if (dragging == 0) {
                startRatio = min(ratio, endRatio)
            } else {
                endRatio = max(ratio, startRatio)
            }
            invalidate()
            onTrimChanged?.invoke(startRatio, endRatio)
        }
    }
}
