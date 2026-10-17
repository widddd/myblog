package com.smartblog.app

import kotlin.math.max

/**
 * 图片编辑的**纯逻辑层**：操作时间线 + 撤销/重做 + 坐标变换 + 宽高比推算。
 *
 * 刻意不 import 任何 android.*（同 `AppUrl` / `PushRules` 的规矩）：JVM 单测直接跑，
 * 像素渲染与手势留在 `PhotoEditRenderer.kt` / `PhotoEditorView.kt`。
 *
 * 设计口径（重要，改之前先读）：
 *  - `EditOp` 里的点 / 矩形都是**归一化的（0..1），相对于「记录那一刻的那张图」**；
 *  - 时间线是唯一事实源，没有第二份 `rotation` / `crop` 状态；
 *  - `compile()` 把「后来的」旋转 / 裁剪映射到先前的画笔操作上 —— 于是
 *    「先涂鸦再裁剪」= 涂鸦跟着被剪掉，「先裁剪再涂鸦」= 涂鸦活在裁剪后的空间里。
 */
data class EditPoint(val x: Float, val y: Float)

data class EditRect(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val width: Float get() = right - left

    val height: Float get() = bottom - top

    fun isEmpty(): Boolean = width <= 0f || height <= 0f

    /** 在自身范围内取「以原中心为中心、指定宽高比」的最大矩形（裁剪比例预设用，纯函数）。 */
    fun withAspect(ratio: Float): EditRect {
        if (ratio <= 0f || width <= 0f || height <= 0f) return this
        val centerX = (left + right) / 2f
        val centerY = (top + bottom) / 2f
        var width = this.width
        var height = width / ratio
        if (height > this.height) {
            height = this.height
            width = height * ratio
        }
        // ⚠️ 浮点误差会让 `right - width` 比 `left` 小一点点（单位测试抓到过），
        // coerceIn 遇空区间直接抛异常 —— 先把上界抬到不小于下界。
        val left = (centerX - width / 2f).coerceIn(this.left, max(this.left, right - width))
        val top = (centerY - height / 2f).coerceIn(this.top, max(this.top, bottom - height))
        return EditRect(left, top, left + width, top + height)
    }

    companion object {
        val FULL = EditRect(0f, 0f, 1f, 1f)
    }
}

enum class MosaicKind { PIXEL, BLUR }

/** 一笔操作。坐标全部相对「记录时那张图」。 */
sealed interface EditOp {
    data class Doodle(val points: List<EditPoint>, val color: Int, val width: Float) : EditOp

    data class Mosaic(val kind: MosaicKind, val points: List<EditPoint>, val width: Float) : EditOp

    /** 顺时针 90° × quarterTurns（负数 = 逆时针）。 */
    data class Rotate(val quarterTurns: Int) : EditOp

    data class Crop(val rect: EditRect) : EditOp
}

/** 渲染时按顺序作用在位图上的结构变换。 */
sealed interface StructuralOp {
    data class Rotate(val quarterTurns: Int) : StructuralOp

    data class Crop(val rect: EditRect) : StructuralOp
}

/**
 * `compile()` 的结果：结构变换 + 已映射到最终坐标系的画笔操作 + 最终宽高比。
 *
 * `drawing` 里只可能有 `Doodle` / `Mosaic`；顺序 = 用户画的先后（后来的盖先来的）。
 */
data class CompiledEdit(
    val structural: List<StructuralOp>,
    val drawing: List<EditOp>,
    val aspectRatio: Float,
)

/** 笔刷口径（单一事实源）：宽度都是「相对短边的比例」。 */
object EditBrush {
    const val DOODLE_MIN = 0.004f
    const val DOODLE_MAX = 0.040f
    const val DOODLE_DEFAULT = 0.012f

    const val MOSAIC_MIN = 0.020f
    const val MOSAIC_MAX = 0.120f
    const val MOSAIC_DEFAULT = 0.060f

    /** 涂鸦调色盘（微信观感：白 / 黑 / 红 / 橙 / 黄 / 绿 / 蓝 / 紫）。 */
    val PALETTE: List<Int> = listOf(
        0xFFFFFFFF.toInt(),
        0xFF111111.toInt(),
        0xFFE5484D.toInt(),
        0xFFF76B15.toInt(),
        0xFFF5C518.toInt(),
        0xFF2F9E44.toInt(),
        0xFF2C7BE5.toInt(),
        0xFF9C36B5.toInt(),
    )
}

/**
 * 编辑器状态：一层时间线 + 撤销 / 重做。
 *
 * 所有方法都是纯计算（不碰位图）；线程安全由调用方保证（编辑器只在主线程用）。
 */
class PhotoEditState(sourceAspect: Float) {

    private val timeline = mutableListOf<EditOp>()
    private val undone = mutableListOf<EditOp>()

    /** 原图宽高比（宽 / 高），只影响 `compile()` 里的宽高比推算。 */
    private val sourceAspect: Float = sourceAspect.takeIf { it > 0f } ?: 1f

    val ops: List<EditOp> get() = timeline.toList()

    fun add(op: EditOp): PhotoEditState {
        timeline += op
        undone.clear()
        return this
    }

    fun canUndo(): Boolean = timeline.isNotEmpty()

    fun canRedo(): Boolean = undone.isNotEmpty()

    fun isDirty(): Boolean = timeline.isNotEmpty()

    fun undo(): Boolean {
        if (timeline.isEmpty()) return false
        undone += timeline.removeAt(timeline.lastIndex)
        return true
    }

    fun redo(): Boolean {
        if (undone.isEmpty()) return false
        timeline += undone.removeAt(undone.lastIndex)
        return true
    }

    /**
     * 把时间线编译成「结构变换 + 已映射的画笔操作 + 最终宽高比」。
     *
     * 映射规则：遇到旋转 / 裁剪时，把**此前所有画笔操作**的点按同一个变换挪过去；
     * 画笔操作本身原样进 `drawing`（它的坐标已经活在当时的空间里）。
     */
    fun compile(): CompiledEdit {
        var aspect = sourceAspect
        val structural = mutableListOf<StructuralOp>()
        val drawing = mutableListOf<EditOp>()

        for (op in timeline) {
            when (op) {
                is EditOp.Rotate -> {
                    val turns = normalizeTurns(op.quarterTurns)
                    if (turns != 0) {
                        structural += StructuralOp.Rotate(turns)
                        if (turns % 2 == 1) aspect = 1f / aspect
                        for (index in drawing.indices) {
                            drawing[index] = mapPoints(drawing[index]) { rotate(it, turns) }
                        }
                    }
                }

                is EditOp.Crop -> {
                    val rect = op.rect
                    if (!rect.isEmpty()) {
                        structural += StructuralOp.Crop(rect)
                        aspect *= rect.width / rect.height
                        for (index in drawing.indices) {
                            drawing[index] = mapPoints(drawing[index]) { point ->
                                EditPoint(
                                    (point.x - rect.left) / rect.width,
                                    (point.y - rect.top) / rect.height,
                                )
                            }
                        }
                    }
                }

                is EditOp.Doodle -> drawing += op
                is EditOp.Mosaic -> drawing += op
            }
        }
        return CompiledEdit(structural, drawing, aspect)
    }

    private fun mapPoints(op: EditOp, transform: (EditPoint) -> EditPoint): EditOp = when (op) {
        is EditOp.Doodle -> op.copy(points = op.points.map(transform))
        is EditOp.Mosaic -> op.copy(points = op.points.map(transform))
        else -> op
    }

    companion object {
        fun normalizeTurns(turns: Int): Int = ((turns % 4) + 4) % 4

        /** 顺时针 [turns] × 90°（0..3）后的归一化点。 */
        fun rotate(point: EditPoint, turns: Int): EditPoint = when (normalizeTurns(turns)) {
            1 -> EditPoint(1f - point.y, point.x)
            2 -> EditPoint(1f - point.x, 1f - point.y)
            3 -> EditPoint(point.y, 1f - point.x)
            else -> point
        }
    }
}
