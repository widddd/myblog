package com.smartblog.app

import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.MediaController
import android.widget.TextView
import android.widget.VideoView

/**
 * 相册里的视频预览（点视频格进这里）。
 *
 * 与 `PhotoPreviewView` 分开是刻意的：那位是「左右滑翻张 + 双指缩放 + 进编辑器」的图片壳子，
 * 视频要的是播放控制（`VideoView` + `MediaController`），硬塞进去只会把两边都搞复杂。
 * **不引依赖**：播放器与控制条都用系统控件。
 *
 * 语义与图片预览对齐：「返回」= 回网格；「选择」= 勾上这段视频并直接确认。
 */
class VideoPreviewView(
    private val host: Activity,
    private val uri: Uri,
    bgColor: Int,
    fgColor: Int,
    subColor: Int,
    accentColor: Int,
    private val onBack: () -> Unit,
    private val onPick: () -> Unit,
) : FrameLayout(host) {

    private val player = VideoView(host)
    private val hint = TextView(host)

    init {
        setBackgroundColor(bgColor)
        addView(buildTopBar(fgColor, subColor, accentColor))

        val stage = FrameLayout(host)
        stage.addView(
            player,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.CENTER
            },
        )
        hint.apply {
            setTextColor(subColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            gravity = Gravity.CENTER
            visibility = View.GONE
        }
        stage.addView(
            hint,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.BOTTOM
                bottomMargin = dp(24)
                leftMargin = dp(24)
                rightMargin = dp(24)
            },
        )
        addView(
            stage,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT).apply {
                topMargin = dp(HEADER_DP)
            },
        )

        val controller = MediaController(host)
        controller.setAnchorView(player)
        player.setMediaController(controller)
        player.setVideoURI(uri)
        player.setOnPreparedListener { it.isLooping = false }
        player.setOnErrorListener { _, _, _ ->
            // 播不了（编码不支持/文件损坏）也要能退出去，别把用户困在这一页
            hint.text = "这段视频播不了，可以直接点右上角「选择」上传原文件"
            hint.visibility = View.VISIBLE
            true
        }
        player.start()
    }

    private fun buildTopBar(fgColor: Int, subColor: Int, accentColor: Int): View {
        val bar = LinearLayout(host).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), 0, dp(8), 0)
        }
        bar.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(HEADER_DP))

        val back = TextView(host).apply {
            text = "返回"
            setTextColor(subColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setOnClickListener { onBack() }
        }
        val title = TextView(host).apply {
            text = "视频预览"
            gravity = Gravity.CENTER
            setTextColor(fgColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        }
        val pick = TextView(host).apply {
            text = "选择"
            setTextColor(accentColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setOnClickListener { onPick() }
        }

        bar.addView(back)
        bar.addView(
            title,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
        )
        bar.addView(pick)
        return bar
    }

    /** 系统返回键：这一层收掉就返回 true（外层不再往上抛）。 */
    fun handleBack(): Boolean {
        onBack()
        return true
    }

    /** 从视图树上摘掉之前必须调：停播 + 解绑，否则离开后声音还在放。 */
    fun shutdown() {
        runCatching {
            player.stopPlayback()
            player.setMediaController(null)
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val HEADER_DP = 56
    }
}
