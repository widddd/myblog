package com.smartblog.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhotoEditStateTest {

    private val eps = 0.0001f

    private fun assertPoint(expected: EditPoint, actual: EditPoint, delta: Float = 0.0001f) {
        assertEquals("x", expected.x, actual.x, delta)
        assertEquals("y", expected.y, actual.y, delta)
    }

    // ---------------------------------------------------------------- 旋转基础

    @Test
    fun `rotate four times is identity`() {
        val point = EditPoint(0.2f, 0.7f)
        var result = point
        repeat(4) { result = PhotoEditState.rotate(result, 1) }
        assertPoint(point, result)
    }

    @Test
    fun `rotate clockwise maps corner as expected`() {
        // 左上角顺时针 90° → 右上角
        assertPoint(EditPoint(1f, 0f), PhotoEditState.rotate(EditPoint(0f, 0f), 1))
        // 逆时针 90°（turns = 3）→ 左下角
        assertPoint(EditPoint(0f, 1f), PhotoEditState.rotate(EditPoint(0f, 0f), 3))
        // 180°
        assertPoint(EditPoint(1f, 1f), PhotoEditState.rotate(EditPoint(0f, 0f), 2))
    }

    @Test
    fun `normalizeTurns handles negatives and overflow`() {
        assertEquals(3, PhotoEditState.normalizeTurns(-1))
        assertEquals(2, PhotoEditState.normalizeTurns(-2))
        assertEquals(1, PhotoEditState.normalizeTurns(5))
        assertEquals(0, PhotoEditState.normalizeTurns(-4))
    }

    // ---------------------------------------------------------------- compile 映射

    @Test
    fun `doodle is rotated by later rotate`() {
        val state = PhotoEditState(1f)
        state.add(EditOp.Doodle(listOf(EditPoint(0.25f, 0.5f)), color = 0, width = 0.01f))
        state.add(EditOp.Rotate(1))

        val compiled = state.compile()
        assertEquals(1, compiled.structural.size)
        val doodle = compiled.drawing.single() as EditOp.Doodle
        assertPoint(EditPoint(0.5f, 0.25f), doodle.points.single())
    }

    @Test
    fun `doodle is cropped by later crop`() {
        val state = PhotoEditState(1f)
        state.add(
            EditOp.Doodle(
                listOf(EditPoint(0.25f, 0.25f), EditPoint(0.5f, 0.5f)),
                color = 0,
                width = 0.01f,
            ),
        )
        state.add(EditOp.Crop(EditRect(0.25f, 0.25f, 0.75f, 0.75f)))

        val doodle = state.compile().drawing.single() as EditOp.Doodle
        assertPoint(EditPoint(0f, 0f), doodle.points[0])
        assertPoint(EditPoint(0.5f, 0.5f), doodle.points[1])
    }

    @Test
    fun `doodle drawn after rotate is not transformed again`() {
        val state = PhotoEditState(1f)
        state.add(EditOp.Rotate(1))
        state.add(EditOp.Doodle(listOf(EditPoint(0.25f, 0.5f)), color = 0, width = 0.01f))

        val compiled = state.compile()
        assertEquals(1, compiled.structural.size)
        val doodle = compiled.drawing.single() as EditOp.Doodle
        assertPoint(EditPoint(0.25f, 0.5f), doodle.points.single())
    }

    @Test
    fun `mosaic follows the same mapping as doodle`() {
        val state = PhotoEditState(1f)
        state.add(
            EditOp.Mosaic(
                MosaicKind.BLUR,
                listOf(EditPoint(0.1f, 0.1f)),
                width = 0.05f,
            ),
        )
        state.add(EditOp.Rotate(2))

        val mosaic = state.compile().drawing.single() as EditOp.Mosaic
        assertPoint(EditPoint(0.9f, 0.9f), mosaic.points.single())
    }

    @Test
    fun `rotate then crop maps point through both`() {
        val state = PhotoEditState(1f)
        state.add(EditOp.Doodle(listOf(EditPoint(0.25f, 0.5f)), color = 0, width = 0.01f))
        state.add(EditOp.Rotate(1)) // (0.5, 0.25)
        state.add(EditOp.Crop(EditRect(0.25f, 0f, 0.75f, 0.5f)))

        val doodle = state.compile().drawing.single() as EditOp.Doodle
        assertPoint(EditPoint(0.5f, 0.5f), doodle.points.single())
    }

    @Test
    fun `aspect ratio follows rotate and crop`() {
        val state = PhotoEditState(4f / 3f)
        assertEquals(4f / 3f, state.compile().aspectRatio, eps)

        state.add(EditOp.Rotate(1))
        assertEquals(3f / 4f, state.compile().aspectRatio, eps)

        state.add(EditOp.Crop(EditRect(0f, 0f, 0.5f, 0.25f)))
        // 0.75 * (0.5 / 0.25) = 1.5
        assertEquals(1.5f, state.compile().aspectRatio, eps)
    }

    @Test
    fun `empty crop is ignored`() {
        val state = PhotoEditState(1f)
        state.add(EditOp.Doodle(listOf(EditPoint(0.5f, 0.5f)), color = 0, width = 0.01f))
        state.add(EditOp.Crop(EditRect(0.4f, 0.4f, 0.4f, 0.6f)))

        val compiled = state.compile()
        assertTrue(compiled.structural.isEmpty())
        val doodle = compiled.drawing.single() as EditOp.Doodle
        assertPoint(EditPoint(0.5f, 0.5f), doodle.points.single())
    }

    @Test
    fun `zero rotation op is dropped`() {
        val state = PhotoEditState(1f)
        state.add(EditOp.Rotate(4))
        val compiled = state.compile()
        assertTrue(compiled.structural.isEmpty())
        assertTrue(compiled.drawing.isEmpty())
    }

    // ---------------------------------------------------------------- 撤销 / 重做

    @Test
    fun `undo and redo walk the timeline`() {
        val state = PhotoEditState(1f)
        assertFalse(state.canUndo())
        assertFalse(state.canRedo())

        val doodle = EditOp.Doodle(listOf(EditPoint(0.5f, 0.5f)), color = 0, width = 0.01f)
        state.add(doodle)
        state.add(EditOp.Rotate(1))
        assertEquals(2, state.ops.size)

        assertTrue(state.undo())
        assertEquals(1, state.ops.size)
        assertTrue(state.canRedo())
        assertEquals(0, state.compile().structural.size)

        assertTrue(state.undo())
        assertTrue(state.ops.isEmpty())
        assertFalse(state.undo())

        assertTrue(state.redo())
        assertTrue(state.redo())
        assertEquals(2, state.ops.size)
        assertEquals(1, state.compile().structural.size)
        assertFalse(state.redo())
    }

    @Test
    fun `adding after undo clears redo stack`() {
        val state = PhotoEditState(1f)
        state.add(EditOp.Rotate(1))
        state.add(EditOp.Rotate(1))
        state.undo()
        assertTrue(state.canRedo())

        state.add(EditOp.Rotate(-1))
        assertFalse(state.canRedo())
        assertEquals(2, state.ops.size)
    }

    @Test
    fun `dirty only when there are edits`() {
        val state = PhotoEditState(1f)
        assertFalse(state.isDirty())
        state.add(EditOp.Rotate(1))
        assertTrue(state.isDirty())
        state.undo()
        assertFalse(state.isDirty())
    }

    // ---------------------------------------------------------------- 裁剪比例

    @Test
    fun `withAspect keeps ratio and stays inside`() {
        val source = EditRect(0.1f, 0.2f, 0.9f, 0.8f) // 0.8 x 0.6
        val square = source.withAspect(1f)
        assertEquals(0.6f, square.width, eps)
        assertEquals(0.6f, square.height, eps)
        assertTrue(square.left >= source.left - eps && square.right <= source.right + eps)
        assertTrue(square.top >= source.top - eps && square.bottom <= source.bottom + eps)

        val wide = source.withAspect(16f / 9f)
        assertEquals(16f / 9f, wide.width / wide.height, eps)
        assertTrue(wide.left >= source.left - eps && wide.right <= source.right + eps)
    }

    @Test
    fun `withAspect ignores invalid ratio`() {
        val source = EditRect(0.2f, 0.2f, 0.8f, 0.6f)
        assertEquals(source, source.withAspect(0f))
        assertEquals(source, source.withAspect(-1f))
    }

    // ---------------------------------------------------------------- 笔刷口径

    @Test
    fun `brush ranges are sane`() {
        assertTrue(EditBrush.DOODLE_MIN < EditBrush.DOODLE_MAX)
        assertTrue(EditBrush.MOSAIC_MIN < EditBrush.MOSAIC_MAX)
        assertTrue(EditBrush.DOODLE_DEFAULT >= EditBrush.DOODLE_MIN)
        assertTrue(EditBrush.DOODLE_DEFAULT <= EditBrush.DOODLE_MAX)
        assertTrue(EditBrush.MOSAIC_DEFAULT >= EditBrush.MOSAIC_MIN)
        assertTrue(EditBrush.MOSAIC_DEFAULT <= EditBrush.MOSAIC_MAX)
        assertEquals(8, EditBrush.PALETTE.size)
    }
}
