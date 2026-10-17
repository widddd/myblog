package com.smartblog.app

import android.content.Context
import android.util.Log
import android.widget.Toast
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.temporal.WeekFields
import java.util.Locale
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSession.PromptDelegate.ChoicePrompt.Type as GvChoiceType
import org.mozilla.geckoview.GeckoSession.PromptDelegate.DateTimePrompt.Type as GvDateTimeType

internal typealias GvPromptResponse = GeckoSession.PromptDelegate.PromptResponse
internal typealias GvBasePrompt = GeckoSession.PromptDelegate.BasePrompt
internal typealias GvChoicePrompt = GeckoSession.PromptDelegate.ChoicePrompt
internal typealias GvChoice = GeckoSession.PromptDelegate.ChoicePrompt.Choice
internal typealias GvDateTimePrompt = GeckoSession.PromptDelegate.DateTimePrompt

/**
 * `<select>` 与 `<input type="date|time|datetime-local|month|week">` 的宿主实现。
 *
 * **Gecko 自己画不出这两类控件**——它把用户点击变成 prompt 交给宿主（Gecko 源码
 * `modules/GeckoViewPrompt.sys.mjs`：`_handleSelect` → `{type:"choice"}`、
 * `_handleDateTime` → `{type:"datetime"}`，两者最后都落到 `PromptDelegate`）。
 * 宿主不接管时 prompt 永远悬着，表现就是「点了没反应 / 控件不正常」，
 * 跟 CSS、跟布局都无关。同理，`onFilePrompt` 不接管时上传没反应（见 architecture.md §6b）。
 *
 * 本文件只管「prompt → 哪一屏选择器 → 何时回填」；**长什么样全在 [HostUi] / [PickerViews]**
 * —— 与「请输入网站地址」那套表单同一份色板与按钮规范，并跟随系统深浅色。
 *
 * 一个实例对应一个 prompt：页面自己把这个 prompt 收掉时（`onPromptDismiss`），
 * 靠 [closeOpenDialog] 把已经弹出来的选择器一并关掉。
 */
internal class FormPrompts(private val context: Context) {

    private companion object {
        const val LOG_TAG = "SmartBlog"
    }

    /** 当前挂在屏幕上的那一屏选择器（datetime-local 会在"选日期→选时间"之间换屏，换完重新登记） */
    private var active: FormPicker? = null

    /** prompt 已被页面收掉：关掉选择器，不要再 confirm */
    fun closeOpenDialog() {
        active?.dismiss()
        active = null
    }

    /**
     * 系统深浅色变了：把挂着的选择器按新配色重画一遍。
     * 清单里 `uiMode` 由 Activity 自己处理（不重建），不主动重画的话，切换主题后
     * 已经打开的选择器会一直是旧配色 —— 那就不叫"跟随系统"了。
     */
    fun applyTheme() {
        active?.show()
    }

    // ---------------------------------------------------------------- 下拉框 / 列表

    fun showChoice(prompt: GvChoicePrompt, result: GeckoResult<GvPromptResponse>) {
        val rows = flattenChoices(prompt.choices)
        if (rows.isEmpty()) {
            Log.i(LOG_TAG, "下拉框没有可选项，直接撤销")
            cancel(prompt, result)
            return
        }
        val picker = ChoicePicker(
            context = context,
            rows = rows,
            multi = prompt.type == GvChoiceType.MULTIPLE,
            dialogTitle = prompt.title?.takeIf { it.isNotBlank() } ?: "请选择",
            onPicked = { choices -> confirm(prompt, result) { prompt.confirm(choices) } },
            onCancel = { cancel(prompt, result) },
        )
        active = picker
        picker.show()
    }

    // ---------------------------------------------------------------- 日期 / 时间

    fun showDateTime(prompt: GvDateTimePrompt, result: GeckoResult<GvPromptResponse>) {
        Log.i(
            LOG_TAG,
            "onDateTimePrompt type=${prompt.type} value=${prompt.defaultValue} " +
                "min=${prompt.minValue} max=${prompt.maxValue} step=${prompt.stepValue}",
        )
        DateTimeFlow(prompt, result).show()
    }

    /**
     * 日期时间的流程状态：`datetime-local` 是「先选日期、再选时间」两屏，
     * 状态（已选日期 / 已选时间 / 走到哪一步）留在这里，所以换屏与深浅色重画都不会丢选择。
     */
    private inner class DateTimeFlow(
        private val prompt: GvDateTimePrompt,
        private val result: GeckoResult<GvPromptResponse>,
    ) {

        private val value = prompt.defaultValue.orEmpty()
        private val minDate = parseDate(prompt.minValue)
        private val maxDate = parseDate(prompt.maxValue)
        private val minDateTime = parseDateTime(prompt.minValue)
        private val maxDateTime = parseDateTime(prompt.maxValue)
        private val initial = parseDateTime(value) ?: LocalDateTime.now()

        private var date: LocalDate =
            parseDate(value) ?: parseMonth(value) ?: parseWeek(value) ?: initial.toLocalDate()
        private var time: LocalTime = parseTime(value) ?: initial.toLocalTime()

        /** `datetime-local` 用：0 = 选日期，1 = 选时间 */
        private var step = 0

        fun show() {
            active?.dismiss()
            val picker = build()
            active = picker
            picker.show()
        }

        private fun build(): FormPicker = when (prompt.type) {
            GvDateTimeType.DATE -> CalendarPicker(
                context = context,
                initial = date,
                today = LocalDate.now(),
                min = minDate,
                max = maxDate,
                dialogTitle = "选择日期",
                confirmLabel = "确定",
                subtitleFor = ::formatDateCn,
                onConfirm = { picked ->
                    confirm(prompt, result) { prompt.confirm(picked.toString()) }
                },
                onCancel = { cancel(prompt, result) },
            )

            GvDateTimeType.TIME -> TimePicker(
                context = context,
                hour = time.hour,
                minute = time.minute,
                dialogTitle = "选择时间",
                subtitleFor = { hour, minute -> "${format2(hour)}:${format2(minute)}" },
                onConfirm = { hour, minute ->
                    confirm(prompt, result) { prompt.confirm("${format2(hour)}:${format2(minute)}") }
                },
                onCancel = { cancel(prompt, result) },
            )

            GvDateTimeType.DATETIME_LOCAL -> if (step == 0) {
                CalendarPicker(
                    context = context,
                    initial = date,
                    today = LocalDate.now(),
                    min = minDate,
                    max = maxDate,
                    dialogTitle = "选择日期",
                    confirmLabel = "下一步",
                    subtitleFor = ::formatDateCn,
                    onConfirm = { picked ->
                        date = picked
                        step = 1
                        show()
                    },
                    onCancel = { cancel(prompt, result) },
                )
            } else {
                TimePicker(
                    context = context,
                    hour = time.hour,
                    minute = time.minute,
                    dialogTitle = "选择时间",
                    subtitleFor = { hour, minute ->
                        "${formatDateCn(date)} · ${format2(hour)}:${format2(minute)}"
                    },
                    onConfirm = { hour, minute ->
                        time = LocalTime.of(hour, minute)
                        finishDateTime()
                    },
                    onCancel = { cancel(prompt, result) },
                )
            }

            GvDateTimeType.MONTH -> CalendarPicker(
                context = context,
                initial = date,
                today = LocalDate.now(),
                min = minDate,
                max = maxDate,
                dialogTitle = "选择月份",
                confirmLabel = "确定",
                subtitleFor = { picked -> "${picked.year}年${picked.monthValue}月" },
                onConfirm = { picked ->
                    confirm(prompt, result) { prompt.confirm(YearMonth.from(picked).toString()) }
                },
                onCancel = { cancel(prompt, result) },
            )

            GvDateTimeType.WEEK -> CalendarPicker(
                context = context,
                initial = date,
                today = LocalDate.now(),
                min = minDate,
                max = maxDate,
                dialogTitle = "选择周",
                confirmLabel = "确定",
                subtitleFor = { picked -> "${formatWeek(picked)} · ${formatDateCn(picked)}" },
                onConfirm = { picked ->
                    confirm(prompt, result) { prompt.confirm(formatWeek(picked)) }
                },
                onCancel = { cancel(prompt, result) },
            )

            else -> {
                Log.w(LOG_TAG, "不认识的日期时间类型 ${prompt.type}，撤销")
                cancel(prompt, result)
                IdlePicker(context)
            }
        }

        /**
         * `<input datetime-local>` 常带 min（如"预约时间不得早于现在"）：日期已经卡住下限，
         * 但**同一天的更早时刻**要在这里收口 —— 静默放过去会让表单进入 HTML 判定无效的状态，
         * 用户还找不到原因。收敛到边界时弹 Toast 说明，不静默改用户输入。
         */
        private fun finishDateTime() {
            val picked = LocalDateTime.of(date, time)
            val clamped = when {
                minDateTime != null && picked.isBefore(minDateTime) -> minDateTime
                maxDateTime != null && picked.isAfter(maxDateTime) -> maxDateTime
                else -> null
            }
            if (clamped != null) {
                Log.i(LOG_TAG, "所选时刻超出 min/max，已收敛到 $clamped")
                Toast.makeText(
                    context,
                    "已调整为 ${clamped.toLocalDate()} ${format2(clamped.hour)}:${format2(clamped.minute)}",
                    Toast.LENGTH_SHORT,
                ).show()
            }
            val finalValue = clamped ?: picked
            confirm(prompt, result) {
                prompt.confirm(
                    "${finalValue.toLocalDate()}T${format2(finalValue.hour)}:${format2(finalValue.minute)}",
                )
            }
        }
    }

    // ---------------------------------------------------------------- 收口

    /**
     * 结果只在 prompt 还没被页面收掉时投递：页面可能已经 dismiss（例如 datetime 的
     * `MozCloseDateTimePicker`），这时候再 confirm 一个已完成的 prompt 没有意义。
     */
    private fun confirm(
        prompt: GvBasePrompt,
        result: GeckoResult<GvPromptResponse>,
        response: () -> GvPromptResponse,
    ) {
        if (!deliverable(prompt)) return
        // 选中即收屏（单选列表点一下就回填），别让卡片留在屏幕上
        active?.dismiss()
        active = null
        result.complete(response())
    }

    private fun cancel(prompt: GvBasePrompt, result: GeckoResult<GvPromptResponse>) {
        if (!deliverable(prompt)) return
        active?.dismiss()
        active = null
        result.complete(prompt.dismiss())
    }

    private fun deliverable(prompt: GvBasePrompt): Boolean {
        if (prompt.isComplete) {
            Log.i(LOG_TAG, "prompt 已被页面收掉，本次结果丢弃")
            closeOpenDialog()
            return false
        }
        return true
    }
}

/** 认不出的 prompt 类型：什么都不显示，只保证 `active` 有值可收 */
private class IdlePicker(context: Context) : FormPicker(context) {
    override fun build(host: HostDialog) = Unit
}

// ---------------------------------------------------------------- 值解析 / 格式化

private val WEEKDAY_CN = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")

private fun format2(value: Int): String = String.format(Locale.US, "%02d", value)

private fun formatDateCn(date: LocalDate): String =
    "${date.year}年${date.monthValue}月${date.dayOfMonth}日 ${WEEKDAY_CN[date.dayOfWeek.value - 1]}"

/** 周输入的规范值是 `yyyy-Www` */
private fun formatWeek(date: LocalDate): String {
    val fields = WeekFields.ISO
    return String.format(
        Locale.US,
        "%04d-W%02d",
        date.get(fields.weekBasedYear()),
        date.get(fields.weekOfWeekBasedYear()),
    )
}

private fun parseDate(value: String?): LocalDate? =
    value?.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

private fun parseTime(value: String?): LocalTime? =
    value?.takeIf { it.isNotBlank() }?.let { runCatching { LocalTime.parse(it) }.getOrNull() }

private fun parseDateTime(value: String?): LocalDateTime? =
    value?.takeIf { it.isNotBlank() }?.let {
        // datetime-local 允许只到分钟，也允许带秒；LocalDateTime.parse 两者都能吃
        runCatching { LocalDateTime.parse(it) }.getOrNull()
    }

private fun parseMonth(value: String?): LocalDate? =
    value?.takeIf { it.isNotBlank() }?.let {
        runCatching { YearMonth.parse(it).atDay(1) }.getOrNull()
    }

/** 周输入的规范值是 `yyyy-Www`；补一个 ISO 星期几就能解析成日期 */
private fun parseWeek(value: String?): LocalDate? =
    value?.takeIf { it.isNotBlank() }?.let {
        runCatching { LocalDate.parse("$it-1", DateTimeFormatter.ISO_WEEK_DATE) }.getOrNull()
    }
