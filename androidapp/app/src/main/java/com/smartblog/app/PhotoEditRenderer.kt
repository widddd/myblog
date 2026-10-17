package com.smartblog.app

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * 把 `PhotoEditState` 编译出来的时间线画成位图（**后台线程调用**）。
 *
 * 两个马赛克的做法（和微信观感对齐）：
 *  - 像素马赛克：整图先按块缩小（`filter=false`）再放大（`filter=false`），块大小 = 短边/128（6–40px）；
 *  - 模糊：整图缩到 1/12（`filter=true`）再放回来 —— 比真卷积便宜，观感是"糊掉"。
 *
 * 笔刷 = 圆形，用 `BitmapShader` 从**参考图**取样：写 `output`、读 `ref`，不会把已涂的区域叠加变黑。
 * 参考图在**每个马赛克操作前**现算一次（从当时已经画好的 `output` 取），所以"马赛克会不会盖住先涂的涂鸦"
 * 这类先后关系在实时预览与撤销重渲染之间是一致的。
 */
object PhotoEditRenderer {

    private const val PIXEL_BLOCK_DIVISOR = 128f
    private const val PIXEL_BLOCK_MIN = 6f
    private const val PIXEL_BLOCK_MAX = 40f
    private const val BLUR_DOWNSCALE = 12

    /** 入口：编译 + 渲染。 */
    fun render(source: Bitmap, state: PhotoEditState): Bitmap =
        renderCompiled(source, state.compile())

    /** 编译产物 → 位图（结构变换 → 画笔操作）。 */
    fun renderCompiled(source: Bitmap, compiled: CompiledEdit): Bitmap {
        var work: Bitmap = source
        var owned = false
        for (op in compiled.structural) {
            val next = when (op) {
                is StructuralOp.Rotate -> rotated(work, op.quarterTurns)
                is StructuralOp.Crop -> cropped(work, op.rect)
            } ?: continue
            if (owned) work.recycle()
            work = next
            owned = true
        }

        val flat = work
        val output = flat.copy(Bitmap.Config.ARGB_8888, true)
            ?: throw OutOfMemoryError("复制编辑位图失败")
        val canvas = Canvas(output)
        val minSide = min(output.width, output.height).toFloat()

        for (op in compiled.drawing) {
            when (op) {
                is EditOp.Doodle -> drawDoodle(
                    canvas,
                    op.points,
                    op.color,
                    op.width,
                    output.width,
                    output.height,
                    minSide,
                )

                is EditOp.Mosaic -> {
                    if (op.points.isNotEmpty()) {
                        val reference = referenceFor(output, op.kind)
                        stampStroke(output, reference, op.points, op.width * minSide / 2f)
                        reference.recycle()
                    }
                }

                else -> Unit
            }
        }

        if (owned) flat.recycle()
        return output
    }

    /** 生成某种马赛克的整图参考图（调用方负责 `recycle`）。 */
    fun referenceFor(source: Bitmap, kind: MosaicKind): Bitmap = when (kind) {
        MosaicKind.PIXEL -> {
            val minSide = min(source.width, source.height).toFloat()
            val block = (minSide / PIXEL_BLOCK_DIVISOR).coerceIn(PIXEL_BLOCK_MIN, PIXEL_BLOCK_MAX)
            val smallWidth = max(1, (source.width / block).roundToInt())
            val smallHeight = max(1, (source.height / block).roundToInt())
            val small = Bitmap.createScaledBitmap(source, smallWidth, smallHeight, false)
            val big = Bitmap.createScaledBitmap(small, source.width, source.height, false)
            if (big !== small) small.recycle()
            big
        }

        MosaicKind.BLUR -> {
            val smallWidth = max(1, source.width / BLUR_DOWNSCALE)
            val smallHeight = max(1, source.height / BLUR_DOWNSCALE)
            val small = Bitmap.createScaledBitmap(source, smallWidth, smallHeight, true)
            val big = Bitmap.createScaledBitmap(small, source.width, source.height, true)
            if (big !== small) small.recycle()
            big
        }
    }

    /**
     * 把 [points]（相对 [target] 归一化）用圆形笔刷从 [reference] 贴到 [target]。
     * 实时涂抹与撤销重渲染共用这一条，保证两边长得一样。
     */
    fun stampStroke(
        target: Bitmap,
        reference: Bitmap,
        points: List<EditPoint>,
        radius: Float,
    ) {
        if (points.isEmpty() || radius <= 0f) return
        val stamper = MosaicStamper(reference)
        val canvas = Canvas(target)
        val width = target.width.toFloat()
        val height = target.height.toFloat()
        for (point in points) {
            stamper.stamp(canvas, point.x * width, point.y * height, radius)
        }
    }

    /** 圆形马赛克笔刷：一次构造（shader + paint），整笔复用（实时涂抹时别每个点都新建 Paint）。 */
    class MosaicStamper(reference: Bitmap) {

        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = BitmapShader(reference, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        }

        fun stamp(canvas: Canvas, x: Float, y: Float, radius: Float) {
            canvas.drawCircle(x, y, radius.coerceAtLeast(0.5f), paint)
        }
    }

    /**
     * 把一笔涂鸦直接画到 [target] 上。
     *
     * 编辑器**落笔即画**（抬手才出现会有明显延迟），渲染重放走同一个函数 —— 两处长得一样。
     */
    fun drawDoodleStroke(target: Bitmap, points: List<EditPoint>, color: Int, width: Float) {
        if (points.isEmpty()) return
        drawDoodle(
            Canvas(target),
            points,
            color,
            width,
            target.width,
            target.height,
            min(target.width, target.height).toFloat(),
        )
    }

    // ---------------------------------------------------------------- 画笔

    private fun drawDoodle(
        canvas: Canvas,
        points: List<EditPoint>,
        color: Int,
        width: Float,
        targetWidth: Int,
        targetHeight: Int,
        minSide: Float,
    ) {
        if (points.isEmpty()) return
        val mapped = points.map { EditPoint(it.x * targetWidth, it.y * targetHeight) }
        val path = Path()
        if (mapped.size == 1) {
            path.addCircle(mapped[0].x, mapped[0].y, 0.5f, Path.Direction.CW)
        } else {
            path.moveTo(mapped[0].x, mapped[0].y)
            // 相邻点中点 + 前一点做控制点：和手指轨迹比直连更顺（微信同感）
            for (index in 1 until mapped.size) {
                val previous = mapped[index - 1]
                val current = mapped[index]
                val midX = (previous.x + current.x) / 2f
                val midY = (previous.y + current.y) / 2f
                path.quadTo(previous.x, previous.y, midX, midY)
            }
            path.lineTo(mapped.last().x, mapped.last().y)
        }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            this.color = color
            strokeWidth = (width * minSide).coerceAtLeast(1f)
        }
        canvas.drawPath(path, paint)
    }

    // ---------------------------------------------------------------- 结构变换

    private fun rotated(source: Bitmap, quarterTurns: Int): Bitmap? {
        val turns = PhotoEditState.normalizeTurns(quarterTurns)
        if (turns == 0) return null
        val matrix = Matrix().apply { postRotate(90f * turns) }
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }

    private fun cropped(source: Bitmap, rect: EditRect): Bitmap? {
        if (rect.isEmpty()) return null
        val left = (rect.left * source.width).roundToInt().coerceIn(0, source.width - 1)
        val top = (rect.top * source.height).roundToInt().coerceIn(0, source.height - 1)
        val right = (rect.right * source.width).roundToInt().coerceIn(left + 1, source.width)
        val bottom = (rect.bottom * source.height).roundToInt().coerceIn(top + 1, source.height)
        return Bitmap.createBitmap(source, left, top, right - left, bottom - top)
    }
}
