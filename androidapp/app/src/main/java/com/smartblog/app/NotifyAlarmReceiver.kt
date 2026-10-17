package com.smartblog.app

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 后台巡检的闹钟接收器 + 开机/升级后重新排程。
 *
 * 三件事都由它收口（**不要在别处再排一次**）：
 *  - `ALARM`：醒来做一次同步（`AppNotifier.runBackgroundSync` 结束后会再排下一次）；
 *  - `BOOT_COMPLETED` / `MY_PACKAGE_REPLACED`：手机重启或 App 升级后闹钟会丢，重新排。
 *
 * ⚠️ 用 `setAndAllowWhileIdle()` 而不是精确闹钟：前者**不需要** `SCHEDULE_EXACT_ALARM`
 * 权限（Android 12+ 那是个特殊权限，个人博客 App 不该要），代价是 Doze 里可能被推迟。
 * 取舍与"为什么不上常驻前台服务"写在 docs/android/push-plan.md。
 */
class NotifyAlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val LOG_TAG = "SmartBlog"
        private const val ACTION_SYNC = "com.smartblog.app.PUSH_SYNC"
        private const val REQUEST_CODE = 4201

        fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            Intent(context, NotifyAlarmReceiver::class.java).setAction(ACTION_SYNC),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        /** 取消已排的巡检（用户关掉提醒或关掉后台巡检时调）。 */
        fun cancel(context: Context) {
            val alarmManager = context.getSystemService(android.app.AlarmManager::class.java) ?: return
            alarmManager.cancel(pendingIntent(context))
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val appContext = context.applicationContext
        Log.i(LOG_TAG, "后台巡检唤醒：${intent.action}")
        // 开机的第三件事：渠道要重建（进程刚起来，渠道不一定还在系统里）
        AppNotifier.ensureChannels(appContext)
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
                if (AppNotifier.backgroundEnabled(appContext)) {
                    AppNotifier.scheduleAlarm(appContext)
                    AppNotifier.syncNow(appContext, background = true)
                }
            }

            else -> AppNotifier.runBackgroundSync(appContext)
        }
    }
}
