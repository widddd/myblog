package com.smartblog.app

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * 通知层：**前台轮询 + 后台巡检 + 本地通知**（路线 A，方案见 docs/android/push-plan.md）。
 *
 * 一次同步（`syncNow`）的顺序是刻意排的，每一步都在省下一次无用的网络请求：
 *  1. 开关关着 / 正在同步 → 直接返回；
 *  2. 没有站点地址 → 返回；
 *  3. 问 `/api/client/status`：**必须 `app:true`**（这一发确实是本站 App 发的），
 *     且 `admin` 不为真（管理员不收自己站点的推送，用户钦定）；
 *  4. 拉 `/api/feed/updates?since=<上次游标>`：没有 `since` 时**只建基线、不弹通知**
 *     （否则新装 App 会被一屏历史内容刷屏）；
 *  5. 过滤掉已提醒过的指纹 → 发通知（文章/瞬间两个渠道）→ 存新游标与新指纹。
 *
 * 线程模型：所有同步都跑在**单线程 executor** 上、串行执行（`syncRunning` 兜并发），
 * 状态读写走 `PushSettings`（SharedPreferences apply 是异步落盘，读的是内存值，线程安全）。
 *
 * 为什么不用常驻前台服务：那会在通知栏挂一条"常驻通知"，对一个个人博客太重。
 * 后台走 `AlarmManager`（见 `NotifyAlarmReceiver`），代价是 Doze 里可能十几分钟一次 —— 取舍写在方案里。
 */
object AppNotifier {

    private const val LOG_TAG = "SmartBlog"
    private const val UA = "SmartBlog-Android"

    /** 通知 ID 用指纹的哈希：同一条内容反复同步不会叠出多条通知。 */
    private const val NOTIFICATION_ID_MASK = 0x7fffffff

    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "smartblog-push")
    }

    @Volatile
    private var syncRunning = false

    @Volatile
    var foreground = false
        private set

    private var foregroundTimer: Runnable? = null

    // ---------------------------------------------------------------- 渠道与权限

    /**
     * 建两个渠道（文章 / 瞬间）：用户可以在系统设置里单独关掉一个。
     * 幂等 —— 每次 App 启动都调一次，改重要性/文案时老用户也会跟着更新。
     */
    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(
                PushRules.CHANNEL_POSTS,
                "新文章",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = "站点发布了新文章" },
        )
        manager.createNotificationChannel(
            NotificationChannel(
                PushRules.CHANNEL_MOMENTS,
                "新瞬间",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = "站点发布了新瞬间" },
        )
    }

    /**
     * Android 13+ 要运行时授权。**没有权限时不发通知也不报错**：开关照旧记着，
     * 用户在系统里补授权后下一轮就会开始提醒（不做"求着他开"的引导弹窗）。
     */
    fun canPostNotifications(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true
        }
        return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    // ---------------------------------------------------------------- 开关

    fun enabled(context: Context): Boolean = PushSettings.load(context).enabled

    fun backgroundEnabled(context: Context): Boolean =
        enabled(context) && PushSettings.load(context).background

    /** 页面前台/后台切换由 MainActivity 报进来（决定轮询频率与是否调度巡检）。 */
    fun onForegroundChanged(context: Context, isForeground: Boolean) {
        foreground = isForeground
        val store = context.applicationContext
        if (isForeground) {
            NotifyAlarmReceiver.cancel(store)
            startForegroundTimer(store)
            // 一回到前台就先同步一次：用户刚打开 App 时最希望看到"有什么新的"
            syncNow(store, background = false)
        } else {
            stopForegroundTimer()
            scheduleAlarm(store)
        }
    }

    private fun startForegroundTimer(context: Context) {
        if (foregroundTimer != null) {
            return
        }
        val handler = android.os.Handler(android.os.Looper.getMainLooper())
        val timer = object : Runnable {
            override fun run() {
                syncNow(context, background = false)
                handler.postDelayed(this, PushRules.FOREGROUND_INTERVAL_MS)
            }
        }
        foregroundTimer = timer
        handler.postDelayed(timer, PushRules.FOREGROUND_INTERVAL_MS)
    }

    private fun stopForegroundTimer() {
        val timer = foregroundTimer ?: return
        android.os.Handler(android.os.Looper.getMainLooper()).removeCallbacks(timer)
        foregroundTimer = null
    }

    fun setEnabled(context: Context, enabled: Boolean) {
        val store = context.applicationContext
        PushSettings.setEnabled(store, enabled)
        if (!enabled) {
            NotifyAlarmReceiver.cancel(store)
            PushSettings.setLastResult(store, "已关闭提醒")
        } else {
            ensureChannels(store)
            // 重新打开时**不重置游标**：关掉期间的内容不该补弹一屏，但"从现在起"要能接上
            syncNow(store, background = !foreground)
            if (!foreground) {
                scheduleAlarm(store)
            }
        }
    }

    fun setBackground(context: Context, background: Boolean) {
        val store = context.applicationContext
        PushSettings.setBackground(store, background)
        if (background && enabled(store) && !foreground) {
            scheduleAlarm(store)
        } else {
            NotifyAlarmReceiver.cancel(store)
        }
    }

    /** 页面导航时由 MainActivity 调用（决定"这个 App 是不是登录着后台"）。 */
    fun onNavigation(context: Context, url: String?) {
        val store = context.applicationContext
        val before = PushSettings.load(store).admin
        val after = PushRules.adminStateAfterNavigation(before, url)
        if (before != after) {
            PushSettings.setAdminMode(store, after)
            PushSettings.setLastResult(
                store,
                if (after) "检测到已登录后台：不再推送（管理员不看自己的推送）" else "提醒已恢复",
            )
            Log.i(LOG_TAG, "管理员态：$before → $after")
        }
    }

    /** 马上同步一次（后台线程；调用方不等结果）。 */
    fun syncNow(context: Context, background: Boolean) {
        val store = context.applicationContext
        if (syncRunning) {
            Log.i(LOG_TAG, "上一轮同步还没结束，跳过本轮")
            return
        }
        syncRunning = true
        executor.execute {
            try {
                sync(store, background)
            } catch (error: Exception) {
                Log.w(LOG_TAG, "同步失败", error)
                PushSettings.setLastResult(store, "同步失败：${error.message ?: error.javaClass.simpleName}")
            } finally {
                syncRunning = false
            }
        }
    }

    // ---------------------------------------------------------------- 同步

    private fun sync(context: Context, background: Boolean) {
        if (!enabled(context)) {
            return
        }
        val origin = siteOrigin(context)
        if (origin == null) {
            PushSettings.setLastResult(context, "还没设置站点地址")
            return
        }
        val timeout = if (background) PushRules.TIMEOUT_BACKGROUND_MS else PushRules.TIMEOUT_FOREGROUND_MS

        // 第一步：这一发是谁（必须 app=true；管理员直接停）
        val status = fetchJson("$origin/api/client/status", timeout) ?: run {
            PushSettings.setLastResult(context, "连不上站点")
            return
        }
        val appFlag = status.optBoolean("app", false)
        val adminOnServer = status.optBoolean("admin", false)
        val adminLocal = PushSettings.load(context).admin
        if (!PushRules.mayNotify(appFlag, adminOnServer || adminLocal)) {
            val why = when {
                adminOnServer || adminLocal -> "已登录后台：管理员不收自己的推送"
                else -> "当前地址不是本 App 绑定的站点，不推送"
            }
            PushSettings.setLastResult(context, why)
            return
        }

        // 第二步：增量内容
        val cursor = PushRules.usableCursor(PushSettings.load(context).cursor)
        val query = if (cursor == null) "?limit=${PushRules.FEED_LIMIT}"
        else "?limit=${PushRules.FEED_LIMIT}&since=${Uri.encode(cursor)}"
        val body = fetchText("$origin/api/feed/updates$query", timeout) ?: run {
            PushSettings.setLastResult(context, "取更新失败")
            return
        }
        val delta = PushRules.parseDelta(body)
        val baselineJustSet = cursor == null
        val state = PushSettings.load(context)
        val toNotify = PushRules.newItemsToNotify(
            delta = delta.items,
            notified = state.notified,
            baselineJustSet = baselineJustSet,
            allowNotify = PushRules.mayNotify(appFlag, adminOnServer || adminLocal),
        )

        if (!canPostNotifications(context) && toNotify.isNotEmpty()) {
            PushSettings.setLastResult(context, "有 ${toNotify.size} 条新内容，但没有通知权限")
        } else {
            toNotify.forEach { notify(context, it) }
        }

        val nextCursor = PushRules.usableCursor(delta.nextCursor) ?: cursor
        PushSettings.setCursor(context, nextCursor)
        PushSettings.setNotified(
            context,
            PushRules.mergeNotified(state.notified, delta.items.map { it.fingerprint }),
        )
        PushSettings.setLastResult(
            context,
            when {
                baselineJustSet -> "已建立基线（从现在起有新内容会提醒）"
                toNotify.isEmpty() -> "没有新内容"
                else -> "已提醒 ${toNotify.size} 条"
            },
        )
        Log.i(
            LOG_TAG,
            "同步完成：新条目=${delta.items.size} 提醒=${toNotify.size} 基线=$baselineJustSet",
        )
    }

    /** 站点 origin：只取 scheme://host:port（口径与 MainActivity / AppUrl.originOf 共用）。 */
    private fun siteOrigin(context: Context): String? = AppUrl.originOf(
        context
            .getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
            .getString(MainActivity.KEY_SITE_URL, null),
    )

    private fun fetchJson(url: String, timeout: Int): JSONObject? =
        fetchText(url, timeout)?.let { runCatching { JSONObject(it) }.getOrNull() }

    private fun fetchText(url: String, timeout: Int): String? {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = timeout
            readTimeout = timeout
            requestMethod = "GET"
            // 站点用它认出"这一发来自 App"（/api/client/status 的 app 字段）；
            // 与 GeckoView 会话那份 UA 是两套，宿主自己的请求一直用 Dalvik 默认值，这里显式带上。
            setRequestProperty("User-Agent", UA)
            setRequestProperty("Accept", "application/json")
        }
        return try {
            if (connection.responseCode != 200) {
                Log.i(LOG_TAG, "请求 $url 返回 ${connection.responseCode}")
                null
            } else {
                connection.inputStream.bufferedReader().use { it.readText() }
            }
        } finally {
            connection.disconnect()
        }
    }

    // ---------------------------------------------------------------- 发通知

    private fun notify(context: Context, item: NotifyItem) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val origin = siteOrigin(context) ?: return
        val url = PushRules.absoluteUrl(origin, item.href)

        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(url)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        // requestCode 用指纹哈希：不同文章各自一条 PendingIntent（同一个 requestCode 会互相覆盖 extras）
        val pending = PendingIntent.getActivity(
            context,
            item.fingerprint.hashCode() and NOTIFICATION_ID_MASK,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = Notification.Builder(
            context,
            if (item.kind == NotifyItem.Kind.POST) PushRules.CHANNEL_POSTS else PushRules.CHANNEL_MOMENTS,
        )
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(item.title)
            .setContentText(item.text)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setWhen(System.currentTimeMillis())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setStyle(Notification.BigTextStyle().bigText(item.text))
        }
        manager.notify(item.fingerprint.hashCode() and NOTIFICATION_ID_MASK, builder.build())
    }

    // ---------------------------------------------------------------- 后台巡检

    /**
     * 调度下一次后台巡检。
     *
     * 用 `setAndAllowWhileIdle()`：**不需要** `SCHEDULE_EXACT_ALARM` 权限，
     * 但系统会把唤醒合并到维护窗口（Doze 里可能十几分钟）。后台巡检**一次只排一次**
     * （fire-and-reschedule），所以"改间隔"不用去取消旧闹钟，重启后也能自愈
     * （`BOOT_COMPLETED` 里再排一次即可）。
     */
    fun scheduleAlarm(context: Context) {
        if (!backgroundEnabled(context)) {
            return
        }
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val pending = NotifyAlarmReceiver.pendingIntent(context)
        val at = System.currentTimeMillis() + PushRules.BACKGROUND_INTERVAL_MS
        runCatching {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
            Log.i(LOG_TAG, "已排下一次后台巡检：${PushRules.BACKGROUND_INTERVAL_MS / 1000}s 后")
        }.onFailure {
            // 个别 ROM 会因省电策略拒绝；退回普通闹钟（精度差但不会完全不工作）
            Log.w(LOG_TAG, "后台巡检排程失败，退回 set()", it)
            alarmManager.set(AlarmManager.RTC_WAKEUP, at, pending)
        }
    }

    /** 后台巡检实际执行：拿一次网络唤醒锁（超时兜底），同步完再排下一次。 */
    fun runBackgroundSync(context: Context) {
        if (!backgroundEnabled(context)) {
            return
        }
        val power = context.getSystemService(PowerManager::class.java)
        val lock = power?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "smartblog:push")?.apply {
            // 超时兜底：网络卡住时不能一直攥着唤醒锁
            acquire(60_000L)
        }
        try {
            syncNow(context, background = true)
        } finally {
            runCatching { lock?.takeIf { it.isHeld }?.release() }
            scheduleAlarm(context)
        }
    }
}
