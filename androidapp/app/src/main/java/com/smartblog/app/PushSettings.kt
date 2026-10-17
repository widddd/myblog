package com.smartblog.app

import android.content.Context
import org.json.JSONArray

/**
 * 通知层的持久化状态。**与站点地址共用同一个 `smartblog` 偏好文件**（`MainActivity.PREFS_NAME`）：
 * 一个 App 只有一份"我的站点 + 我的通知设置"，分文件只会让"清数据"少清一半。
 *
 * 这里只做读写，不含任何判定逻辑（判定在 `PushRules`，那部分有 JVM 单测）。
 */
object PushSettings {

    const val KEY_ENABLED = "push_enabled"
    const val KEY_BACKGROUND = "push_background"
    const val KEY_CURSOR = "push_cursor"
    const val KEY_NOTIFIED = "push_notified"
    const val KEY_ADMIN_MODE = "push_admin_mode"
    private const val KEY_LAST_RESULT = "push_last_result"

    data class State(
        /** 主开关：用户是否要这个 App 弹"我的博客更新了"。 */
        val enabled: Boolean,
        /** 后台巡检开关：关掉就只在 App 可见时轮询（不申请任何后台权限）。 */
        val background: Boolean,
        /** 服务端给的时间游标；null = 还没建基线（下一轮只建基线、不弹通知）。 */
        val cursor: String?,
        /** 已提醒过的指纹（防重复；只保留 `PushRules.NOTIFIED_MEMORY` 条）。 */
        val notified: List<String>,
        /** 管理员态（在 App 里登录过后台）→ 一条都不推，用户钦定。 */
        val admin: Boolean,
    )

    private fun prefs(context: Context) =
        context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)

    fun load(context: Context): State {
        val store = prefs(context)
        return State(
            // ⚠️ 默认开、后台巡检默认开：用户装了 App 就是想让"有人更新"能找到他，
            // 而权限申请（POST_NOTIFICATIONS）另有系统弹窗，不会静默打扰（Android 13+ 装完默认拒）。
            enabled = store.getBoolean(KEY_ENABLED, true),
            background = store.getBoolean(KEY_BACKGROUND, true),
            cursor = store.getString(KEY_CURSOR, null)?.takeIf { it.isNotBlank() },
            notified = readNotified(store.getString(KEY_NOTIFIED, null)),
            admin = store.getBoolean(KEY_ADMIN_MODE, false),
        )
    }

    fun setEnabled(context: Context, enabled: Boolean) =
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()

    fun setBackground(context: Context, background: Boolean) =
        prefs(context).edit().putBoolean(KEY_BACKGROUND, background).apply()

    fun setCursor(context: Context, cursor: String?) =
        prefs(context).edit().apply {
            if (cursor.isNullOrBlank()) remove(KEY_CURSOR) else putString(KEY_CURSOR, cursor)
        }.apply()

    fun setNotified(context: Context, fingerprints: List<String>) =
        prefs(context).edit().putString(KEY_NOTIFIED, writeNotified(fingerprints)).apply()

    fun setAdminMode(context: Context, admin: Boolean) =
        prefs(context).edit().putBoolean(KEY_ADMIN_MODE, admin).apply()

    /** 上一轮结果（人话）：给「消息提醒」页面看"为什么没提醒"。 */
    fun setLastResult(context: Context, text: String) =
        prefs(context).edit().putString(KEY_LAST_RESULT, text).apply()

    fun lastResult(context: Context): String =
        prefs(context).getString(KEY_LAST_RESULT, "还没同步过") ?: "还没同步过"

    // 指纹列表用 JSON 数组存（与站点侧其余 JSON 字段一致），并对坏值宽容：
    // 解析不出来就当"没记过"——最多多推一条，不能因为一个坏字符串让通知层整个不工作。
    private fun readNotified(raw: String?): List<String> {
        if (raw.isNullOrBlank()) {
            return emptyList()
        }
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { array.optString(it).takeIf { s -> s.isNotBlank() } }
        }.getOrDefault(emptyList())
    }

    private fun writeNotified(list: List<String>): String =
        JSONArray().apply { list.forEach { put(it) } }.toString()
}
