package com.smartblog.app

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * 图片编辑器（自绘，不引依赖）：涂鸦 / 马赛克（像素 + 模糊）/ 裁剪 / 旋转 + 撤销重做。
 *
 * 状态机很简单：
 *  - 时间线在 `PhotoEditState` 里（纯逻辑，有单测）；
 *  - `rendered` 是"当前这张图"（= 源图经过结构变换 + 所有已提交操作），所有手势都作用在它上面；
 *  - 涂鸦 / 马赛克在**落笔时就画进 `rendered`**（肉眼零延迟），同时把操作记进时间线；
 *    撤销 / 旋转 / 裁剪才触发整张重渲染（`PhotoEditRenderer`，后台线程）。
 *
 * 「没有编辑点完成」= 不落文件、不重编码（`onSaved(null)`），原图一个字节都不动。
 */
internal class PhotoEditorView(
    private val host: Activity,
    private val sourceUri: Uri,
    private val palette: Palette,
    private val onCancel: () -> Unit,
    private val onSaved: (File?) -> Unit,
) : FrameLayout(host) {

    private enum class Tool(val label: String) {
        DOODLE("涂鸦"), MOSAIC("马赛克"), CROP("裁剪"), ROTATE("旋转"),
    }

    private companion object {
        const val TOP_BAR_DP = 52
        const val TOOL_BAR_DP = 56
        const val MIN_CROP_DP = 64
        const val HANDLE_TOUCH_DP = 30
        val CROP_RATIOS = listOf(
            "自由" to 0f,
            "1:1" to 1f,
            "4:3" to 4f / 3f,
            "16:9" to 16f / 9f,
        )
    }

    // ⚠️ 不叫 background / foreground：那两个名字与 View.getBackground()/getForeground() 撞，
    // Kotlin 会把引用解析成 Drawable，`setTextColor(foreground)` 直接编译不过（踩过一次）。
    private val bgColor = Color.parseColor("#FF111111")
    private val fgColor = Color.parseColor("#FFF4F5F7")
    private val muted = Color.parseColor("#FF9AA0A6")
    private val accent = palette.primary

    private val executor = Executors.newSingleThreadExecutor { Thread(it, "smartblog-edit") }

    private var source: Bitmap? = null
    private var rendered: Bitmap? = null
    private var state: PhotoEditState? = null
    private var busy = false
    private var destroying = false
    private var renderAgain = false
    private var pendingAction: (() -> Unit)? = null

    private var tool = Tool.DOODLE
    private var toolBeforeCrop = Tool.DOODLE
    private var doodleColor = EditBrush.PALETTE.first()
    private var doodleWidth = EditBrush.DOODLE_DEFAULT
    private var mosaicKind = MosaicKind.PIXEL
    private var mosaicWidth = EditBrush.MOSAIC_DEFAULT

    private val surface = EditSurfaceView(host)
    private val topBar = LinearLayout(host)
    private val secondaryBar = LinearLayout(host)
    private val toolBar = LinearLayout(host)
    private val busyLabel = TextView(host)
    private val undoButton = textButton("撤销") { undo() }
    private val redoButton = textButton("重做") { redo() }

    init {
        setBackgroundColor(bgColor)
        buildTopBar()
        buildToolBar()

        val column = LinearLayout(host).apply {
            orientation = LinearLayout.VERTICAL
            addView(
                topBar,
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(TOP_BAR_DP)),
            )
            addView(
                surface,
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f),
            )
            addView(
                secondaryBar,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ),
            )
            addView(
                toolBar,
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(TOOL_BAR_DP)),
            )
        }
        addView(
            column,
            LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )

        busyLabel.apply {
            text = "加载中…"
            setTextColor(fgColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(dp(18), dp(10), dp(18), dp(10))
            background = rounded(host, Color.parseColor("#CC1F2329"), 10)
        }
        addView(
            busyLabel,
            LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { gravity = Gravity.CENTER },
        )
        rebuildSecondaryBar()
        loadSource()
    }

    // ---------------------------------------------------------------- 加载 / 渲染

    private fun loadSource() {
        setBusy(true)
        executor.execute {
            val decoded = PhotoFiles.decode(host, sourceUri, PhotoFiles.EDIT_MAX_DIMENSION)
            host.runOnUiThread {
                if (destroying) {
                    decoded?.recycle()
                    return@runOnUiThread
                }
                if (decoded == null) {
                    toast("图片读不出来")
                    onCancel()
                    return@runOnUiThread
                }
                source = decoded
                state = PhotoEditState(decoded.width.toFloat() / decoded.height.toFloat())
                requestRender()
            }
        }
    }

    /**
     * 整张重渲染（旋转 / 裁剪 / 撤销 / 重做之后）。
     * 渲染中再来的请求只置 [renderAgain]，不并发跑两份。
     */
    private fun requestRender(action: (() -> Unit)? = null) {
        action?.let { pendingAction = it }
        val src = source ?: return
        val current = state ?: return
        if (busy) {
            renderAgain = true
            return
        }
        busy = true
        setBusy(true)
        executor.execute {
            val result = runCatching { PhotoEditRenderer.render(src, current) }.getOrNull()
            host.runOnUiThread {
                if (destroying) {
                    result?.recycle()
                    return@runOnUiThread
                }
                if (result != null) {
                    rendered?.recycle()
                    rendered = result
                    surface.onBitmapChanged()
                    surface.invalidate()
                } else {
                    toast("处理失败，请重试")
                }
                busy = false
                setBusy(false)
                updateHistoryButtons()
                when {
                    renderAgain -> {
                        renderAgain = false
                        requestRender()
                    }

                    else -> {
                        val next = pendingAction
                        pendingAction = null
                        next?.invoke()
                    }
                }
            }
        }
    }

    private fun setBusy(value: Boolean) {
        busyLabel.visibility = if (value) VISIBLE else GONE
        busyLabel.text = if (source == null) "加载中…" else "处理中…"
    }

    private fun updateHistoryButtons() {
        val current = state
        undoButton.alpha = if (current?.canUndo() == true) 1f else 0.35f
        redoButton.alpha = if (current?.canRedo() == true) 1f else 0.35f
    }

    // ---------------------------------------------------------------- 顶栏 / 工具栏

    private fun buildTopBar() {
        topBar.apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), 0, dp(8), 0)
        }
        topBar.addView(textButton("取消") { cancel() })
        topBar.addView(View(host), LinearLayout.LayoutParams(0, 1, 1f))
        topBar.addView(undoButton)
        topBar.addView(redoButton)
        topBar.addView(View(host), LinearLayout.LayoutParams(0, 1, 1f))
        topBar.addView(textButton("完成", bold = true, color = accent) { finishEditing() })
        updateHistoryButtons()
    }

    private fun buildToolBar() {
        toolBar.apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#FF1A1A1A"))
        }
        Tool.entries.forEach { entry ->
            val button = TextView(host).apply {
                text = entry.label
                gravity = Gravity.CENTER
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
                setTextColor(if (entry == tool) fgColor else muted)
                setOnClickListener { selectTool(entry) }
            }
            toolBar.addView(button, LinearLayout.LayoutParams(0, dp(TOOL_BAR_DP), 1f))
        }
        refreshToolBar()
    }

    private fun refreshToolBar() {
        for (index in 0 until toolBar.childCount) {
            val button = toolBar.getChildAt(index) as TextView
            val active = Tool.entries[index] == tool
            button.setTextColor(if (active) accent else muted)
            button.typeface = if (active) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        }
    }

    private fun selectTool(next: Tool) {
        if (next == tool) return
        if (tool == Tool.CROP) commitCropIfPending()
        val previous = tool
        tool = next
        if (next == Tool.CROP) {
            toolBeforeCrop = previous
            surface.beginCrop()
        } else {
            surface.endCrop()
        }
        rebuildSecondaryBar()
        refreshToolBar()
        surface.invalidate()
    }

    /** 二级栏内容跟着工具走（颜色 / 马赛克种类 / 裁剪比例 / 旋转按钮）。 */
    private fun rebuildSecondaryBar() {
        secondaryBar.removeAllViews()
        secondaryBar.apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#FF1A1A1A"))
            setPadding(dp(12), dp(8), dp(12), dp(8))
        }
        when (tool) {
            Tool.DOODLE -> {
                secondaryBar.addView(colorRow())
                secondaryBar.addView(widthSlider(EditBrush.DOODLE_MIN, EditBrush.DOODLE_MAX) { doodleWidth = it })
            }

            Tool.MOSAIC -> {
                secondaryBar.addView(
                    chipRow(
                        "马赛克" to (mosaicKind == MosaicKind.PIXEL),
                        "模糊" to (mosaicKind == MosaicKind.BLUR),
                    ) { index ->
                        mosaicKind = if (index == 0) MosaicKind.PIXEL else MosaicKind.BLUR
                        // ⚠️ 必须重建：chipRow 的选中态（文字色 / 背景）是**构建期**写进去的，
                        // 不重建就会"点了「模糊」但高亮还停在「马赛克」"（用户报的那个 bug，见 P-186）。
                        // 重建不会丢笔宽：滑杆初值取自 currentBrushWidth() → mosaicWidth 本身没变。
                        rebuildSecondaryBar()
                    },
                )
                secondaryBar.addView(widthSlider(EditBrush.MOSAIC_MIN, EditBrush.MOSAIC_MAX) { mosaicWidth = it })
            }

            Tool.CROP -> {
                secondaryBar.addView(
                    chipRow(
                        *CROP_RATIOS.map { (label, ratio) -> label to (surface.cropAspect == ratio) }
                            .toTypedArray(),
                    ) { index -> surface.setCropAspect(CROP_RATIOS[index].second) },
                )
                secondaryBar.addView(
                    chipRow("取消裁剪" to false, "确定裁剪" to true) { index ->
                        if (index == 0) surface.cancelCrop() else surface.applyCrop()
                    },
                )
            }

            Tool.ROTATE -> {
                secondaryBar.addView(
                    chipRow("向左旋转 90°" to false, "向右旋转 90°" to false) { index ->
                        rotate(if (index == 0) -1 else 1)
                    },
                )
            }
        }
    }

    private fun colorRow(): View {
        val row = LinearLayout(host).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        EditBrush.PALETTE.forEach { color ->
            val dot = View(host).apply {
                background = rounded(host, color, 14, strokeColor = Color.parseColor("#66FFFFFF"), strokeDp = 1)
                setOnClickListener {
                    doodleColor = color
                    rebuildSecondaryBar()
                }
            }
            val size = if (color == doodleColor) dp(30) else dp(26)
            row.addView(
                dot,
                LinearLayout.LayoutParams(size, size).apply { rightMargin = dp(10) },
            )
        }
        row.addView(View(host), LinearLayout.LayoutParams(0, 1, 1f))
        return row
    }

    private fun widthSlider(min: Float, max: Float, onChanged: (Float) -> Unit): View {
        val slider = SeekBar(host).apply {
            this.max = 100
            progress = (((currentBrushWidth(min, max) - min) / (max - min)) * 100f)
                .toInt().coerceIn(0, 100)
            progressTintList = ColorStateList.valueOf(accent)
            thumbTintList = ColorStateList.valueOf(accent)
            setOnSeekBarChangeListener(
                object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(seekBar: SeekBar?, value: Int, fromUser: Boolean) {
                        onChanged(min + (max - min) * value / 100f)
                    }

                    override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit

                    override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
                },
            )
        }
        return slider
    }

    /** 当前工具的笔宽（滑杆初始值用）。 */
    private fun currentBrushWidth(min: Float, max: Float): Float =
        (if (tool == Tool.DOODLE) doodleWidth else mosaicWidth).coerceIn(min, max)

    /**
     * 一排「胶囊」按钮（`label to 是否选中`）。
     *
     * ⚠️ **选中态是构建期写进去的**（文字色 + 背景 + 底色），所以任何会改变"哪一项选中"的 `onClick`
     * 都必须自己调一次 [rebuildSecondaryBar]；漏了的表现就是「点了另一个选项，高亮不动」
     * （马赛克那行漏过一次，见 docs/pitfalls.md P-186）。纯触发型按钮（旋转 / 取消裁剪 / 确定裁剪）
     * 不受这条约束。
     */
    private fun chipRow(vararg chips: Pair<String, Boolean>, onClick: (Int) -> Unit): View {
        val row = LinearLayout(host).apply { orientation = LinearLayout.HORIZONTAL }
        chips.forEachIndexed { index, (label, selected) ->
            val chip = TextView(host).apply {
                text = label
                gravity = Gravity.CENTER
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                setTextColor(if (selected) accent else fgColor)
                setPadding(dp(14), dp(7), dp(14), dp(7))
                background = rounded(
                    host,
                    if (selected) tint(accent, 0.18f) else Color.parseColor("#22FFFFFF"),
                    9,
                )
                setOnClickListener { onClick(index) }
            }
            row.addView(
                chip,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { rightMargin = dp(8) },
            )
        }
        row.addView(View(host), LinearLayout.LayoutParams(0, 1, 1f))
        return row
    }

    private fun textButton(
        label: String,
        bold: Boolean = false,
        color: Int = fgColor,
        onClick: () -> Unit,
    ): TextView = TextView(host).apply {
        text = label
        gravity = Gravity.CENTER
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
        setPadding(dp(14), dp(12), dp(14), dp(12))
        setOnClickListener { onClick() }
    }

    // ---------------------------------------------------------------- 操作

    private fun rotate(delta: Int) {
        state?.add(EditOp.Rotate(delta))
        requestRender()
    }

    private fun undo() {
        if (tool == Tool.CROP && surface.cropDirty) {
            surface.cancelCrop()
            return
        }
        if (state?.undo() == true) requestRender()
    }

    private fun redo() {
        if (state?.redo() == true) requestRender()
    }

    /** 切走工具 / 点完成时，未确认的裁剪自动生效（不丢用户操作）。 */
    private fun commitCropIfPending() {
        if (tool != Tool.CROP || !surface.cropDirty) return
        surface.applyCrop()
    }

    private fun cancel() {
        onCancel()
    }

    private fun finishEditing() {
        if (tool == Tool.CROP) commitCropIfPending()
        val current = state ?: return
        if (!current.isDirty()) {
            // 没编辑 = 不重编码，直接把原图交回去
            onSaved(null)
            return
        }
        requestRender { save() }
    }

    private fun save() {
        val bitmap = rendered ?: return
        setBusy(true)
        busy = true
        executor.execute {
            val file = PhotoFiles.saveEdited(host, bitmap)
            host.runOnUiThread {
                busy = false
                setBusy(false)
                if (file != null) {
                    onSaved(file)
                } else {
                    toast("保存失败，请重试")
                }
            }
        }
    }

    /** 返回键：裁剪框还没确认 → 先取消裁剪；否则交给调用方（丢弃编辑器回预览）。 */
    fun handleBack(): Boolean {
        if (tool == Tool.CROP && surface.cropDirty) {
            surface.cancelCrop()
            return true
        }
        return false
    }

    private fun toast(message: String) {
        Toast.makeText(host, message, Toast.LENGTH_SHORT).show()
    }

    private fun dp(value: Int): Int = dp(host, value)

    // ---------------------------------------------------------------- 画布

    private inner class EditSurfaceView(context: Context) : View(context) {

        private val bitmapMatrix = Matrix()
        private val inverseMatrix = Matrix()
        private var matrixBitmap: Bitmap? = null
        private var matrixReady = false
        private var viewScale = 1f

        private val livePoints = mutableListOf<EditPoint>()
        private var lastViewX = 0f
        private var lastViewY = 0f
        private var dragging = false

        private var mosaicReference: Bitmap? = null
        private var mosaicStamper: PhotoEditRenderer.MosaicStamper? = null
        private var mosaicCanvas: Canvas? = null
        private var activeHandle = -1
        private var downX = 0f
        private var downY = 0f

        var cropRect = RectF()
            private set
        var cropAspect = 0f
            private set
        var cropDirty = false
            private set
        private var cropActive = false

        fun onBitmapChanged() {
            matrixReady = false
            cropActive = false
            invalidate()
        }

        override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
            matrixReady = false
            invalidate()
        }

        private fun ensureMatrix(): Boolean {
            val bitmap = rendered ?: return false
            if (matrixReady && matrixBitmap === bitmap) return true
            if (width <= 0 || height <= 0) return false
            val scale = min(width.toFloat() / bitmap.width, height.toFloat() / bitmap.height)
            val dx = (width - bitmap.width * scale) / 2f
            val dy = (height - bitmap.height * scale) / 2f
            bitmapMatrix.reset()
            bitmapMatrix.postScale(scale, scale)
            bitmapMatrix.postTranslate(dx, dy)
            bitmapMatrix.invert(inverseMatrix)
            matrixBitmap = bitmap
            viewScale = scale
            matrixReady = true
            return true
        }

        /** 当前位图在 View 里的显示矩形（裁剪框的边界就是它）。 */
        private fun imageRect(): RectF {
            val bitmap = rendered ?: return RectF()
            if (!ensureMatrix()) return RectF()
            return RectF(0f, 0f, bitmap.width.toFloat(), bitmap.height.toFloat())
                .also { bitmapMatrix.mapRect(it) }
        }

        private fun toNormalized(x: Float, y: Float): EditPoint? {
            val bitmap = rendered ?: return null
            if (!ensureMatrix()) return null
            val point = floatArrayOf(x, y)
            inverseMatrix.mapPoints(point)
            return EditPoint(
                (point[0] / bitmap.width).coerceIn(0f, 1f),
                (point[1] / bitmap.height).coerceIn(0f, 1f),
            )
        }

        private fun toView(point: EditPoint): FloatArray {
            val bitmap = rendered ?: return floatArrayOf(0f, 0f)
            val values = floatArrayOf(point.x * bitmap.width, point.y * bitmap.height)
            bitmapMatrix.mapPoints(values)
            return values
        }

        override fun onDraw(canvas: Canvas) {
            val bitmap = rendered
            if (bitmap == null || !ensureMatrix()) return
            canvas.drawBitmap(bitmap, bitmapMatrix, null)
            when (tool) {
                Tool.CROP -> drawCropOverlay(canvas)
                Tool.DOODLE -> drawLiveDoodle(canvas)
                else -> Unit
            }
        }

        private fun drawLiveDoodle(canvas: Canvas) {
            if (livePoints.isEmpty()) return
            val viewWidth = strokeWidthPx() * viewScale
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
                color = doodleColor
                strokeWidth = viewWidth
            }
            val path = android.graphics.Path()
            val first = toView(livePoints.first())
            path.moveTo(first[0], first[1])
            if (livePoints.size > 1) {
                for (index in 1 until livePoints.size) {
                    val previous = toView(livePoints[index - 1])
                    val current = toView(livePoints[index])
                    path.quadTo(
                        previous[0],
                        previous[1],
                        (previous[0] + current[0]) / 2f,
                        (previous[1] + current[1]) / 2f,
                    )
                }
                val last = toView(livePoints.last())
                path.lineTo(last[0], last[1])
            } else {
                canvas.drawCircle(first[0], first[1], viewWidth / 2f, paint)
                return
            }
            canvas.drawPath(path, paint)
        }

        private fun strokeWidthPx(): Float {
            val bitmap = rendered ?: return 1f
            return (doodleWidth * min(bitmap.width, bitmap.height)).coerceAtLeast(1f)
        }

        private fun mosaicRadiusPx(): Float {
            val bitmap = rendered ?: return 1f
            return (mosaicWidth * min(bitmap.width, bitmap.height) / 2f).coerceAtLeast(1f)
        }

        // ------------------------------------------------------------ 触摸

        override fun onTouchEvent(event: MotionEvent): Boolean {
            if (rendered == null) return false
            return when (tool) {
                Tool.DOODLE, Tool.MOSAIC -> onPaintTouch(event)
                Tool.CROP -> onCropTouch(event)
                Tool.ROTATE -> false
            }
        }

        private fun onPaintTouch(event: MotionEvent): Boolean {
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    livePoints.clear()
                    lastViewX = event.x
                    lastViewY = event.y
                    dragging = true
                    if (tool == Tool.MOSAIC) {
                        mosaicReference?.recycle()
                        val target = rendered
                        mosaicReference = target?.let { PhotoEditRenderer.referenceFor(it, mosaicKind) }
                        mosaicStamper = mosaicReference?.let { PhotoEditRenderer.MosaicStamper(it) }
                        mosaicCanvas = target?.let { Canvas(it) }
                    }
                    appendPoint(event.x, event.y)
                    invalidate()
                    return true
                }

                MotionEvent.ACTION_MOVE -> {
                    if (!dragging) return false
                    for (index in 0 until event.historySize) {
                        appendPoint(event.getHistoricalX(index), event.getHistoricalY(index))
                    }
                    appendPoint(event.x, event.y)
                    invalidate()
                    return true
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (!dragging) return false
                    dragging = false
                    val points = livePoints.toList()
                    livePoints.clear()
                    if (points.isNotEmpty()) {
                        when (tool) {
                            // 落笔即画（零延迟），同时**必须**把这一笔记进时间线 —— 少这一行的话：
                            // 撤销回不去、裁剪/旋转重渲染会把它抹掉、"完成"还判定成"没编辑过"（踩过一次）
                            Tool.DOODLE -> {
                                rendered?.let {
                                    PhotoEditRenderer.drawDoodleStroke(it, points, doodleColor, doodleWidth)
                                }
                                state?.add(EditOp.Doodle(points, doodleColor, doodleWidth))
                            }

                            Tool.MOSAIC -> state?.add(
                                EditOp.Mosaic(mosaicKind, points, mosaicWidth),
                            )

                            else -> Unit
                        }
                    }
                    if (points.isNotEmpty()) updateHistoryButtons()
                    mosaicReference?.recycle()
                    mosaicReference = null
                    mosaicStamper = null
                    mosaicCanvas = null
                    invalidate()
                    return true
                }
            }
            return false
        }

        private fun appendPoint(viewX: Float, viewY: Float) {
            // 2dp 去重：手指不动时不要塞几百个重复点
            if (livePoints.isNotEmpty()) {
                val dx = viewX - lastViewX
                val dy = viewY - lastViewY
                if (dx * dx + dy * dy < dp(2) * dp(2)) return
            }
            val normalized = toNormalized(viewX, viewY) ?: return
            lastViewX = viewX
            lastViewY = viewY
            when (tool) {
                Tool.DOODLE -> livePoints.add(normalized)
                Tool.MOSAIC -> {
                    val bitmap = rendered ?: return
                    val stamper = mosaicStamper ?: return
                    val canvas = mosaicCanvas ?: return
                    stamper.stamp(
                        canvas,
                        normalized.x * bitmap.width,
                        normalized.y * bitmap.height,
                        mosaicRadiusPx(),
                    )
                    livePoints.add(normalized)
                }

                else -> livePoints.add(normalized)
            }
        }

        // ------------------------------------------------------------ 裁剪

        fun beginCrop() {
            cropActive = false
            cropDirty = false
            cropAspect = 0f
            cropRect = RectF()
            // 真正初始化放到 onDraw / 触摸里：那时 View 已经有尺寸、矩阵也量得出来
            rebuildSecondaryBar()
            invalidate()
        }

        fun endCrop() {
            cropActive = false
            cropRect = RectF()
            rebuildSecondaryBar()
        }

        fun setCropAspect(ratio: Float) {
            cropAspect = ratio
            val image = imageRect()
            if (image.width() > 0f && image.height() > 0f) {
                cropRect = if (ratio > 0f) fitAspectInRect(image, ratio) else RectF(image)
                cropActive = true
            }
            cropDirty = true
            rebuildSecondaryBar()
            invalidate()
        }

        fun cancelCrop() {
            cropActive = false
            cropDirty = false
            cropRect = RectF()
            if (tool == Tool.CROP) {
                tool = toolBeforeCrop
                rebuildSecondaryBar()
                refreshToolBar()
            }
            invalidate()
        }

        /** 裁剪框（View 坐标）→ 当前图空间的归一化矩形 → 记一条 Crop 操作。 */
        fun applyCrop() {
            val bitmap = rendered ?: return
            if (!ensureMatrix() || cropRect.width() <= 1f || cropRect.height() <= 1f) return
            val topLeft = toNormalized(cropRect.left, cropRect.top) ?: return
            val bottomRight = toNormalized(cropRect.right, cropRect.bottom) ?: return
            val rect = EditRect(
                min(topLeft.x, bottomRight.x),
                min(topLeft.y, bottomRight.y),
                max(topLeft.x, bottomRight.x),
                max(topLeft.y, bottomRight.y),
            )
            if (rect.isEmpty()) return
            cropActive = false
            cropDirty = false
            cropRect = RectF()
            state?.add(EditOp.Crop(rect))
            if (tool == Tool.CROP) {
                tool = toolBeforeCrop
                rebuildSecondaryBar()
                refreshToolBar()
            }
            requestRender()
        }

        private fun onCropTouch(event: MotionEvent): Boolean {
            val image = imageRect()
            if (image.isEmpty || rendered == null) return false
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    if (!cropActive) beginCropFrame(image)
                    activeHandle = hitHandle(event.x, event.y)
                    downX = event.x
                    downY = event.y
                    return activeHandle >= 0
                }

                MotionEvent.ACTION_MOVE -> {
                    if (activeHandle < 0) return false
                    val stepX = event.x - downX
                    val stepY = event.y - downY
                    downX = event.x
                    downY = event.y
                    dragCrop(activeHandle, stepX, stepY, image)
                    return true
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    activeHandle = -1
                    return true
                }
            }
            return false
        }

        private fun beginCropFrame(image: RectF) {
            cropActive = true
            cropDirty = false
            cropRect = RectF(image)
            invalidate()
        }

        /** 0..3 = 四角，4..7 = 四边，8 = 整体移动，-1 = 没命中。 */
        private fun hitHandle(x: Float, y: Float): Int {
            val rect = if (cropActive) cropRect else imageRect()
            if (rect.isEmpty) return -1
            val touch = dp(HANDLE_TOUCH_DP).toFloat()
            val corners = listOf(
                0 to RectF(rect.left, rect.top, rect.left, rect.top),
                1 to RectF(rect.right, rect.top, rect.right, rect.top),
                2 to RectF(rect.left, rect.bottom, rect.left, rect.bottom),
                3 to RectF(rect.right, rect.bottom, rect.right, rect.bottom),
            )
            corners.forEach { (handle, point) ->
                if (abs(x - point.left) <= touch && abs(y - point.top) <= touch) return handle
            }
            val edgeTouch = touch * 0.8f
            if (abs(x - rect.left) <= edgeTouch && y in rect.top..rect.bottom) return 4
            if (abs(y - rect.top) <= edgeTouch && x in rect.left..rect.right) return 5
            if (abs(x - rect.right) <= edgeTouch && y in rect.top..rect.bottom) return 6
            if (abs(y - rect.bottom) <= edgeTouch && x in rect.left..rect.right) return 7
            if (rect.contains(x, y)) return 8
            return -1
        }

        private fun dragCrop(handle: Int, stepX: Float, stepY: Float, image: RectF) {
            val minSize = dp(MIN_CROP_DP).toFloat()
            val rect = RectF(cropRect)
            if (handle == 8) {
                rect.offset(stepX, stepY)
                rect.offset(
                    (image.left - rect.left).coerceAtLeast(0f) + (image.right - rect.right).coerceAtMost(0f),
                    (image.top - rect.top).coerceAtLeast(0f) + (image.bottom - rect.bottom).coerceAtMost(0f),
                )
            } else if (handle <= 3) {
                val anchorX = if (handle == 0 || handle == 2) rect.right else rect.left
                val anchorY = if (handle == 0 || handle == 1) rect.bottom else rect.top
                if (cropAspect <= 0f) {
                    when (handle) {
                        0 -> {
                            rect.left += stepX
                            rect.top += stepY
                        }

                        1 -> {
                            rect.right += stepX
                            rect.top += stepY
                        }

                        2 -> {
                            rect.left += stepX
                            rect.bottom += stepY
                        }

                        else -> {
                            rect.right += stepX
                            rect.bottom += stepY
                        }
                    }
                    rect.left = rect.left.coerceIn(image.left, rect.right - minSize)
                    rect.top = rect.top.coerceIn(image.top, rect.bottom - minSize)
                    rect.right = rect.right.coerceIn(rect.left + minSize, image.right)
                    rect.bottom = rect.bottom.coerceIn(rect.top + minSize, image.bottom)
                } else {
                    val towardRight = handle == 1 || handle == 3
                    val towardBottom = handle == 2 || handle == 3
                    val x = rect.let { if (towardRight) it.right + stepX else it.left + stepX }
                    val y = rect.let { if (towardBottom) it.bottom + stepY else it.top + stepY }
                    var width = abs(x - anchorX)
                    var height = abs(y - anchorY)
                    if (width / cropAspect >= height) height = width / cropAspect else width = height * cropAspect
                    val maxWidth = if (towardRight) image.right - anchorX else anchorX - image.left
                    val maxHeight = if (towardBottom) image.bottom - anchorY else anchorY - image.top
                    if (width > maxWidth) {
                        width = maxWidth
                        height = width / cropAspect
                    }
                    if (height > maxHeight) {
                        height = maxHeight
                        width = height * cropAspect
                    }
                    if (width < minSize) {
                        width = minSize
                        height = width / cropAspect
                    }
                    if (height < minSize) {
                        height = minSize
                        width = height * cropAspect
                    }
                    val left = if (towardRight) anchorX else anchorX - width
                    val top = if (towardBottom) anchorY else anchorY - height
                    rect.set(left, top, left + width, top + height)
                }
            } else {
                when (handle) {
                    4 -> dragVerticalEdge(rect, image, minSize, movableLeft = stepX)
                    5 -> dragHorizontalEdge(rect, image, minSize, movableTop = stepY)
                    6 -> dragVerticalEdge(rect, image, minSize, movableRight = stepX)
                    7 -> dragHorizontalEdge(rect, image, minSize, movableBottom = stepY)
                }
            }
            cropRect = rect
            cropDirty = true
            invalidate()
        }

        private fun dragVerticalEdge(
            rect: RectF,
            image: RectF,
            minSize: Float,
            movableLeft: Float = 0f,
            movableRight: Float = 0f,
        ) {
            if (cropAspect <= 0f) {
                if (movableLeft != 0f) {
                    rect.left = (rect.left + movableLeft).coerceIn(image.left, rect.right - minSize)
                } else {
                    rect.right = (rect.right + movableRight).coerceIn(rect.left + minSize, image.right)
                }
                return
            }
            val fixedRight = movableLeft != 0f
            val fixedX = if (fixedRight) rect.right else rect.left
            val targetX = if (fixedRight) rect.left + movableLeft else rect.right + movableRight
            var width = abs(targetX - fixedX).coerceAtLeast(minSize)
            var height = width / cropAspect
            val centerY = rect.centerY()
            var top = centerY - height / 2f
            var bottom = centerY + height / 2f
            if (top < image.top) {
                top = image.top
                bottom = top + height
            }
            if (bottom > image.bottom) {
                bottom = image.bottom
                top = bottom - height
            }
            height = bottom - top
            width = height * cropAspect
            width = width.coerceAtMost(if (fixedRight) fixedX - image.left else image.right - fixedX)
            height = width / cropAspect
            if (fixedRight) rect.set(fixedX - width, centerY - height / 2f, fixedX, centerY + height / 2f)
            else rect.set(fixedX, centerY - height / 2f, fixedX + width, centerY + height / 2f)
        }

        private fun dragHorizontalEdge(
            rect: RectF,
            image: RectF,
            minSize: Float,
            movableTop: Float = 0f,
            movableBottom: Float = 0f,
        ) {
            if (cropAspect <= 0f) {
                if (movableTop != 0f) {
                    rect.top = (rect.top + movableTop).coerceIn(image.top, rect.bottom - minSize)
                } else {
                    rect.bottom = (rect.bottom + movableBottom).coerceIn(rect.top + minSize, image.bottom)
                }
                return
            }
            val fixedBottom = movableTop != 0f
            val fixedY = if (fixedBottom) rect.bottom else rect.top
            val targetY = if (fixedBottom) rect.top + movableTop else rect.bottom + movableBottom
            var height = abs(targetY - fixedY).coerceAtLeast(minSize)
            var width = height * cropAspect
            val centerX = rect.centerX()
            var left = centerX - width / 2f
            var right = centerX + width / 2f
            if (left < image.left) {
                left = image.left
                right = left + width
            }
            if (right > image.right) {
                right = image.right
                left = right - width
            }
            width = right - left
            height = width / cropAspect
            height = height.coerceAtMost(if (fixedBottom) fixedY - image.top else image.bottom - fixedY)
            width = height * cropAspect
            if (fixedBottom) rect.set(centerX - width / 2f, fixedY - height, centerX + width / 2f, fixedY)
            else rect.set(centerX - width / 2f, fixedY, centerX + width / 2f, fixedY + height)
        }

        private fun drawCropOverlay(canvas: Canvas) {
            if (!cropActive || cropRect.width() <= 0f || cropRect.height() <= 0f) {
                val image = imageRect()
                if (image.width() <= 0f || image.height() <= 0f) return
                cropRect = RectF(image)
                cropActive = true
            }
            val rect = cropRect
            if (rect.width() <= 0f || rect.height() <= 0f) return
            val scrim = Paint().apply { color = Color.parseColor("#99000000") }
            canvas.drawRect(0f, 0f, width.toFloat(), rect.top, scrim)
            canvas.drawRect(0f, rect.bottom, width.toFloat(), height.toFloat(), scrim)
            canvas.drawRect(0f, rect.top, rect.left, rect.bottom, scrim)
            canvas.drawRect(rect.right, rect.top, width.toFloat(), rect.bottom, scrim)

            val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = dp(1).toFloat()
                color = Color.WHITE
            }
            canvas.drawRect(rect, border)
            val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = dp(1).toFloat()
                color = Color.parseColor("#66FFFFFF")
            }
            for (index in 1..2) {
                val x = rect.left + rect.width() * index / 3f
                val y = rect.top + rect.height() * index / 3f
                canvas.drawLine(x, rect.top, x, rect.bottom, grid)
                canvas.drawLine(rect.left, y, rect.right, y, grid)
            }
            val handle = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = dp(3).toFloat()
                color = Color.WHITE
                strokeCap = Paint.Cap.ROUND
            }
            val arm = dp(18).toFloat()
            // 四个角的 L 形把手
            canvas.drawLine(rect.left, rect.top, rect.left + arm, rect.top, handle)
            canvas.drawLine(rect.left, rect.top, rect.left, rect.top + arm, handle)
            canvas.drawLine(rect.right, rect.top, rect.right - arm, rect.top, handle)
            canvas.drawLine(rect.right, rect.top, rect.right, rect.top + arm, handle)
            canvas.drawLine(rect.left, rect.bottom, rect.left + arm, rect.bottom, handle)
            canvas.drawLine(rect.left, rect.bottom, rect.left, rect.bottom - arm, handle)
            canvas.drawLine(rect.right, rect.bottom, rect.right - arm, rect.bottom, handle)
            canvas.drawLine(rect.right, rect.bottom, rect.right, rect.bottom - arm, handle)
        }
        /** 视图摘除时回收实时涂抹用的参考图（渲染图 / 源图由外层回收）。 */
        fun release() {
            mosaicReference?.recycle()
            mosaicReference = null
            mosaicStamper = null
            mosaicCanvas = null
            livePoints.clear()
        }
    }

    override fun onDetachedFromWindow() {
        destroying = true
        executor.shutdownNow()
        surface.release()
        surface.onBitmapChanged()
        rendered?.recycle()
        rendered = null
        source?.recycle()
        source = null
        super.onDetachedFromWindow()
    }
}

/** 在 [rect] 内取「以原中心为中心、指定宽高比」的最大矩形（裁剪比例预设用，View 坐标）。 */
private fun fitAspectInRect(rect: RectF, ratio: Float): RectF {
    if (ratio <= 0f || rect.width() <= 0f || rect.height() <= 0f) return RectF(rect)
    val centerX = rect.centerX()
    val centerY = rect.centerY()
    var width = rect.width()
    var height = width / ratio
    if (height > rect.height()) {
        height = rect.height()
        width = height * ratio
    }
    // 与 EditRect.withAspect 同一条纪律：浮点误差会造出空区间，先把上界抬起来
    val left = (centerX - width / 2f).coerceIn(rect.left, max(rect.left, rect.right - width))
    val top = (centerY - height / 2f).coerceIn(rect.top, max(rect.top, rect.bottom - height))
    return RectF(left, top, left + width, top + height)
}
