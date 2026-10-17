package com.smartblog.app

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.time.LocalDate
import java.time.YearMonth

/**
 * 下拉框 / 日期 / 时间的**卡片式选择器**：样式全部走 [HostUi]（与地址表单同一套色板、圆角、按钮），
 * 不用系统 `AlertDialog` / `DatePickerDialog` / `TimePickerDialog`。
 *
 * 为什么自己画：系统那套是 header 色带 + 全大写按钮 + 系统强调色，放在站点界面里一眼出戏；
 * 而且系统日期/时间选择器**改不动**（`DatePickerDialog` 的配色只能靠 theme 属性，做不到跟随本站配色）。
 *
 * 深浅色：`FormPicker.show()` 每次都重新取 [hostPalette]（Activity 自己处理 uiMode、不会重建），
 * 所以 `applyTheme()` 只要把当前选择器重画一遍就换过来了 —— 见 [FormPicker.show]。
 */
internal abstract class FormPicker(protected val context: Context) {

    protected var host: HostDialog? = null
        private set

    /** 当前挂着的对话框；深/浅色切换时重画（[FormPrompts.applyTheme]） */
    fun show() {
        host?.dismiss()
        val dialog = HostDialog(context, hostPalette(context))
        host = dialog
        build(dialog)
        dialog.show()
    }

    fun dismiss() {
        host?.dismiss()
        host = null
    }

    protected abstract fun build(host: HostDialog)
}

/** 列表行：`choice == null` 表示这一行只是 optgroup 的分组标题 */
internal class ChoiceRow(val label: String, val choice: GvChoice?)

/** `<select>` 的选项拍平：optgroup 变分组标题行，`<hr>` 之类的分隔项丢掉 */
internal fun flattenChoices(choices: Array<GvChoice>?): List<ChoiceRow> {
    val rows = mutableListOf<ChoiceRow>()
    choices?.forEach { choice ->
        when {
            choice.separator -> Unit
            choice.items.isNullOrEmpty() -> rows.add(ChoiceRow(choice.label.orEmpty(), choice))
            else -> {
                rows.add(ChoiceRow(choice.label.orEmpty(), null))
                choice.items!!.forEach { child ->
                    rows.add(ChoiceRow("    ${child.label.orEmpty()}", child))
                }
            }
        }
    }
    return rows
}

/** `<select>`（含多选）：一屏卡片列表，选中态是主色的薄底 + 对勾，和后台筛选框的语义一一对应 */
internal class ChoicePicker(
    context: Context,
    private val rows: List<ChoiceRow>,
    private val multi: Boolean,
    private val dialogTitle: String,
    private val onPicked: (Array<GvChoice>) -> Unit,
    private val onCancel: () -> Unit,
) : FormPicker(context) {

    private val checked = BooleanArray(rows.size) { rows[it].choice?.selected == true }

    override fun build(host: HostDialog) {
        host.setTitle(dialogTitle)
        if (multi) {
            host.setSubtitle("可以选多项")
        }
        val list = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        rows.forEachIndexed { index, row -> list.addView(rowView(host, index, row)) }
        val scroll = ScrollView(context).apply {
            isVerticalScrollBarEnabled = false
            addView(list)
        }
        // 选项多时给个上限高度，别把卡片撑出屏幕
        if (rows.size > MAX_VISIBLE_ROWS) {
            scroll.layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(context, MAX_VISIBLE_ROWS * ROW_HEIGHT_DP),
            )
        }
        host.body.addView(scroll)

        if (multi) {
            host.addPrimaryButton("确定") {
                val picked = rows.indices
                    .filter { checked[it] && rows[it].choice != null }
                    .map { rows[it].choice as GvChoice }
                onPicked(picked.toTypedArray())
            }
        }
        host.addGhostButton("取消") { onCancel() }
        host.setOnCancel(onCancel)
    }

    private fun rowView(host: HostDialog, index: Int, row: ChoiceRow): View {
        val palette = host.palette
        val choice = row.choice
        if (choice == null) {
            return hostText(context, row.label, 13f, palette.hint).apply {
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(context, 12), 0, dp(context, 12), 0)
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dp(context, 36),
                )
            }
        }

        val label = hostText(context, row.label, 15f, palette.fieldText)
        val marker = hostText(context, "", 14f, palette.primary).apply { gravity = Gravity.CENTER }
        val rowView = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(context, 12), 0, dp(context, 12), 0)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(context, ROW_HEIGHT_DP),
            ).apply { bottomMargin = dp(context, 4) }
            addView(label, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(marker, LinearLayout.LayoutParams(dp(context, 26), dp(context, 26)))
            if (choice.disabled) alpha = 0.4f
        }

        fun paint() {
            val on = if (multi) checked[index] else choice.selected
            label.setTextColor(if (on) palette.primary else palette.fieldText)
            label.typeface = if (on) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            rowView.background = if (on) rounded(context, tint(palette.primary, 0.14f), 10) else null
            if (multi) {
                // 多选：勾选状态要看得见（描边方框 → 实心 + 对勾）
                marker.background =
                    if (on) {
                        rounded(context, palette.primary, 6)
                    } else {
                        rounded(context, Color.TRANSPARENT, 6, palette.hint, 1)
                    }
                marker.text = if (on) "✓" else ""
                marker.setTextColor(palette.onPrimary)
            } else {
                marker.text = if (on) "✓" else ""
                marker.setTextColor(palette.primary)
            }
        }
        paint()

        if (!choice.disabled) {
            rowView.setOnClickListener {
                if (multi) {
                    checked[index] = !checked[index]
                    paint()
                } else {
                    onPicked(arrayOf(choice))
                }
            }
        }
        return rowView
    }

    private companion object {
        const val ROW_HEIGHT_DP = 46
        const val MAX_VISIBLE_ROWS = 7
    }
}

/** `<input type="date|month|week">`：自绘月历（周一开头、今天点主色、选中实心），站点里就是"选一天" */
internal class CalendarPicker(
    context: Context,
    initial: LocalDate,
    private val today: LocalDate,
    private val min: LocalDate?,
    private val max: LocalDate?,
    private val dialogTitle: String,
    private val confirmLabel: String,
    private val subtitleFor: (LocalDate) -> String,
    private val onConfirm: (LocalDate) -> Unit,
    private val onCancel: () -> Unit,
) : FormPicker(context) {

    private var month: YearMonth = YearMonth.from(initial)
    private var picked: LocalDate = initial
    private var palette: Palette = hostPalette(context)
    private var grid: LinearLayout? = null
    private var monthLabel: TextView? = null
    private var prevArrow: TextView? = null
    private var nextArrow: TextView? = null

    override fun build(host: HostDialog) {
        palette = host.palette
        host.setTitle(dialogTitle)
        host.setSubtitle(subtitleFor(picked))

        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        prevArrow = navArrow("‹")
        nextArrow = navArrow("›")
        monthLabel = hostText(context, "", 15f, palette.title, bold = true).apply {
            gravity = Gravity.CENTER
        }
        header.addView(prevArrow, LinearLayout.LayoutParams(dp(context, 40), dp(context, 40)))
        header.addView(
            monthLabel,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
        )
        header.addView(nextArrow, LinearLayout.LayoutParams(dp(context, 40), dp(context, 40)))
        host.body.addView(header)
        host.body.addView(weekdayHeader())

        val container = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        grid = container
        host.body.addView(container)

        host.addPrimaryButton(confirmLabel) { onConfirm(picked) }
        host.addGhostButton("取消") { onCancel() }
        host.setOnCancel(onCancel)
        renderMonth()
    }

    private fun navArrow(glyph: String): TextView =
        hostText(context, glyph, 20f, palette.ghost).apply { gravity = Gravity.CENTER }

    private fun weekdayHeader(): View = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, dp(context, 6), 0, dp(context, 2))
        listOf("一", "二", "三", "四", "五", "六", "日").forEach { label ->
            addView(
                hostText(context, label, 12f, palette.hint).apply { gravity = Gravity.CENTER },
                LinearLayout.LayoutParams(0, dp(context, 28), 1f),
            )
        }
    }

    private fun renderMonth() {
        val container = grid ?: return
        container.removeAllViews()
        monthLabel?.text = "${month.year}年${month.monthValue}月"

        // 整月都在可选范围外时把箭头置灰，别让用户白点
        val canGoPrev = min == null || !month.minusMonths(1).atEndOfMonth().isBefore(min)
        val canGoNext = max == null || !month.plusMonths(1).atDay(1).isAfter(max)
        prevArrow?.let { arrow ->
            arrow.alpha = if (canGoPrev) 1f else 0.3f
            arrow.setOnClickListener {
                if (canGoPrev) {
                    month = month.minusMonths(1)
                    renderMonth()
                }
            }
        }
        nextArrow?.let { arrow ->
            arrow.alpha = if (canGoNext) 1f else 0.3f
            arrow.setOnClickListener {
                if (canGoNext) {
                    month = month.plusMonths(1)
                    renderMonth()
                }
            }
        }

        val firstOffset = month.atDay(1).dayOfWeek.value - 1 // 周一 = 0
        val days = month.lengthOfMonth()
        val weekRows = (firstOffset + days + 6) / 7
        var dayNumber = 1 - firstOffset
        repeat(weekRows) {
            val rowLayout = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
            repeat(7) {
                val cell = if (dayNumber in 1..days) {
                    dayCell(month.atDay(dayNumber))
                } else {
                    hostText(context, "", 15f, palette.hint)
                }
                rowLayout.addView(
                    cell,
                    LinearLayout.LayoutParams(0, dp(context, 42), 1f),
                )
                dayNumber++
            }
            container.addView(rowLayout)
        }
    }

    private fun dayCell(date: LocalDate): TextView {
        val blocked = (min != null && date.isBefore(min)) || (max != null && date.isAfter(max))
        val isPicked = date == picked
        val cell = hostText(
            context,
            date.dayOfMonth.toString(),
            15f,
            when {
                isPicked -> palette.onPrimary
                blocked -> palette.hint
                date == today -> palette.primary
                else -> palette.fieldText
            },
            bold = isPicked || date == today,
        ).apply {
            gravity = Gravity.CENTER
            if (isPicked) background = rounded(context, palette.primary, 12)
            if (blocked) alpha = 0.35f
        }
        if (!blocked) {
            cell.setOnClickListener {
                picked = date
                host?.setSubtitle(subtitleFor(picked))
                renderMonth()
            }
        }
        return cell
    }
}

/** `<input type="time">`：时/分两列滚动选择（0–23 / 0–59），选中行主色薄底 */
internal class TimePicker(
    context: Context,
    hour: Int,
    minute: Int,
    private val dialogTitle: String,
    private val subtitleFor: (Int, Int) -> String,
    private val onConfirm: (Int, Int) -> Unit,
    private val onCancel: () -> Unit,
) : FormPicker(context) {

    private class Column(
        val scroll: ScrollView,
        val rows: List<TextView>,
        val values: List<Int>,
    )

    private var hour = hour
    private var minute = minute
    private var palette: Palette = hostPalette(context)
    private var hourColumn: Column? = null
    private var minuteColumn: Column? = null

    override fun build(host: HostDialog) {
        palette = host.palette
        host.setTitle(dialogTitle)
        host.setSubtitle(subtitleFor(hour, minute))

        hourColumn = buildColumn((0..23).toList(), hour) { hour = it; repaint() }
        minuteColumn = buildColumn((0..59).toList(), minute) { minute = it; repaint() }
        val columns = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(columnBox("时", hourColumn!!), columnParams())
            addView(columnBox("分", minuteColumn!!), columnParams())
        }
        host.body.addView(columns)

        host.addPrimaryButton("确定") { onConfirm(hour, minute) }
        host.addGhostButton("取消") { onCancel() }
        host.setOnCancel(onCancel)
        host.setOnShown {
            hourColumn?.let { scrollToSelection(it, hour) }
            minuteColumn?.let { scrollToSelection(it, minute) }
        }
    }

    private fun columnParams() = LinearLayout.LayoutParams(
        0,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        1f,
    ).apply {
        marginStart = dp(context, 6)
        marginEnd = dp(context, 6)
    }

    private fun columnBox(label: String, column: Column): View = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        addView(hostText(context, label, 12f, palette.hint).apply { gravity = Gravity.CENTER })
        addView(column.scroll)
    }

    private fun buildColumn(values: List<Int>, selected: Int, onPick: (Int) -> Unit): Column {
        val content = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val rows = values.map { value ->
            hostText(context, format2(value), 15f, palette.fieldText).apply {
                gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dp(context, ROW_HEIGHT_DP),
                )
                setOnClickListener { onPick(value) }
            }
        }
        rows.forEach { content.addView(it) }
        val scroll = ScrollView(context).apply {
            isVerticalScrollBarEnabled = false
            addView(content)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(context, VISIBLE_ROWS * ROW_HEIGHT_DP),
            )
        }
        rows.forEachIndexed { index, row -> styleRow(row, values[index] == selected) }
        return Column(scroll, rows, values)
    }

    private fun styleRow(row: TextView, on: Boolean) {
        row.background = if (on) rounded(context, tint(palette.primary, 0.16f), 8) else null
        row.setTextColor(if (on) palette.primary else palette.fieldText)
        row.typeface = if (on) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }

    private fun repaint() {
        hourColumn?.let { column ->
            column.rows.forEachIndexed { index, row -> styleRow(row, column.values[index] == hour) }
        }
        minuteColumn?.let { column ->
            column.rows.forEachIndexed { index, row -> styleRow(row, column.values[index] == minute) }
        }
        host?.setSubtitle(subtitleFor(hour, minute))
    }

    private fun scrollToSelection(column: Column, value: Int) {
        val index = column.values.indexOf(value)
        if (index < 0) return
        column.scroll.post {
            val row = column.rows.getOrNull(index) ?: return@post
            val centered = row.top - (column.scroll.height - row.height) / 2
            column.scroll.scrollTo(0, centered.coerceAtLeast(0))
        }
    }

    private companion object {
        const val ROW_HEIGHT_DP = 40
        const val VISIBLE_ROWS = 5
    }
}

private fun format2(value: Int): String = String.format(java.util.Locale.US, "%02d", value)
