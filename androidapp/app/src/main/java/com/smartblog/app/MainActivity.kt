package com.smartblog.app

import android.Manifest
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
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
import android.widget.TextView
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
import java.net.URI
import java.net.URL
import org.json.JSONObject

/**
 * 单 Activity 的 GeckoView 宿主。
 *
 * 不引 AppCompat / Material / Compose：界面用系统原生控件在代码里搭，保持依赖面只有
 * GeckoView + androidx.activity（见 docs/android/build.md 的依赖取舍）。
 *
 * 三件事在这里定：
 *  1. **站点地址是用户数据，不是编译期常量**。首次启动必须填一次（存 SharedPreferences），
 *     `BuildConfig.START_URL` 只当输入框的预填值；之后随时能从右下角菜单改。
 *  2. **刷新**在同一处入口。
 *  3. 页面自身没有地址栏，所以返回键语义要在这里兜住（能后退就后退，否则退出）。
 */
class MainActivity : ComponentActivity() {

    companion object {
        private const val PREFS_NAME = "smartblog"
        private const val KEY_SITE_URL = "site_url"
        private const val LOG_TAG = "SmartBlog"

        /** 服务端没给上限时的兜底值；正常由 GET /api/upload/limits 决定 */
        private const val DEFAULT_MAX_IMAGES = 9

        /** 开屏：至少显示这么久（免得一闪而过），最多挡这么久（页面起不来也不卡死） */
        private const val SPLASH_MIN_MS = 1200L
        private const val SPLASH_MAX_MS = 6000L

        /** 所选文件的临时副本目录（content:// 要落成真实文件才能交给 Gecko，见 toFileUri） */
        private const val PICKED_DIR = "picked"
        private const val MENU_BACK = 0
        private const val MENU_RELOAD = 1
        private const val MENU_EDIT_URL = 2

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

    /** 开屏期间攒下的明文警告（撤掉开屏后再弹，见 maybeWarnInsecure） */
    private var pendingInsecureWarning: String? = null
    private var albumPicker: AlbumPickerView? = null
    private var maxImagesPerBatch = DEFAULT_MAX_IMAGES
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

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    when {
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
            val saved = prefs.getString(KEY_SITE_URL, null)
            if (saved.isNullOrBlank()) {
                showSiteForm(editing = false)
            } else {
                loadSite(saved)
            }
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // 清单里声明了 uiMode 由 Activity 自己处理 → 不会重建，深浅色要手工跟随。
        // 重建表单时把用户已经敲进去的内容带回去，别让主题切换吞掉输入。
        if (setupView != null) {
            showSiteForm(editing = editingExisting, preset = setupInput?.text?.toString())
        }
    }

    // ---------------------------------------------------------------- Web 视图

    private fun ensureSession(): GeckoSession {
        session?.let { return it }

        val created = GeckoSession(
            GeckoSessionSettings.Builder()
                .contextId("main")
                .build(),
        )
        created.open(runtime(this))

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
                when {
                    // 纯图片 accept → 自有全屏相册（读系统相册，选几张由服务端上限决定）
                    isImageOnlyAccept(prompt) && hasPhotoPermission() -> showAlbumPicker(pending)
                    // 有权限流程可走：先要权限，拒绝就退回系统选择器
                    isImageOnlyAccept(prompt) -> photoPermissionRequest.launch(photoPermission)
                    // 视频/音频/任意文件/混合媒体：保持原样走系统选择器
                    else -> launchSystemPicker(prompt)
                }
                return result
            }
        }

        created.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onCanGoBack(session: GeckoSession, value: Boolean) {
                canGoBack = value
            }

            override fun onLoadRequest(
                session: GeckoSession,
                request: GeckoSession.NavigationDelegate.LoadRequest,
            ): GeckoResult<AllowOrDeny?>? {
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

                else -> false
            }
        }
        popup.show()
    }

    // ---------------------------------------------------------------- 地址表单

    private data class Palette(
        val background: Int,
        val title: Int,
        val hint: Int,
        val fieldBg: Int,
        val fieldText: Int,
        val primary: Int,
        val onPrimary: Int,
        val ghost: Int,
    )

    private fun isNightMode(): Boolean =
        (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES

    /** 黑/白两套，跟随系统深浅色（用户明确要求"黑色或白色（跟随系统）"）。 */
    private fun palette(): Palette =
        if (isNightMode()) {
            Palette(
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

    private fun showSiteForm(editing: Boolean, preset: String? = null) {
        // 首启没有页面要加载，onPageStop 不会来 —— 这里必须自己撤掉开屏
        hideSplash()
        val carried = preset ?: setupInput?.text?.toString()
        setupView?.let { container.removeView(it) }
        setupView = null
        setupInput = null
        webView?.visibility = View.GONE
        menuButton?.visibility = View.GONE
        editingExisting = editing

        val p = palette()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(28), dp(28), dp(28), dp(28))
        }

        column.addView(
            TextView(this).apply {
                text = "请输入网站地址"
                setTextColor(p.title)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 21f)
                typeface = Typeface.DEFAULT_BOLD
            },
        )
        column.addView(
            TextView(this).apply {
                text = "填好后点「确认」访问；以后可从右下角菜单随时修改。"
                setTextColor(p.hint)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                setPadding(0, dp(8), 0, dp(18))
            },
        )

        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            isSingleLine = true
            hint = "http://192.168.1.10:3000"
            setTextColor(p.fieldText)
            setHintTextColor(p.hint)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(p.fieldBg)
            }
            val initial = carried ?: BuildConfig.START_URL
            setText(initial)
            setSelection(initial.length)
        }

        val error = TextView(this).apply {
            setTextColor(Color.parseColor("#E5484D"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setPadding(0, dp(10), 0, 0)
            visibility = View.GONE
        }

        val confirm = Button(this).apply {
            text = "确认"
            isAllCaps = false
            setTextColor(p.onPrimary)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(p.primary)
            }
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(48),
            ).apply { topMargin = dp(18) }
        }

        val submit = View.OnClickListener {
            val url = normalizeSiteUrl(input.text.toString())
            if (url == null) {
                error.text = "地址无效。示例：http://192.168.1.10:3000 或 https://blog.example.com"
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
                Button(this).apply {
                    text = "取消"
                    isAllCaps = false
                    setTextColor(p.ghost)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                    background = GradientDrawable().apply {
                        cornerRadius = dp(10).toFloat()
                        setColor(Color.TRANSPARENT)
                    }
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        dp(44),
                    ).apply { topMargin = dp(4) }
                    setOnClickListener { hideSiteForm() }
                },
            )
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(p.background)
            // 自己拿住焦点，别让输入框自动获焦 —— 否则进页面就弹键盘，
            // 用户只是想把预填地址确认一下也得先关键盘。
            isFocusable = true
            isFocusableInTouchMode = true
        }
        root.addView(
            column,
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

    private fun hideSiteForm() {
        setupView?.let { container.removeView(it) }
        setupView = null
        setupInput = null
        webView?.visibility = View.VISIBLE
        menuButton?.visibility = View.VISIBLE
    }

    /** 没写协议时按 http:// 补；只接受 http/https，且必须有主机名。末尾斜杠归一掉。 */
    private fun normalizeSiteUrl(raw: String): String? {
        val text = raw.trim()
        if (text.isEmpty()) {
            return null
        }
        val lower = text.lowercase()
        val withScheme =
            if (lower.startsWith("http://") || lower.startsWith("https://")) {
                text
            } else {
                "http://$text"
            }
        return try {
            val parsed = URI(withScheme)
            val scheme = parsed.scheme?.lowercase()
            if (scheme != "http" && scheme != "https") {
                return null
            }
            if (parsed.host.isNullOrBlank()) {
                return null
            }
            withScheme.trimEnd('/')
        } catch (error: Exception) {
            null
        }
    }

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
        // 文件名要原样保留：站点拿它当媒体显示名，加时间戳前缀会把用户看到的文件名弄脏
        val name = (displayName(uri) ?: "picked-${System.currentTimeMillis()}")
            .replace(Regex("[^A-Za-z0-9._-]+"), "_")
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
    }.getOrNull()    /** 相册权限：Android 13 起拆成了 READ_MEDIA_IMAGES，之前是 READ_EXTERNAL_STORAGE */
    private val photoPermission =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_IMAGES
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }

    /** 拒绝授权就退回系统选择器 —— 宁可用得别扭，也不能让用户传不了图 */
    private val photoPermissionRequest = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val pending = pendingFilePrompt ?: return@registerForActivityResult
        if (granted) showAlbumPicker(pending) else launchSystemPicker(pending.prompt)
    }    /** 取出选择器返回的全部 URI（多选走 clipData，单选走 data）。 */
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
            setBackgroundColor(palette().background)
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

    /** 取「一次能选几张」。取不到就用兜底值——**绝不能因为取不到就不让选图**。 */
    private fun refreshUploadLimits() {
        if (limitsFetched) return
        limitsFetched = true
        val saved = prefs.getString(KEY_SITE_URL, null) ?: return
        // 只取 origin（scheme://host:port）：站点地址可能是某个具体页面（如 /admin），
        // 直接往后拼路径会 404（踩过：拼成 …/_album-test.html/api/upload/limits）
        val origin = runCatching {
            val parsed = URI(saved)
            "${parsed.scheme}://${parsed.authority}"
        }.getOrNull()?.takeIf { it.startsWith("http") } ?: return
        Thread {
            runCatching {
                val connection = (URL("$origin/api/upload/limits").openConnection() as HttpURLConnection).apply {
                    connectTimeout = 5_000
                    readTimeout = 5_000
                }
                connection.inputStream.bufferedReader().use { it.readText() }
            }.onSuccess { body ->
                val value = runCatching {
                    JSONObject(body).optInt("maxImages", DEFAULT_MAX_IMAGES)
                }.getOrDefault(DEFAULT_MAX_IMAGES)
                if (value in 1..99) {
                    maxImagesPerBatch = value
                    Log.i(LOG_TAG, "服务端上传上限：一次 $value 张")
                }
            }.onFailure {
                Log.w(LOG_TAG, "取上传上限失败，用兜底 $DEFAULT_MAX_IMAGES", it)
            }
        }.start()
    }

    // ---------------------------------------------------------------- 相册视图

    /** 纯图片 accept 才用自有相册；混合媒体（图+视频+音频，如上传工具栏）仍走系统选择器 */
    private fun isImageOnlyAccept(prompt: GeckoSession.PromptDelegate.FilePrompt): Boolean {
        val types = prompt.mimeTypes ?: return false
        if (types.isEmpty()) return false
        return types.all { it.trim().lowercase().startsWith("image/") }
    }

    private fun hasPhotoPermission(): Boolean =
        checkSelfPermission(photoPermission) == PackageManager.PERMISSION_GRANTED

    private fun showAlbumPicker(pending: PendingFilePrompt) {
        val palette = palette()
        val multiple =
            pending.prompt.type == GeckoSession.PromptDelegate.FilePrompt.Type.MULTIPLE
        val picker = AlbumPickerView(
            host = this,
            maxCount = if (multiple) maxImagesPerBatch else 1,
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
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

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
