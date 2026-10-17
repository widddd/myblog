package com.smartblog.app

import android.Manifest
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.text.InputType
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.GeckoView
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * 单 Activity 的 GeckoView 宿主。
 *
 * 不引 AppCompat / Material / Compose：界面用系统原生控件在代码里搭，保持依赖面只有
 * GeckoView + androidx.activity（见 docs/android/build.md 的依赖取舍）。
 *
 * 三件事在这里定：
 *  1. **首次启动直接进默认站点**（`AppUrl.DEFAULT_SITE_URL`，用户决策 2026-10-03），
 *     不再弹"请输入网站地址"；`BuildConfig.START_URL` 是构建期覆盖手段（模拟器开发用），
 *     地址仍可从右下角 ⋮ →「修改网站地址」随时改 —— 规则全在 `AppUrl.kt`（纯逻辑，有单测）。
 *  2. **刷新**在同一处入口。
 *  3. 页面自身没有地址栏，所以返回键语义要在这里兜住（能后退就后退，否则退出）。
 */
class MainActivity : ComponentActivity() {

    companion object {
        internal const val PREFS_NAME = "smartblog"

        /**
         * 站点地址（站点地址与通知设置共用这一个偏好文件）。
         * `internal` 而不是 private：`AppNotifier` / `PushSettings` 要读同一个文件
         * —— 一个 App 只有一份"我的站点 + 我的设置"，分文件只会让"清数据"少清一半。
         */
        internal const val KEY_SITE_URL = "site_url"
        private const val LOG_TAG = "SmartBlog"

        /** 服务端没给上限时的兜底值；正常由 GET /api/upload/limits 决定 */
        private const val DEFAULT_MAX_IMAGES = 9

        /**
         * 站点单文件上限的兜底值（10MB）。
         * 与 `lib/upload/limits.ts` 的 `resolveUploadMaxBytes()` 默认值同口径：取不到接口时
         * 视频压缩就往 10MB 以内压，总比不压强（真值仍由 `/api/upload/limits` 的 `maxBytes` 覆盖）。
         */
        private const val DEFAULT_MAX_BYTES = 10L * 1024 * 1024

        /** 服务端报上来的单文件上限只认到这个量级；再大说明接口被人改了，宁可不认 */
        private const val MAX_SERVER_BYTES = 200L * 1024 * 1024

        /** 开屏：至少显示这么久（免得一闪而过），最多挡这么久（页面起不来也不卡死） */
        private const val SPLASH_MIN_MS = 1200L
        private const val SPLASH_MAX_MS = 6000L

        /** 所选文件的临时副本目录（content:// 要落成真实文件才能交给 Gecko，见 toFileUri） */
        private const val PICKED_DIR = "picked"
        private const val MENU_BACK = 0
        private const val MENU_RELOAD = 1
        private const val MENU_EDIT_URL = 2
        private const val MENU_NOTIFY_SETTINGS = 3
        private const val MENU_NOTIFY_TOGGLE = 4
        private const val MENU_NOTIFY_BACKGROUND = 5
        private const val MENU_NOTIFY_STATUS = 6

        @Volatile
        private var runtime: GeckoRuntime? = null

        fun runtime(context: Context): GeckoRuntime {
            runtime?.let { return it }
            synchronized(this) {
                runtime?.let { return it }
                val settings = GeckoRuntimeSettings.Builder()
                    .remoteDebuggingEnabled(true)
                    // 调试期把页面 console.* 落进 logcat（Gecko 侧等价于 devtools.console.stdout.content）。
                    // 只开在 debug 构建：release 不需要被页面的 console 污染日志。
                    .consoleOutput(BuildConfig.DEBUG)
                    .build()
                return GeckoRuntime.create(context, settings).also { runtime = it }
            }
        }
    }

    /** 正在等用户选文件的那个 prompt；同一时刻只允许一个，否则连点两次会抢同一个 launcher。 */
    private class PendingFilePrompt(
        val prompt: GeckoSession.PromptDelegate.FilePrompt,
        val result: GeckoResult<GeckoSession.PromptDelegate.PromptResponse>,
    )

    private var pendingFilePrompt: PendingFilePrompt? = null

    /**
     * 文件选择**必须由宿主接管**：GeckoView 把 `<input type="file">` 变成 onFilePrompt 交给 App，
     * 不接管的话系统选择器永远不会出现，页面就一直等在那儿 —— 表现就是「点了上传没反应」。
     */
    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { activityResult ->
        val pending = pendingFilePrompt ?: return@registerForActivityResult
        if (pending.prompt.isComplete) {
            pendingFilePrompt = null
            return@registerForActivityResult
        }
        val picked = pickedUris(activityResult.resultCode, activityResult.data)
        if (picked.isEmpty()) {
            Log.i(LOG_TAG, "文件选择被取消")
            dismissPending()
        } else {
            confirmPending(picked)
        }
    }
    private var splashView: View? = null
    private var splashShownAt = 0L
    private var splashPendingHide = false

    /**
     * 通知权限（Android 13+）。请求结果不弹任何提示：拒绝就是"不提醒"，
     * 用户想开可以去系统设置，或从 ⋮ →「消息提醒」再看一遍状态。
     */
    private val notificationPermissionRequest = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        Log.i(LOG_TAG, "通知权限：${if (granted) "已授权" else "被拒绝"}")
    }

    /** 开屏期间攒下的明文警告（撤掉开屏后再弹，见 maybeWarnInsecure） */
    private var pendingInsecureWarning: String? = null
    private var albumPicker: AlbumPickerView? = null

    /**
     * 正开着的（原生）录音小窗。与相册并列的一层原生 UI：
     * 站点在 App 模式下把麦克风按钮做成"录音 accept"，宿主接手后弹它（见 docs/moment-audio-spec.md §2.5）。
     */
    private var voiceRecorder: VoiceRecorderView? = null
    private var maxImagesPerBatch = DEFAULT_MAX_IMAGES

    /** 站点单文件上限（非图片类；视频压缩的目标体积），来自 `GET /api/upload/limits` 的 `maxBytes` */
    private var uploadMaxBytes = DEFAULT_MAX_BYTES
    private var limitsFetched = false

    private lateinit var container: FrameLayout
    private val prefs by lazy { getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }

    private var session: GeckoSession? = null
    private var webView: GeckoView? = null
    private var menuButton: View? = null
    private var setupView: View? = null
    private var setupInput: EditText? = null

    /** 地址页是否处于「修改」模式：true 时返回键=取消退出该页；false（首次填写）时返回键=关掉 App。 */
    private var editingExisting = false

    /** 正挂着的表单选择器（下拉框/日期/时间）；系统切深浅色时要靠它重画 */
    private var activeFormPrompts: FormPrompts? = null

    /**
     * GeckoSession 上没有 canGoBack()（javap 实测只有 goBack / gotoHistoryIndex / isOpen），
     * 后退状态由 NavigationDelegate.onCanGoBack 回调给出，所以自己存一份。
     */
    private var canGoBack = false
    private var warnedCleartext = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        container = findViewById(R.id.container)

        // 开屏先挂上；之后无论走「首启表单」还是「加载站点」，都由 hideSplash() 撤掉
        showSplash()

        // 通知层：建渠道（幂等）+ 首次启动时请一次通知权限（用户拒绝也不影响别处，
        // 只是不弹通知；见 AppNotifier.canPostNotifications 的宽容处理）
        AppNotifier.ensureChannels(this)
        requestNotificationPermissionOnFirstRun()

        // 点通知进来（冷启动）：深链**只决定这一次打开哪一页**，落盘只落站点 origin ——
        // 以前把文章地址整条写进 site_url，之后每次启动都停在那篇文章（用户报过的 bug）。
        val deepLink = handleDeepLink(intent)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    when {
                        // 相册 / 预览 / 编辑器是叠在网页上的原生层：返回键先逐层退，
                        // 不能穿透到后面的网页（旧版相册开着按返回会去操作看不见的页面）
                        albumPicker?.handleBack() == true -> Unit
                        setupView != null && editingExisting -> hideSiteForm()
                        // 首次不填地址就等于没有可访问的站点，直接退出而不是停在空页面
                        setupView != null -> finish()
                        canGoBack -> session?.goBack()
                        else -> finish()
                    }
                }
            },
        )

        // ⚠️ 必须 post 到下一帧再做：ensureSession() 是同步的重活（加载 libxul，秒级），
        // 在 onCreate 里直接建会把**第一帧整个堵在它后面**，开屏根本没机会画到屏幕上。
        container.post {
            // 首次启动不再进地址表单：没有存过地址就用默认站点（规则见 AppUrl.kt）。
            // 存过的地址里，历史默认值会被一次性重写成当前默认；用户自己填过的不动。
            val saved = AppUrl.resolveStoredUrl(prefs.getString(KEY_SITE_URL, null))
            val target = deepLink ?: saved ?: AppUrl.initialSiteUrl()
            if (deepLink != null) {
                AppUrl.originOf(deepLink)?.let { origin ->
                    prefs.edit().putString(KEY_SITE_URL, origin).apply()
                }
            } else {
                // 写回归一化后的地址：历史默认值由此一次性迁移掉（下次启动不会再走一遍）
                prefs.edit().putString(KEY_SITE_URL, target).apply()
            }
            Log.i(LOG_TAG, "进入站点：$target")
            loadSite(target)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // App 已经在跑时点通知：**不重建会话**，直接把当前页换过去
        handleDeepLink(intent)?.let { url ->
            // ⚠️ 深链只影响本次会话；落盘只写站点 origin（写全文 = 下次启动永远停在那一页）
            AppUrl.originOf(url)?.let { origin ->
                prefs.edit().putString(KEY_SITE_URL, origin).apply()
            }
            hideSiteForm()
            loadSite(url)
        }
    }

    override fun onStart() {
        super.onStart()
        AppNotifier.onForegroundChanged(this, isForeground = true)
    }

    /**
     * App 被切到后台（或锁屏）：正在录的那条立刻停并作废。
     *
     * 理由：本项目刻意不申请 `FOREGROUND_SERVICE`（见 docs/android/push-plan.md 的「不要什么权限」），
     * 没有前台服务的后台录音既会被系统掐，也不该悄悄录 —— 交给用户"重新录一次"比交一条半截的好。
     */
    override fun onPause() {
        super.onPause()
        voiceRecorder?.onHostPause()
    }

    override fun onStop() {
        super.onStop()
        AppNotifier.onForegroundChanged(this, isForeground = false)
    }

    override fun onDestroy() {
        // 兜底：Activity 走了，录音器与试听器不能留着（否则麦克风被占着、下次录不了）
        closeVoiceRecorder()
        super.onDestroy()
    }

    /**
     * 点通知进来的那条链接（`ACTION_VIEW` + `data`）。
     *
     * 冷启动时它**必须顶掉保存的地址**：用户可能在 App 里把地址改成了局域网地址，
     * 而通知带的是当时那个站点的绝对地址 —— 按通知走才是用户的意图。
     */
    private fun handleDeepLink(intent: Intent?): String? {
        if (intent == null || intent.action != Intent.ACTION_VIEW) {
            return null
        }
        val data = intent.data?.toString() ?: return null
        val url = AppUrl.normalize(data) ?: return null
        Log.i(LOG_TAG, "通知落地：$url")
        return url
    }

    /**
     * Android 13+ 首次启动请一次通知权限。
     *
     * 只在「用户没做过选择」时请求（`shouldShowRequestPermissionRationale` 为 false 且未授权）：
     * 之后不再反复弹 —— 用户想开自己去系统设置开，App 不做纠缠。
     */
    private fun requestNotificationPermissionOnFirstRun() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return
        }
        val permission = Manifest.permission.POST_NOTIFICATIONS
        if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
            return
        }
        if (shouldShowRequestPermissionRationale(permission)) {
            return
        }
        notificationPermissionRequest.launch(permission)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // 清单里声明了 uiMode 由 Activity 自己处理 → 不会重建，深浅色要手工跟随。
        // 重建表单时把用户已经敲进去的内容带回去，别让主题切换吞掉输入。
        if (setupView != null) {
            showSiteForm(editing = editingExisting, preset = setupInput?.text?.toString())
        }
        // 正开着的下拉框/日期时间选择器同理：按新配色重画（选择状态不丢）
        activeFormPrompts?.applyTheme()
    }

    // ---------------------------------------------------------------- Web 视图

    private fun ensureSession(): GeckoSession {
        session?.let { return it }

        // 站点靠 UA 里的这个标记认出"这一发来自 App"（推荐应用卡不弹、推送抑制都依赖它，
        // 服务端判定见 main/src/lib/client/detect.ts）。追加式，不改内核默认 UA 的前半段。
        // ⚠️ 取默认 UA 用**静态**的 `GeckoSession.getDefaultUserAgent()`；
        // 实例上的 `getUserAgent()` 是另一个东西（返回 `GeckoResult<String>`，异步查内核），别拿它当字符串用。
        val appUserAgent = AppUrl.withSmartBlogTag(
            GeckoSession.getDefaultUserAgent(),
            BuildConfig.VERSION_NAME,
        )

        val created = GeckoSession(
            GeckoSessionSettings.Builder()
                .contextId("main")
                .userAgentOverride(appUserAgent)
                .build(),
        )
        created.open(runtime(this))
        Log.i(LOG_TAG, "会话 UA：${created.settings.userAgentOverride}")

        created.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onPageStop(session: GeckoSession, success: Boolean) {
                // 首屏（或任何一次加载）结束就撤开屏；splashView 为空时是空操作
                hideSplash()
            }
        }

        created.promptDelegate = object : GeckoSession.PromptDelegate {
            override fun onFilePrompt(
                session: GeckoSession,
                prompt: GeckoSession.PromptDelegate.FilePrompt,
            ): GeckoResult<GeckoSession.PromptDelegate.PromptResponse> {
                Log.i(
                    LOG_TAG,
                    "onFilePrompt type=${prompt.type} mime=${prompt.mimeTypes?.joinToString()} capture=${prompt.capture}",
                )
                // 上一个还没收口（用户连点两次）→ 先取消，避免两个 prompt 抢同一个 launcher
                pendingFilePrompt?.let { previous ->
                    pendingFilePrompt = null
                    if (!previous.prompt.isComplete) {
                        previous.result.complete(previous.prompt.dismiss())
                    }
                }

                if (prompt.type == GeckoSession.PromptDelegate.FilePrompt.Type.FOLDER) {
                    // 站点没有目录上传入口，给出半残的目录选择反而更糟：明确取消
                    Log.i(LOG_TAG, "忽略目录上传请求")
                    return GeckoResult.fromValue(prompt.dismiss())
                }
                val result = GeckoResult<GeckoSession.PromptDelegate.PromptResponse>()
                val pending = PendingFilePrompt(prompt, result)
                pendingFilePrompt = pending
                // 「这一组 accept 要不要交给自有相册」是纯逻辑（MediaKinds.kt，有 JVM 单测）：
                // 纯图片 / 纯视频 / 图片+视频 → 相册；带音频或扩展名（导入 Markdown、更新包）→ 系统选择器
                val albumMedia = albumMediaForTypes(prompt.mimeTypes)
                when {
                    // 录音：站点在 App 模式下给麦克风按钮挂录音标记（或 capture + 纯音频 accept）。
                    // 走的还是同一条文件 prompt 通道 —— 录完（或裁剪完）把文件 confirm 回页面，
                    // 页面用现成的上传链路入库，宿主不碰 cookie、也不自己上传。
                    isVoiceRecordRequest(prompt.mimeTypes, prompt.capture) ->
                        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                            PackageManager.PERMISSION_GRANTED
                        ) {
                            showVoiceRecorder(pending)
                        } else {
                            recordPermissionRequest.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    albumMedia != null && hasMediaPermissions(albumMedia) ->
                        showAlbumPicker(pending, albumMedia)
                    // 权限还没给：要一次；拒绝就退回系统选择器 —— 绝不让用户传不了文件
                    albumMedia != null ->
                        mediaPermissionRequest.launch(permissionsFor(albumMedia).toTypedArray())
                    else -> launchSystemPicker(prompt)
                }
                return result
            }

            /**
             * `<select>`：**Gecko 自己弹不出下拉框**，它把用户点开控件的动作变成 prompt 交给宿主
             * （Gecko 源码 `modules/GeckoViewPrompt.sys.mjs` 的 `_handleSelect` → `{type:"choice"}`）。
             * 宿主不接管时 prompt 一直悬着 —— 页面上那个框看着是好的，点下去什么都不发生，
             * 这就是"下拉框不正常"的真身（跟 CSS/布局无关，别去改站点样式）。
             */
            override fun onChoicePrompt(
                session: GeckoSession,
                prompt: GeckoSession.PromptDelegate.ChoicePrompt,
            ): GeckoResult<GeckoSession.PromptDelegate.PromptResponse> {
                Log.i(
                    LOG_TAG,
                    "onChoicePrompt type=${prompt.type} 选项=${prompt.choices?.size ?: 0}",
                )
                if (isFinishing || isDestroyed) {
                    return GeckoResult.fromValue(prompt.dismiss())
                }
                val result = GeckoResult<GeckoSession.PromptDelegate.PromptResponse>()
                trackPrompt(prompt).showChoice(prompt, result)
                return result
            }

            /**
             * `<input type="date|time|datetime-local|month|week">` 同理：Gecko 用的是
             * "把选择器交给宿主"的模型（`_handleDateTime` → `{type:"datetime"}`），
             * 宿主不接管时点上去没有任何反应 —— 这就是"选择时间不正常"的真身。
             */
            override fun onDateTimePrompt(
                session: GeckoSession,
                prompt: GeckoSession.PromptDelegate.DateTimePrompt,
            ): GeckoResult<GeckoSession.PromptDelegate.PromptResponse> {
                Log.i(LOG_TAG, "onDateTimePrompt type=${prompt.type} 值=${prompt.defaultValue}")
                if (isFinishing || isDestroyed) {
                    return GeckoResult.fromValue(prompt.dismiss())
                }
                val result = GeckoResult<GeckoSession.PromptDelegate.PromptResponse>()
                trackPrompt(prompt).showDateTime(prompt, result)
                return result
            }
        }

        created.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onCanGoBack(session: GeckoSession, value: Boolean) {
                canGoBack = value
            }

            /**
             * 页面地址变化 → 更新「这个 App 是不是登录着后台」。
             *
             * 这是通知层管理员抑制的**唯一信号源**：GeckoView 157 没有 cookie API
             * （`myblog.session` 是 HttpOnly，宿主读不到），只能按"看到了 /admin 页"来判。
             * 规则与理由见 `PushRules.adminStateAfterNavigation`（有单测）。
             *
             * ⚠️ **不要在这里写 `override fun onLocationChange(...)`**：AAR `javap` 显示它是
             * 4 参数（`GeckoSession, String, List<ContentPermission>, Boolean`），但其中一个
             * 平台的 `java.util.List` 与 NPE 注解形态猜不中就报 `'onLocationChange' overrides
             * nothing`（本轮踩过一次，浪费两轮编译）。`GeckoSession` 上也**没有** `getUri()`
             * （javap 实读：只有静态 `getDefaultUserAgent()`），所以走这两个回调：
             *  - `onLoadRequest`：每次导航开始时（覆盖用户在页面里的点击）；
             *  - `onPageStop`：加载结束时（302 跳转的最终地址由上一次 load 请求代表）。
             */
            private fun trackAdminState(url: String?) {
                AppNotifier.onNavigation(this@MainActivity, url)
            }

            override fun onLoadRequest(
                session: GeckoSession,
                request: GeckoSession.NavigationDelegate.LoadRequest,
            ): GeckoResult<AllowOrDeny?>? {
                trackAdminState(request.uri)
                maybeWarnInsecure(request.uri)
                return GeckoResult.allow()
            }
        }

        val view = GeckoView(this)
        view.setSession(created)
        // 首次建立会话时，地址表单可能正开着（此时必须继续藏着）；否则直接可见。
        view.visibility = if (setupView == null) View.VISIBLE else View.GONE
        container.addView(
            view,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        val button = buildMenuButton()
        button.visibility = view.visibility
        container.addView(button)

        // 开屏必须压在最上层：GeckoView 建出来就是 VISIBLE，会把先加进去的开屏整个盖住
        // （表现是"开屏一片白、logo 不见"——其实是看到没加载完的 Web 视图）
        splashView?.bringToFront()

        webView = view
        menuButton = button
        session = created
        return created
    }

    private fun loadSite(url: String) {
        // 顺序要紧：会话可能在这次调用里才被创建，可见性必须在创建之后再定，
        // 否则首次进入时 GeckoView 会一直停在隐藏状态（页面已加载却是一片白）。
        val created = ensureSession()
        val visible = if (setupView == null) View.VISIBLE else View.GONE
        webView?.visibility = visible
        menuButton?.visibility = visible
        created.loadUri(url)
        refreshUploadLimits()
    }

    /** 右下角浮动的入口：刷新 + 修改网站地址。半透明、不抢版面，站点的固定 UI 也不在这个位置。 */
    private fun buildMenuButton(): View {
        val size = dp(42)
        return TextView(this).apply {
            text = "\u22EE" // ⋮
            contentDescription = "更多"
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#CC1F2329"))
            }
            alpha = 0.55f
            layoutParams = FrameLayout.LayoutParams(size, size).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                rightMargin = dp(12)
                // 后台的手机形态有一条 56px 的固定底栏（admin.css 的 --admin-tabbar-h: 56px，
                // GeckoView 里 env(safe-area-inset-bottom) 实测为 0，所以就是 56dp）。
                // 68dp = 56 底栏 + 12 间隙：尽量贴下，但绝不压到底栏。
                bottomMargin = dp(68)
            }
            setOnClickListener { showOverflowMenu(it) }
        }
    }

    private fun showOverflowMenu(anchor: View) {
        val popup = PopupMenu(this, anchor)
        // 回退状态来自 NavigationDelegate.onCanGoBack（GeckoSession 上没有查询方法）。
        // 没有历史时保留条目但置灰 —— 直接隐藏会让用户以为功能不存在。
        popup.menu.add(0, MENU_BACK, 0, "返回上一页").isEnabled = canGoBack
        popup.menu.add(0, MENU_RELOAD, 1, "刷新")
        popup.menu.add(0, MENU_EDIT_URL, 2, "修改网站地址")
        popup.menu.add(0, MENU_NOTIFY_SETTINGS, 3, "消息提醒")
        // 下面三条给"临时改一下"用：真正常用的是设置页，这里放最常用的两个开关
        val notifyOn = AppNotifier.enabled(this)
        popup.menu.add(0, MENU_NOTIFY_TOGGLE, 4, if (notifyOn) "关闭消息提醒" else "开启消息提醒")
        popup.menu.add(0, MENU_NOTIFY_BACKGROUND, 5, "后台也提醒").apply {
            isCheckable = true
            isChecked = PushSettings.load(this@MainActivity).background
            isEnabled = notifyOn
        }
        // 状态行：只读，用来回答"为什么没提醒"（管理员态 / 缺权限 / 上次同步结果）
        popup.menu.add(0, MENU_NOTIFY_STATUS, 6, notificationStatusLine()).apply { isEnabled = false }
        popup.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                MENU_BACK -> {
                    session?.goBack()
                    true
                }

                MENU_RELOAD -> {
                    // 会话还没建（理论上不会走到，菜单只在 Web 视图可见时才显示）
                    val current = prefs.getString(KEY_SITE_URL, null)
                    if (current != null) loadSite(current)
                    true
                }

                MENU_EDIT_URL -> {
                    showSiteForm(editing = true)
                    true
                }

                MENU_NOTIFY_SETTINGS -> {
                    showSiteForm(editing = true)
                    true
                }

                MENU_NOTIFY_TOGGLE -> {
                    setNotificationsEnabled(!notifyOn)
                    true
                }

                MENU_NOTIFY_BACKGROUND -> {
                    setBackgroundNotifications(!PushSettings.load(this).background)
                    true
                }

                else -> false
            }
        }
        popup.show()
    }

    /** 状态行文案：一眼看出当前的提醒状态（点击无效，只是信息）。 */
    private fun notificationStatusLine(): String {
        val state = PushSettings.load(this)
        return when {
            !state.enabled -> "提醒：已关闭"
            state.admin -> "提醒：已登录后台（不推送）"
            !AppNotifier.canPostNotifications(this) -> "提醒：没有系统通知权限"
            !state.background -> "提醒：仅 App 打开时 · ${PushSettings.lastResult(this)}"
            else -> "提醒：前台 + 后台 · ${PushSettings.lastResult(this)}"
        }
    }

    /** 开关通知：开的时候顺手把权限一起要了（用户点了"开启"，这时候问最自然）。 */
    private fun setNotificationsEnabled(enabled: Boolean) {
        AppNotifier.setEnabled(this, enabled)
        val hint = when {
            !enabled -> "已关闭消息提醒"
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED -> {
                notificationPermissionRequest.launch(Manifest.permission.POST_NOTIFICATIONS)
                "已开启；请在系统弹窗里允许通知"
            }

            else -> "已开启消息提醒"
        }
        Toast.makeText(this, hint, Toast.LENGTH_SHORT).show()
    }

    private fun setBackgroundNotifications(enabled: Boolean) {
        AppNotifier.setBackground(this, enabled)
        Toast.makeText(
            this,
            if (enabled) "后台也会巡检（间隔由系统决定，可能十几分钟一次）" else "只在 App 打开时提醒",
            Toast.LENGTH_LONG,
        ).show()
    }

    // ---------------------------------------------------------------- 地址表单

    // 配色与控件样式统一在 HostUi.kt（单一事实源）：这里的地址表单、下拉框/日期时间弹层、
    // 自有相册、开屏都从那一份 palette 与按钮规范取值，改一处四处一起变。

    private fun showSiteForm(editing: Boolean, preset: String? = null) {
        // 页面已经加载过时 onPageStop 早已发生，这里是空操作；保留是为了防御
        // 「表单比首屏先出现」的极端时序（比如以后再加首启引导页）
        hideSplash()
        val carried = preset ?: setupInput?.text?.toString()
        setupView?.let { container.removeView(it) }
        setupView = null
        setupInput = null
        webView?.visibility = View.GONE
        menuButton?.visibility = View.GONE
        editingExisting = editing

        val p = hostPalette(this)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(28), dp(28), dp(28), dp(28))
        }

        column.addView(hostText(this, "修改网站地址", 21f, p.title, bold = true))
        column.addView(
            hostText(this, "改完点「确认」；留空或填错不会改动现有地址。", 13f, p.hint).apply {
                setPadding(0, dp(8), 0, dp(18))
            },
        )

        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            isSingleLine = true
            hint = AppUrl.DEFAULT_SITE_URL
            setTextColor(p.fieldText)
            setHintTextColor(p.hint)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = rounded(this@MainActivity, p.fieldBg, 10)
            // 预填当前地址：表单只在「修改」时打开，预填就是既有值
            val initial = carried
                ?: AppUrl.resolveStoredUrl(prefs.getString(KEY_SITE_URL, null))
                ?: AppUrl.initialSiteUrl()
            setText(initial)
            setSelection(initial.length)
        }

        val error = TextView(this).apply {
            setTextColor(Color.parseColor("#E5484D"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setPadding(0, dp(10), 0, 0)
            visibility = View.GONE
        }

        val confirm = hostPrimaryButton(this, p, "确认").apply {
            layoutParams = (layoutParams as LinearLayout.LayoutParams).apply {
                topMargin = dp(18)
            }
        }

        val submit = View.OnClickListener {
            val url = AppUrl.normalize(input.text.toString())
            if (url == null) {
                error.text = "地址无效。示例：https://bruccese.com 或 http://192.168.1.10:3000"
                error.visibility = View.VISIBLE
            } else {
                prefs.edit().putString(KEY_SITE_URL, url).apply()
                hideSiteForm()
                loadSite(url)
            }
        }
        confirm.setOnClickListener(submit)
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO) {
                submit.onClick(input)
                true
            } else {
                false
            }
        }

        column.addView(input)
        column.addView(error)
        column.addView(confirm)

        if (editing) {
            column.addView(
                hostGhostButton(this, p, "取消").apply {
                    layoutParams = (layoutParams as LinearLayout.LayoutParams).apply {
                        topMargin = dp(4)
                    }
                    setOnClickListener { hideSiteForm() }
                },
            )
        }

        // 通知设置与地址在同一屏（都是"这个 App 自己的设置"）：控件多，所以外层套一个
        // ScrollView —— 小屏/横屏/大字号时确认按钮不会被挤出屏幕
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            addView(
                column,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
        column.addView(
            buildNotifySettingsView(p),
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(22) },
        )

        val root = FrameLayout(this).apply {
            setBackgroundColor(p.background)
            // 自己拿住焦点，别让输入框自动获焦 —— 否则进页面就弹键盘，
            // 用户只是想把预填地址确认一下也得先关键盘。
            isFocusable = true
            isFocusableInTouchMode = true
        }
        root.addView(
            scroll,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { gravity = Gravity.CENTER },
        )

        setupView = root
        setupInput = input
        container.addView(
            root,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        root.requestFocus()
    }

    /**
     * 「消息提醒」设置块：两个开关（提醒 / 后台也提醒）+ 状态行。
     *
     * 状态行是这个功能"可解释"的关键 —— 用户看到"没弹通知"时，能一眼看出是关闭了、
     * 没给权限、还是「已登录后台所以不推」。文案与 `notificationStatusLine()` 同一口径。
     */
    private fun buildNotifySettingsView(p: Palette): View {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        box.addView(hostText(this, "消息提醒", 15f, p.title, bold = true))
        box.addView(
            hostText(
                this,
                "站点有新的文章或瞬间时，用系统通知告诉你（不是邮件/短信，全部在本机）。",
                12.5f,
                p.hint,
            ).apply { setPadding(0, dp(6), 0, dp(4)) },
        )

        val enabledSwitch = Switch(this).apply {
            isChecked = AppNotifier.enabled(this@MainActivity)
            setTextColor(p.title)
            text = "有新内容时提醒我"
            setOnCheckedChangeListener { _, checked -> setNotificationsEnabled(checked) }
        }
        val backgroundSwitch = Switch(this).apply {
            isChecked = PushSettings.load(this@MainActivity).background
            setTextColor(p.title)
            text = "后台也提醒（间隔由系统决定，可能十几分钟一次）"
            isEnabled = AppNotifier.enabled(this@MainActivity)
            setOnCheckedChangeListener { _, checked -> setBackgroundNotifications(checked) }
        }
        // 关掉主开关时，后台开关也要跟着置灰（否则用户会以为关掉了还在后台跑）
        enabledSwitch.setOnCheckedChangeListener { _, checked ->
            setNotificationsEnabled(checked)
            backgroundSwitch.isEnabled = checked
        }

        box.addView(enabledSwitch)
        box.addView(backgroundSwitch)
        box.addView(
            hostText(this, notificationStatusLine(), 12f, p.hint).apply {
                setPadding(0, dp(8), 0, 0)
            },
        )
        return box
    }

    private fun hideSiteForm() {
        setupView?.let { container.removeView(it) }
        setupView = null
        setupInput = null
        webView?.visibility = View.VISIBLE
        menuButton?.visibility = View.VISIBLE
    }

    // 地址归一化搬去 AppUrl.normalize()（纯逻辑 + 单测）：默认补 https、去末尾斜杠、
    // 只接受 http/https 且必须有主机名。别在这里再写一份平行实现。

    // ---------------------------------------------------------------- 其它

    /**
     * `content://` → `file://`。
     *
     * **这一步不能省。** GeckoView 是在**内容进程**里把 URI 解析成 DOM File 的，那里拿不到 App 的
     * content:// 授权；直接传 content:// 时日志里会出现
     * `GeckoViewFilePickerDelegate: File error: Unrecognized path (NS_ERROR_FILE_UNRECOGNIZED_PATH)`，
     * 页面**收不到任何文件**（输入框仍是「未选择」）——踩过一次，别删这段。
     * Mozilla 官方示例 BasicGeckoViewPrompt.onFileCallbackResult → toFileUri 就是这么做的。
     *
     * 副本清理由调用方在**每次选择开始时清一次**（不能写在这里：多选会逐个调用本函数，
     * 写在这里会把前一个刚拷好的文件删掉）。
     */
    private fun toFileUri(uri: Uri): Uri? {
        if ("file".equals(uri.scheme, ignoreCase = true)) return uri
        val dir = File(cacheDir, PICKED_DIR)
        if (!dir.exists() && !dir.mkdirs()) return null
        // 原文件名尽量保留，但超长/带非法字符的名字要压短：站点最终用内容 hash 存媒体，
        // 原名不参与寻址；反过来，超长名在部分系统上会让临时副本落盘失败。
        val name = PickedFileName.sanitize(displayName(uri))
        val target = File(dir, name)
        return try {
            contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(target).use { output -> input.copyTo(output) }
            } ?: return null
            Log.i(LOG_TAG, "已复制所选文件到 ${target.length()} 字节的临时副本")
            Uri.fromFile(target)
        } catch (error: Exception) {
            Log.w(LOG_TAG, "复制所选文件失败：$uri", error)
            null
        }
    }

    private fun displayName(uri: Uri): String? = runCatching {
        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (!cursor.moveToFirst()) {
                null
            } else {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) cursor.getString(index) else null
            }
        }
    }.getOrNull()

    /**
     * 相册权限：Android 13 起图片与视频是**两枚**（READ_MEDIA_IMAGES / READ_MEDIA_VIDEO），
     * 13 之前共用 READ_EXTERNAL_STORAGE。按本次 accept 允许的媒体去要，多要一枚都是打扰。
     */
    private val imagesPermission =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_IMAGES
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }

    private val videosPermission =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_VIDEO
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }

    /** 这次相册要读哪些媒体 → 需要哪几枚权限（≤32 两枚是同一个，去重）。 */
    private fun permissionsFor(media: AlbumMedia): List<String> =
        buildList {
            if (media.images) add(imagesPermission)
            if (media.videos) add(videosPermission)
        }.distinct()

    private fun hasMediaPermissions(media: AlbumMedia): Boolean =
        permissionsFor(media).all {
            checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
        }

    /** 拒绝授权就退回系统选择器 —— 宁可用得别扭，也不能让用户传不了文件 */
    private val mediaPermissionRequest = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        val pending = pendingFilePrompt ?: return@registerForActivityResult
        val media = albumMediaForTypes(pending.prompt.mimeTypes)
        if (media != null && hasMediaPermissions(media)) {
            showAlbumPicker(pending, media)
        } else {
            launchSystemPicker(pending.prompt)
        }
    }

    /**
     * 录音权限（`RECORD_AUDIO`）。站点点麦克风时先要这一枚；拒绝就取消这一次请求
     * （页面收到 dismiss，不会一直悬着 —— 用户想再试可以再点一次）。
     */
    private val recordPermissionRequest = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val pending = pendingFilePrompt ?: return@registerForActivityResult
        if (granted) {
            showVoiceRecorder(pending)
        } else {
            Log.i(LOG_TAG, "录音权限被拒绝，已取消这次录音")
            dismissPending()
        }
    }

    /** 取出选择器返回的全部 URI（多选走 clipData，单选走 data）。 */
    private fun pickedUris(resultCode: Int, data: Intent?): List<Uri> {
        if (resultCode != RESULT_OK || data == null) return emptyList()
        val clip = data.clipData
        if (clip != null && clip.itemCount > 0) {
            return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
        }
        return listOfNotNull(data.data)
    }

    /**
     * 选择器的 MIME 过滤（返回 null = 不过滤）：
     *  - 纯媒体 accept（image/ video/ audio/ 及其具体类型）→ 交给 EXTRA_MIME_TYPES，
     *    选图片时就只会列出图片，不必在整台手机里翻
     *  - 其它 → 不过滤。站点的「导入 Markdown」「导入更新包」用的是扩展名 accept
     *    （`.md` / `.tar.gz` → Gecko 映射成 text/markdown、application/gzip），
     *    按 MIME 过滤会让用户在自己的存储里根本找不到那个文件
     */
    private fun mediaFilters(mimeTypes: Array<String>?): Array<String>? {
        val list = mimeTypes?.filter { it.isNotBlank() } ?: return null
        if (list.isEmpty()) return null
        val allMedia = list.all { mime ->
            val value = mime.lowercase()
            value.startsWith("image/") || value.startsWith("video/") || value.startsWith("audio/")
        }
        return if (allMedia) list.toTypedArray() else null
    }
    // ---------------------------------------------------------------- 开屏

    /** 开屏：圆形 logo 居中、跟随系统深浅色背景，**不放任何其它东西**。首屏加载完自动撤。 */
    private fun showSplash() {
        val size = dp(168)
        val logo = ImageView(this).apply {
            setImageResource(R.drawable.splash_logo)
            layoutParams = FrameLayout.LayoutParams(size, size).apply { gravity = Gravity.CENTER }
        }
        val root = FrameLayout(this).apply {
            setBackgroundColor(hostPalette(this@MainActivity).background)
            addView(logo)
        }
        splashView = root
        splashShownAt = System.currentTimeMillis()
        // 最短显示时间要从「真的画到屏幕上」那一刻起算。写在上面那行的话，
        // 建 GeckoView 的秒级耗时会把 700ms 直接吃光 —— 用户一眼都看不到（踩过一次）。
        root.viewTreeObserver.addOnPreDrawListener(
            object : ViewTreeObserver.OnPreDrawListener {
                override fun onPreDraw(): Boolean {
                    root.viewTreeObserver.removeOnPreDrawListener(this)
                    splashShownAt = System.currentTimeMillis()
                    return true
                }
            },
        )
        container.addView(
            root,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        // 兜底：页面/网络出问题时也不能一直挡着
        root.postDelayed({ hideSplash() }, SPLASH_MAX_MS)
    }

    private fun hideSplash() {
        val view = splashView ?: return
        val elapsed = System.currentTimeMillis() - splashShownAt
        if (elapsed < SPLASH_MIN_MS) {
            // 太快撤会闪一下，用重排延迟补足最短显示时间（加标志避免重复排队）
            if (!splashPendingHide) {
                splashPendingHide = true
                view.postDelayed(
                    { splashPendingHide = false; hideSplash() },
                    SPLASH_MIN_MS - elapsed,
                )
            }
            return
        }
        splashView = null
        container.removeView(view)
        pendingInsecureWarning?.let {
            pendingInsecureWarning = null
            showInsecureWarning(it)
        }
    }

    // ---------------------------------------------------------------- 上传上限（来自服务端）

    /**
     * 取「一次能选几个」与「单文件上限」。取不到就用兜底值——**绝不能因为取不到就不让选文件**，
     * 也不能因为取不到就把所有视频都按 10MB 压（宁可压得保守一点）。
     */
    private fun refreshUploadLimits() {
        if (limitsFetched) return
        limitsFetched = true
        val saved = prefs.getString(KEY_SITE_URL, null) ?: return
        // 只取 origin（scheme://host:port）：站点地址可能是某个具体页面（如 /admin），
        // 直接往后拼路径会 404（踩过：拼成 …/_album-test.html/api/upload/limits）。
        // 口径与通知层共用 AppUrl.originOf（单一事实源）。
        val origin = AppUrl.originOf(saved) ?: return
        Thread {
            runCatching {
                val connection = (URL("$origin/api/upload/limits").openConnection() as HttpURLConnection).apply {
                    connectTimeout = 5_000
                    readTimeout = 5_000
                }
                connection.inputStream.bufferedReader().use { it.readText() }
            }.onSuccess { body ->
                val json = runCatching { JSONObject(body) }.getOrNull()
                val value = json?.optInt("maxImages", DEFAULT_MAX_IMAGES) ?: DEFAULT_MAX_IMAGES
                if (value in 1..99) {
                    maxImagesPerBatch = value
                    Log.i(LOG_TAG, "服务端上传上限：一次 $value 个")
                }
                // maxBytes = 非图片类的单文件上限（视频/音频）；视频压缩拿它当目标体积
                val bytes = json?.optLong("maxBytes", DEFAULT_MAX_BYTES) ?: DEFAULT_MAX_BYTES
                if (bytes in 1..MAX_SERVER_BYTES) {
                    uploadMaxBytes = bytes
                    Log.i(LOG_TAG, "服务端单文件上限：$bytes 字节")
                }
            }.onFailure {
                Log.w(LOG_TAG, "取上传上限失败，用兜底 $DEFAULT_MAX_IMAGES / $DEFAULT_MAX_BYTES 字节", it)
            }
        }.start()
    }

    // ---------------------------------------------------------------- 相册视图

    private fun showAlbumPicker(pending: PendingFilePrompt, kinds: AlbumMedia) {
        val palette = hostPalette(this)
        // 上一次会话留下的编辑产物 / 压缩产物只活到 confirmPending 交完为止：新会话开始先清干净
        // （shutdown() 不能清 —— closeAlbumPicker() 在 confirmPending() 之前跑）
        PhotoFiles.clearEditedDir(this)
        VideoCompressor.clearCache(this)
        val multiple =
            pending.prompt.type == GeckoSession.PromptDelegate.FilePrompt.Type.MULTIPLE
        val picker = AlbumPickerView(
            host = this,
            maxCount = if (multiple) maxImagesPerBatch else 1,
            kinds = kinds,
            // 站点单文件上限：压缩的目标体积（取不到就用兜底 10MB，见 refreshUploadLimits）
            serverMaxBytes = uploadMaxBytes,
            // armeabi-v7a 构建里没有 ffmpeg 包（见 docs/android/build.md），勾选框会自己置灰
            compressorAvailable = BuildConfig.FFMPEG_ENABLED,
            bgColor = palette.background,
            fgColor = palette.title,
            subColor = palette.hint,
            accentColor = palette.primary,
            onCancel = {
                closeAlbumPicker()
                Log.i(LOG_TAG, "相册选择被取消")
                dismissPending()
            },
            onPicked = { uris ->
                closeAlbumPicker()
                confirmPending(uris)
            },
        )
        albumPicker = picker
        container.addView(
            picker,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        splashView?.bringToFront()
        webView?.visibility = View.GONE
        menuButton?.visibility = View.GONE
    }

    private fun closeAlbumPicker() {
        val picker = albumPicker ?: return
        albumPicker = null
        container.removeView(picker)
        picker.shutdown()
        webView?.visibility = View.VISIBLE
        menuButton?.visibility = View.VISIBLE
    }

    // ---------------------------------------------------------------- 录音（原生小窗）

    /**
     * 弹原生录音界面。录完（或裁剪完）的文件走 [confirmPending] —— 与相册、系统选择器**同一条收口**，
     * 所以"文件怎么回给页面"这件事只有一份实现。
     */
    private fun showVoiceRecorder(pending: PendingFilePrompt) {
        AudioRecorder.clearOutputDir(this)
        val view = VoiceRecorderView(
            activity = this,
            // 站点单文件上限也能压住录音时长：上限调成 1MB 时只让录 62 秒（见 VoiceRecorderPolicy）
            maxRecordMs = VoiceRecorderPolicy.maxRecordMs(uploadMaxBytes),
            onFinished = { file ->
                closeVoiceRecorder()
                confirmPending(listOf(Uri.fromFile(file)))
            },
            onCancelled = {
                closeVoiceRecorder()
                dismissPending()
            },
        )
        voiceRecorder = view
        Log.i(LOG_TAG, "打开原生录音界面（上限 ${maxRecordMs()}ms）")
        view.show()
    }

    private fun closeVoiceRecorder() {
        val view = voiceRecorder ?: return
        voiceRecorder = null
        view.shutdown()
    }

    private fun maxRecordMs(): Long = VoiceRecorderPolicy.maxRecordMs(uploadMaxBytes)

    /** 回退到系统选择器（没相册权限、或本来就不是图片） */
    private fun launchSystemPicker(prompt: GeckoSession.PromptDelegate.FilePrompt) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            mediaFilters(prompt.mimeTypes)?.let { putExtra(Intent.EXTRA_MIME_TYPES, it) }
            putExtra(
                Intent.EXTRA_ALLOW_MULTIPLE,
                prompt.type == GeckoSession.PromptDelegate.FilePrompt.Type.MULTIPLE,
            )
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            filePicker.launch(intent)
        } catch (notFound: ActivityNotFoundException) {
            // 设备上没有文件管理器：明确取消，别让页面一直等
            Log.w(LOG_TAG, "没有可用的文件选择器", notFound)
            dismissPending()
        }
    }

    /**
     * 收口：相册与系统选择器**共用这一条**。
     * `content://` 必须先落成 `file://` 才能交给 Gecko（原因见 toFileUri），
     * 清理临时副本要放在循环外（放进 toFileUri 里会把多选的前几个文件删掉）。
     */
    private fun confirmPending(uris: List<Uri>) {
        val pending = pendingFilePrompt ?: return
        pendingFilePrompt = null
        if (pending.prompt.isComplete) return
        File(cacheDir, PICKED_DIR).listFiles()?.forEach { it.delete() }
        val files = uris.mapNotNull { toFileUri(it) }
        if (files.isEmpty()) {
            Log.i(LOG_TAG, "所选文件读不出来，已取消")
            pending.result.complete(pending.prompt.dismiss())
        } else {
            Log.i(LOG_TAG, "文件选择完成：${files.size} 个")
            pending.result.complete(pending.prompt.confirm(this, files.toTypedArray()))
        }
    }

    private fun dismissPending() {
        val pending = pendingFilePrompt ?: return
        pendingFilePrompt = null
        if (!pending.prompt.isComplete) {
            pending.result.complete(pending.prompt.dismiss())
        }
    }

    /**
     * 挂上 prompt 实例回调：**页面自己把这个 prompt 收掉时，宿主弹着的选择器要跟着关**
     * （`<select>` 的 blur、datetime 的 `MozCloseDateTimePicker` 都会走到这里），
     * 否则页面上控件已经不在了，手里还压着一个能点"确定"的卡片。
     * 顺带把它登记成 `activeFormPrompts` —— 系统切深浅色时靠它把开着的选择器重画成新配色。
     */
    private fun trackPrompt(
        prompt: GeckoSession.PromptDelegate.BasePrompt,
    ): FormPrompts {
        val form = FormPrompts(this)
        prompt.setDelegate(
            object : GeckoSession.PromptDelegate.PromptInstanceDelegate {
                override fun onPromptDismiss(prompt: GeckoSession.PromptDelegate.BasePrompt) {
                    form.closeOpenDialog()
                }
            },
        )
        activeFormPrompts = form
        return form
    }

    private fun dp(value: Int): Int = dp(this, value)

    /**
     * 明文 HTTP 时弹一次警告（同一次会话只弹一次）。
     *
     * ⚠️ 判定看的是 **URL 协议**，不是 `NetworkSecurityPolicy.isCleartextTrafficPermitted()`：
     * App 自己要发一个 http 请求（取上传上限，见 refreshUploadLimits），所以清单里开了
     * `usesCleartextTraffic` —— 那个 API 就会**永远返回 true**，用它判定等于把警告悄悄关掉。
     */
    private fun maybeWarnInsecure(url: String) {
        if (warnedCleartext) return
        if (!url.startsWith("http://")) return

        warnedCleartext = true
        // 开屏还盖着就先憋着：开屏的要求是"只有 logo，没有别的"，上面压一个弹窗就破了。
        // hideSplash() 会在撤掉开屏后把它放出来。
        if (splashView != null) {
            pendingInsecureWarning = url
            return
        }
        showInsecureWarning(url)
    }

    private fun showInsecureWarning(url: String) {
        AlertDialog.Builder(this)
            .setTitle("不安全连接")
            .setMessage(
                "当前通过明文 HTTP 访问：\n$url\n\n" +
                    "内容可能被同一网络下的其他人读取或篡改，仅建议在可信局域网内测试。\n" +
                    "正式使用请为站点配置 HTTPS。",
            )
            .setPositiveButton("我知道了", null)
            .show()
    }
}
