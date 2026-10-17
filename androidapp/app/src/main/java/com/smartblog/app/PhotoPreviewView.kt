package com.smartblog.app

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.LruCache
import android.util.TypedValue
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * 全屏图片预览（像微信）：左右滑翻张（吸附）、双指 / 双击缩放、勾选、进编辑器。
 *
 * 轮播实现是「三页窗口」：只放 `上一张 / 当前 / 下一张`（各一个 [ZoomPage]），
 * 滚到边上后把窗口整体挪一格并把滚动位置重置回中间 —— 内容相同所以看不出跳动，
 * 也不会为几千张照片各建一个 View（不引 ViewPager）。
 *
 * 预览解码只取当前与相邻一张（`LruCache(3)`，长边 2048），编辑过的照片自动走编辑版。
 */
internal class PhotoPreviewView(
    private val host: Activity,
    private val photos: List<Uri>,
    initialIndex: Int,
    private val store: PhotoEditStore,
    private val selection: PickerSelection,
    private val single: Boolean,
    private val palette: Palette,
    private val onBack: () -> Unit,
    private val onConfirm: () -> Unit,
    private val onEdited: () -> Unit,
) : FrameLayout(host) {

    private companion object {
        const val LOG_TAG = "SmartBlog"
        const val TOP_BAR_DP = 52
        const val BOTTOM_BAR_DP = 58
        const val SETTLE_DELAY_MS = 120L
        const val SNAP_DURATION_MS = 180L
        const val MAX_ZOOM = 5f
        const val DOUBLE_TAP_ZOOM = 2.5f
    }

    // ⚠️ 不叫 background / foreground：与 View.getBackground()/getForeground() 撞名，
    // Kotlin 会解析成 Drawable（`setBackgroundColor(background)` 编译不过，踩过一次）。
    private val bgColor = Color.parseColor("#FF000000")
    private val fgColor = Color.parseColor("#FFF4F5F7")
    private val muted = Color.parseColor("#FF9AA0A6")
    private val accent = palette.primary

    private var index = initialIndex.coerceIn(0, (photos.size - 1).coerceAtLeast(0))
    private var pageWidth = 0

    private val executor = Executors.newFixedThreadPool(2) { runnable ->
        Thread(runnable, "smartblog-preview")
    }

    /** 只缓存 3 张预览位图；**不要**在淘汰时 recycle（页面可能还在画它，交给 GC）。 */
    private val bitmaps = LruCache<String, Bitmap>(3)

    private val handler = Handler(Looper.getMainLooper())
    private val settleRunnable = Runnable { settleScroll() }

    private val pages = Array(3) { ZoomPage(host) }
    private val track = LinearLayout(host)
    private lateinit var scroller: HorizontalScrollView
    private val titleLabel = TextView(host)
    private val doneButton = TextView(host)
    private val selectButton = TextView(host)
    private val editButton = TextView(host)

    private var editor: PhotoEditorView? = null
    private var destroyed = false
    private var recenterPending = false
    private var recenterTries = 0

    init {
        setBackgroundColor(bgColor)
        val topBar = buildTopBar()
        val bottomBar = buildBottomBar()

        scroller = HorizontalScrollView(host).apply {
            isHorizontalScrollBarEnabled = false
            overScrollMode = OVER_SCROLL_NEVER
            setBackgroundColor(bgColor)
        }
        track.orientation = LinearLayout.HORIZONTAL
        pages.forEach { page ->
            track.addView(page, LinearLayout.LayoutParams(1, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        scroller.addView(
            track,
            ViewGroup.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )

        val column = LinearLayout(host).apply {
            orientation = LinearLayout.VERTICAL
            addView(
                topBar,
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(TOP_BAR_DP)),
            )
            addView(
                scroller,
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f),
            )
            addView(
                bottomBar,
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(BOTTOM_BAR_DP)),
            )
        }
        addView(
            column,
            LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )

        scroller.viewTreeObserver.addOnScrollChangedListener { onScrollChanged() }
        rebind()
        updateUi()
    }

    // ---------------------------------------------------------------- 布局 / 轮播

    override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
        super.onSizeChanged(width, height, oldWidth, oldHeight)
        if (width == oldWidth || width <= 0) return
        pageWidth = width
        pages.forEach { page ->
            page.layoutParams = LinearLayout.LayoutParams(width, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        track.requestLayout()
        // ⚠️ 三页的宽度是布局期才知道的（初始 1px）。必须等**这一轮布局真的量完**再重置滚动位置，
        // 否则 scrollTo 会被"轨道只有几个像素宽"夹回 0 → 停在左边那张空页上（黑屏，踩过一次）。
        recenterPending = true
        requestLayout()
        Log.i(LOG_TAG, "预览尺寸：$width x $height")
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        if (!recenterPending || pageWidth <= 0) return
        // ⚠️ onSizeChanged 与 onLayout 在**同一次**布局里先后发生，而三页的宽度要等下一轮
        // requestLayout 才量得出来 —— 这一轮轨道还只有几像素宽，scrollTo 会被夹回 0，
        // 停在左边那张空页上（表现就是预览黑屏）。所以：量够了才归位，没够就再要一轮（限次数兜底）。
        if (track.width < pageWidth * 2 && recenterTries < 4) {
            recenterTries++
            track.requestLayout()
            return
        }
        recenterPending = false
        scroller.scrollTo(pageWidth, 0)
        Log.i(
            LOG_TAG,
            "预览归位：pageWidth=$pageWidth 轨道=${track.width} 实际 scrollX=${scroller.scrollX}",
        )
    }

    /** 把三页窗口对齐到当前 index（index-1 / index / index+1），并把滚动位置放回中间页。 */
    private fun rebind() {
        val windowStart = index - 1
        pages.forEachIndexed { pageIndex, page ->
            val uri = photos.getOrNull(windowStart + pageIndex)
            if (uri == null) page.clear() else bindPage(page, uri)
        }
        if (pageWidth > 0) scroller.scrollTo(pageWidth, 0)
    }

    private fun bindPage(page: ZoomPage, uri: Uri) {
        val key = store.keyFor(uri)
        page.tag = key
        val cached = bitmaps.get(key)
        if (cached != null) {
            page.setPhoto(cached)
            return
        }
        page.clear()
        page.tag = key
        executor.execute {
            val decoded = PhotoFiles.decode(host, store.sourceFor(uri), PhotoFiles.PREVIEW_MAX_DIMENSION)
            host.runOnUiThread {
                if (destroyed) return@runOnUiThread
                if (decoded == null) {
                    Log.w(LOG_TAG, "预览解码失败：$uri")
                    return@runOnUiThread
                }
                bitmaps.put(key, decoded)
                if (page.tag == key) page.setPhoto(decoded)
            }
        }
    }

    private fun currentUri(): Uri? = photos.getOrNull(index)

    private fun onScrollChanged() {
        handler.removeCallbacks(settleRunnable)
        handler.postDelayed(settleRunnable, SETTLE_DELAY_MS)
    }

    /** 松手后把滚动吸附到最近的整页；跨页则把窗口挪一格并把位置重置回中间。 */
    private fun settleScroll() {
        val width = pageWidth
        if (destroyed || width <= 0) return
        val offset = (scroller.scrollX.toFloat() / width).roundToInt().coerceIn(0, 2)
        animateTo(offset * width) { onSettled(offset) }
    }

    private fun animateTo(target: Int, done: () -> Unit) {
        val start = scroller.scrollX
        if (start == target) {
            done()
            return
        }
        ValueAnimator.ofInt(start, target).apply {
            duration = SNAP_DURATION_MS
            addUpdateListener { scroller.scrollTo(it.animatedValue as Int, 0) }
            addListener(
                object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        done()
                    }
                },
            )
        }.start()
    }

    private fun onSettled(offset: Int) {
        val target = index + (offset - 1)
        if (target != index && target in photos.indices) {
            index = target
            rebind()
        } else {
            scroller.scrollTo(pageWidth, 0)
        }
        updateUi()
    }

    // ---------------------------------------------------------------- 顶栏 / 底栏

    private fun buildTopBar(): View {
        val bar = LinearLayout(host).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#CC000000"))
            setPadding(dp(8), 0, dp(8), 0)
        }
        bar.addView(textView("返回", muted) { onBack() })
        titleLabel.apply {
            gravity = Gravity.CENTER
            setTextColor(fgColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        }
        bar.addView(titleLabel, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        doneButton.apply {
            setTextColor(accent)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            setOnClickListener { confirm() }
        }
        bar.addView(doneButton)
        return bar
    }

    private fun buildBottomBar(): View {
        val bar = LinearLayout(host).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#CC000000"))
            setPadding(dp(8), 0, dp(8), 0)
        }
        selectButton.apply {
            setTextColor(fgColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            setOnClickListener { toggleSelection() }
        }
        editButton.apply {
            text = "编辑"
            setTextColor(fgColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            setOnClickListener { openEditor() }
        }
        bar.addView(selectButton)
        bar.addView(View(host), LinearLayout.LayoutParams(0, 1, 1f))
        bar.addView(editButton)
        return bar
    }

    private fun updateUi() {
        val uri = currentUri()
        val edited = uri != null && store.isEdited(uri)
        titleLabel.text = buildString {
            append(index + 1)
            append(" / ")
            append(photos.size)
            if (edited) append(" · 已编辑")
        }
        doneButton.text = if (single) "完成" else "完成(${selection.size})"
        doneButton.alpha = if (single || selection.size > 0) 1f else 0.35f
        selectButton.visibility = if (single) GONE else VISIBLE
        if (!single && uri != null) {
            val selectedNow = selection.contains(uri)
            selectButton.text = if (selectedNow) "已选" else "选择"
            selectButton.setTextColor(if (selectedNow) accent else fgColor)
        }
    }

    private fun textView(label: String, color: Int, onClick: () -> Unit): TextView =
        TextView(host).apply {
            text = label
            setTextColor(color)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            setOnClickListener { onClick() }
        }

    // ---------------------------------------------------------------- 选择 / 确认

    private fun toggleSelection() {
        val uri = currentUri() ?: return
        if (single) return
        if (!selection.toggle(uri)) {
            toast("最多选 ${selection.max} 张")
            return
        }
        updateUi()
    }

    private fun confirm() {
        val uri = currentUri() ?: return
        if (single) {
            selection.selected.clear()
            selection.selected.add(uri)
            onConfirm()
            return
        }
        if (selection.size == 0) {
            toast("请先选择照片")
            return
        }
        onConfirm()
    }

    // ---------------------------------------------------------------- 编辑器

    private fun openEditor() {
        if (editor != null) return
        val uri = currentUri() ?: return
        val view = PhotoEditorView(
            host = host,
            sourceUri = store.sourceFor(uri),
            palette = palette,
            onCancel = { closeEditor() },
            onSaved = { file -> onEditorSaved(uri, file) },
        )
        editor = view
        addView(
            view,
            LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
    }

    private fun closeEditor() {
        val view = editor ?: return
        editor = null
        removeView(view)
    }

    private fun onEditorSaved(uri: Uri, file: File?) {
        if (file != null) {
            store.put(uri, file)
            onEdited()
        }
        closeEditor()
        rebind()
        updateUi()
    }

    /** 返回键语义：编辑器 → 先关编辑器；放大中 → 先复位；否则回网格。 */
    fun handleBack(): Boolean {
        val openEditor = editor
        if (openEditor != null) {
            if (openEditor.handleBack()) return true
            closeEditor()
            return true
        }
        val page = pages[1]
        if (page.isZoomed()) {
            page.resetZoom()
            return true
        }
        onBack()
        return true
    }

    fun shutdown() {
        if (destroyed) return
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        executor.shutdownNow()
        closeEditor()
        bitmaps.evictAll()
    }

    override fun onDetachedFromWindow() {
        shutdown()
        super.onDetachedFromWindow()
    }

    private fun toast(message: String) {
        Toast.makeText(host, message, Toast.LENGTH_SHORT).show()
    }

    private fun dp(value: Int): Int = dp(host, value)

    // ---------------------------------------------------------------- 单页：缩放 / 平移

    private inner class ZoomPage(context: Context) : View(context) {

        private var photo: Bitmap? = null
        private var scale = 1f
        private var offsetX = 0f
        private var offsetY = 0f
        private var baseScale = 1f
        private var lastX = 0f
        private var lastY = 0f
        private var loggedBitmap: Bitmap? = null
        private val matrix = Matrix()

        private val scaleDetector = ScaleGestureDetector(
            context,
            object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                override fun onScale(detector: ScaleGestureDetector): Boolean {
                    val next = (scale * detector.scaleFactor).coerceIn(1f, MAX_ZOOM)
                    val ratio = next / scale
                    offsetX = (offsetX - (detector.focusX - width / 2f)) * ratio +
                        (detector.focusX - width / 2f)
                    offsetY = (offsetY - (detector.focusY - height / 2f)) * ratio +
                        (detector.focusY - height / 2f)
                    scale = next
                    clampOffsets()
                    invalidate()
                    return true
                }
            },
        )

        private val gestureDetector = GestureDetector(
            context,
            object : GestureDetector.SimpleOnGestureListener() {
                override fun onDown(event: MotionEvent): Boolean = true

                override fun onDoubleTap(event: MotionEvent): Boolean {
                    if (scale > 1.05f) {
                        resetZoom()
                    } else {
                        scale = DOUBLE_TAP_ZOOM
                        offsetX = (width / 2f - event.x) * (scale - 1f)
                        offsetY = (height / 2f - event.y) * (scale - 1f)
                        clampOffsets()
                        invalidate()
                    }
                    return true
                }
            },
        )

        fun setPhoto(bitmap: Bitmap?) {
            photo = bitmap
            resetZoom()
            invalidate()
        }

        fun clear() {
            photo = null
            tag = null
            resetZoom()
            invalidate()
        }

        fun isZoomed(): Boolean = scale > 1.02f

        fun resetZoom() {
            scale = 1f
            offsetX = 0f
            offsetY = 0f
            invalidate()
        }

        override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
            super.onSizeChanged(width, height, oldWidth, oldHeight)
            baseScale = computeBaseScale()
            clampOffsets()
        }

        private fun computeBaseScale(): Float {
            val bitmap = photo ?: return 1f
            if (bitmap.width <= 0 || bitmap.height <= 0 || width <= 0 || height <= 0) return 1f
            return min(width.toFloat() / bitmap.width, height.toFloat() / bitmap.height)
        }

        private fun clampOffsets() {
            val bitmap = photo ?: return
            val total = baseScale * scale
            val maxX = max(0f, (bitmap.width * total - width) / 2f)
            val maxY = max(0f, (bitmap.height * total - height) / 2f)
            offsetX = offsetX.coerceIn(-maxX, maxX)
            offsetY = offsetY.coerceIn(-maxY, maxY)
        }

        override fun onDraw(canvas: Canvas) {
            val bitmap = photo ?: return
            if (bitmap.width <= 0 || bitmap.height <= 0) return
            baseScale = computeBaseScale()
            val total = baseScale * scale
            matrix.reset()
            matrix.postScale(total, total)
            matrix.postTranslate(
                (width - bitmap.width * total) / 2f + offsetX,
                (height - bitmap.height * total) / 2f + offsetY,
            )
            if (loggedBitmap !== bitmap) {
                loggedBitmap = bitmap
                Log.i(
                    LOG_TAG,
                    "预览绘制：view=${width}x$height bitmap=${bitmap.width}x${bitmap.height} scale=$total",
                )
            }
            canvas.drawBitmap(bitmap, matrix, null)
        }

        override fun onTouchEvent(event: MotionEvent): Boolean {
            if (photo == null) return false
            scaleDetector.onTouchEvent(event)
            gestureDetector.onTouchEvent(event)
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    lastX = event.x
                    lastY = event.y
                    parent?.requestDisallowInterceptTouchEvent(isZoomed())
                }

                MotionEvent.ACTION_POINTER_DOWN -> {
                    parent?.requestDisallowInterceptTouchEvent(true)
                }

                MotionEvent.ACTION_MOVE -> {
                    if (isZoomed() && event.pointerCount == 1) {
                        offsetX += event.x - lastX
                        offsetY += event.y - lastY
                        clampOffsets()
                        invalidate()
                        parent?.requestDisallowInterceptTouchEvent(true)
                    }
                    lastX = event.x
                    lastY = event.y
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    parent?.requestDisallowInterceptTouchEvent(false)
                }
            }
            return true
        }
    }
}
