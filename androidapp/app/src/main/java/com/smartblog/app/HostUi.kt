package com.smartblog.app

import android.app.Dialog
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.min

/**
 * 宿主的统一视觉语言（**单一事实源**）。
 *
 * 地址表单、开屏、自有相册、下拉框与日期时间的原生弹层，全部从这里取色值、圆角、字号、按钮高度。
 * 理由很实际：之前弹层用的是系统 `AlertDialog` / `DatePickerDialog` 那套（蓝头 + 全大写按钮 + 系统强调色），
 * 混在站点界面里一眼就出戏；把样式集中在这里，改一处四处一起变，不会再各自漂移。
 *
 * ⚠️ 深浅色看 `resources.configuration.uiMode`；清单里声明了 `uiMode` 由 Activity 自己处理（不重建），
 * 所以**每次都重新取一次 [hostPalette]**（弹层在 show 时取），主题切换后下一个弹层就是新配色。
 */
internal data class Palette(
    /** 卡片/弹层表面（深色下比全屏底色亮一档，否则卡片在暗背景上看不出边界） */
    val surface: Int,
    /** 全屏底色：地址表单、开屏 */
    val background: Int,
    val title: Int,
    val hint: Int,
    val fieldBg: Int,
    val fieldText: Int,
    val primary: Int,
    val onPrimary: Int,
    val ghost: Int,
)

internal fun isNightMode(context: Context): Boolean =
    (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES

internal fun hostPalette(context: Context): Palette =
    if (isNightMode(context)) {
        Palette(
            surface = Color.parseColor("#1A1E24"),
            background = Color.parseColor("#0E1013"),
            title = Color.parseColor("#F4F5F7"),
            hint = Color.parseColor("#8C939C"),
            fieldBg = Color.parseColor("#1B1E23"),
            fieldText = Color.parseColor("#F4F5F7"),
            primary = Color.parseColor("#4C9BF5"),
            onPrimary = Color.parseColor("#0B1119"),
            ghost = Color.parseColor("#9BA2AB"),
        )
    } else {
        Palette(
            surface = Color.parseColor("#FFFFFF"),
            background = Color.parseColor("#FFFFFF"),
            title = Color.parseColor("#14171B"),
            hint = Color.parseColor("#6B7280"),
            fieldBg = Color.parseColor("#F3F4F6"),
            fieldText = Color.parseColor("#14171B"),
            primary = Color.parseColor("#2C7BE5"),
            onPrimary = Color.parseColor("#FFFFFF"),
            ghost = Color.parseColor("#4B5563"),
        )
    }

internal fun dp(context: Context, value: Int): Int =
    (value * context.resources.displayMetrics.density).toInt()

/** 主色的半透明版本：选中态的浅底。深色下也只是一层薄雾，不会糊成一块。 */
internal fun tint(color: Int, alpha: Float): Int = Color.argb(
    (255 * alpha).toInt().coerceIn(0, 255),
    Color.red(color),
    Color.green(color),
    Color.blue(color),
)

internal fun rounded(
    context: Context,
    color: Int,
    radiusDp: Int,
    strokeColor: Int? = null,
    strokeDp: Int = 0,
): GradientDrawable = GradientDrawable().apply {
    cornerRadius = dp(context, radiusDp).toFloat()
    setColor(color)
    if (strokeColor != null && strokeDp > 0) setStroke(dp(context, strokeDp), strokeColor)
}

internal fun hostText(
    context: Context,
    text: String = "",
    sizeSp: Float,
    color: Int,
    bold: Boolean = false,
): TextView = TextView(context).apply {
    this.text = text
    setTextColor(color)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    if (bold) typeface = Typeface.DEFAULT_BOLD
}

internal fun hostPrimaryButton(
    context: Context,
    palette: Palette,
    text: String,
    heightDp: Int = 48,
): Button = Button(context).apply {
    this.text = text
    isAllCaps = false
    setTextColor(palette.onPrimary)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    background = rounded(context, palette.primary, 10)
    layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        dp(context, heightDp),
    )
}

internal fun hostGhostButton(
    context: Context,
    palette: Palette,
    text: String,
    heightDp: Int = 44,
): Button = Button(context).apply {
    this.text = text
    isAllCaps = false
    setTextColor(palette.ghost)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    background = rounded(context, Color.TRANSPARENT, 10)
    layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        dp(context, heightDp),
    )
}

/**
 * 弹层外壳：居中圆角卡片 + 系统变暗背板，**不用 `AlertDialog`**（那套 header 色带与全大写按钮就是"出戏"的来源）。
 *
 * 卡片里的排版与地址表单同一套：标题 17sp 粗体 → 说明 13sp → 内容 → 主按钮 → 幽灵按钮，
 * 圆角 18/10、内边距 18、按钮 48/44 —— 值都来自本文件，不在这里另写一套字面量。
 */
internal class HostDialog(private val context: Context, val palette: Palette) {

    private val dialog = Dialog(context)
    private val titleView = hostText(context, sizeSp = 17f, color = palette.title, bold = true)
    private val subtitleView = hostText(context, sizeSp = 13f, color = palette.hint).apply {
        setPadding(0, dp(context, 6), 0, 0)
        visibility = LinearLayout.GONE
    }
    private val actions = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(context, 6), 0, 0)
    }

    /** 卡片正文（列表 / 日历 / 时间列都往这里塞） */
    val body = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(context, 14), 0, dp(context, 2))
    }

    private var cancelListener: (() -> Unit)? = null
    private var shownListener: (() -> Unit)? = null

    init {
        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(context, 18), dp(context, 18), dp(context, 18), dp(context, 16))
            background = rounded(context, palette.surface, 18)
            addView(titleView)
            addView(subtitleView)
            addView(body)
            addView(actions)
        }
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        dialog.setContentView(card)
        dialog.setCanceledOnTouchOutside(true)
        dialog.setOnCancelListener { cancelListener?.invoke() }
        dialog.window?.let { window ->
            window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            val attrs = window.attributes
            attrs.gravity = Gravity.CENTER
            attrs.dimAmount = 0.45f
            window.attributes = attrs
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        }
    }

    fun setTitle(text: String) {
        titleView.text = text
    }

    fun setSubtitle(text: String?) {
        subtitleView.text = text.orEmpty()
        subtitleView.visibility = if (text.isNullOrBlank()) LinearLayout.GONE else LinearLayout.VISIBLE
    }

    /** 底部按钮：与地址表单同款（主按钮实心、取消留白），竖排堆叠 */
    fun addPrimaryButton(text: String, onClick: () -> Unit): Button {
        val button = hostPrimaryButton(context, palette, text)
        button.setOnClickListener { onClick() }
        actions.addView(button)
        return button
    }

    fun addGhostButton(text: String, onClick: () -> Unit): Button {
        val button = hostGhostButton(context, palette, text)
        button.layoutParams = (button.layoutParams as LinearLayout.LayoutParams).apply {
            topMargin = dp(context, 4)
        }
        button.setOnClickListener { onClick() }
        actions.addView(button)
        return button
    }

    fun setOnCancel(block: () -> Unit) {
        cancelListener = block
    }

    /** 卡片显示之后的回调（滚动条定位这类要在布局完成后做） */
    fun setOnShown(block: () -> Unit) {
        shownListener = block
    }

    fun show() {
        dialog.show()
        dialog.window?.setLayout(cardWidth(), ViewGroup.LayoutParams.WRAP_CONTENT)
        shownListener?.invoke()
    }

    fun dismiss() {
        dialog.dismiss()
    }

    /** 宽度对齐地址表单的观感：左右各留 28dp，平板/桌面模式下不超过 400dp */
    private fun cardWidth(): Int {
        val screen = context.resources.displayMetrics.widthPixels
        return min(screen - dp(context, 56), dp(context, 400))
    }
}
