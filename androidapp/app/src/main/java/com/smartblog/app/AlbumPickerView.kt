package com.smartblog.app

import android.app.Activity
import android.content.ContentUris
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import android.util.LruCache
import android.util.Size
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.AbsListView
import android.widget.BaseAdapter
import android.widget.CheckBox
import android.widget.FrameLayout
import android.widget.GridView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.util.Locale
import java.util.concurrent.Executors

/**
 * 全屏相册视图：直接读系统相册（MediaStore），而不是把用户丢进系统文件选择器。
 *
 * 只在「纯图片 / 纯视频 / 图片+视频」的 accept 上启用（判定见 `MediaKinds.kt` 的 `albumMediaForTypes`）；
 * 带音频或任意文件的混合 accept 仍走系统选择器（见 `MainActivity.onFilePrompt`）。
 * 选几个由**服务端**决定（`GET /api/upload/limits` 的 `maxImages`）。
 *
 * 2026-10 起支持视频（见 docs/moment-video-spec.md）：
 *  - 数据源是 Images + Video 两路查询按 `DATE_ADDED DESC` 归并；相册集（bucket）合并统计；
 *  - 视频缩略图走系统（API 29+ `loadThumbnail`，26–28 `MediaStore.Video.Thumbnails`），失败给 ▶ 占位块；
 *  - 点视频格进 `VideoPreviewView`（播放 + 「选择」），点图片仍进 `PhotoPreviewView`；
 *  - 允许视频时顶部多一行「自动压缩视频」勾选框（默认开）：码率 >4Mbps 或 >50MB（或超站点单文件上限）
 *    的视频在「完成」后先压再交，压缩中显示进度与取消。
 *
 * 顶部第二行是**相册集**：默认「全部媒体」，点开可切换到某个目录（相机/截图/微信…）。
 * 切换只在已取到的列表上过滤，**不重新查库、不丢缩略图缓存**。
 *
 * 不引任何依赖：网格用 `GridView`、缩略图自己解码 + `LruCache`、播放器用系统 `VideoView`。
 *
 * @param maxCount 1 = 单选（点一张进预览，预览里「选择」即返回）；>1 = 多选上限
 * @param kinds 这一路 accept 允许的媒体（图片 / 视频）
 * @param serverMaxBytes 站点单文件上限（压缩目标），0 = 还没取到
 * @param compressorAvailable 这个构建里有没有 ffmpeg（armeabi-v7a 没有）
 */
class AlbumPickerView(
    private val host: Activity,
    private val maxCount: Int,
    private val kinds: AlbumMedia,
    private val serverMaxBytes: Long,
    private val compressorAvailable: Boolean,
    bgColor: Int,
    fgColor: Int,
    subColor: Int,
    accentColor: Int,
    private val onCancel: () -> Unit,
    private val onPicked: (List<Uri>) -> Unit,
) : FrameLayout(host) {

    private data class MediaItem(
        val uri: Uri,
        val bucketId: String,
        val bucketName: String,
        val video: Boolean,
        val addedAt: Long,
        val sizeBytes: Long,
        val durationMs: Long,
        val bitrateBps: Long,
        val width: Int,
        val height: Int,
        /** 真实 mime（视频用；MediaStore 的 pending 行也给得出 mime_type，体积/时长反而可能是 NULL） */
        val mime: String,
    ) {
        fun meta(): VideoMeta =
            VideoMeta(
                sizeBytes = sizeBytes,
                durationMs = durationMs,
                bitrateBps = bitrateBps,
                width = width,
                height = height,
                mime = mime,
            )
    }

    private data class Bucket(val id: String, val name: String, val count: Int, val newest: Long)

    private val single = maxCount <= 1

    /** 全部媒体（查一次库就拿全，切换相册只在这上面过滤） */
    private val allItems = mutableListOf<MediaItem>()

    /** 当前相册的可见媒体 */
    private val items = mutableListOf<MediaItem>()

    private val buckets = mutableListOf<Bucket>()

    /** null = 全部媒体 */
    private var currentBucket: String? = null

    /** 编辑版登记表 + 网格/预览共用的选择集（预览里勾选会立刻反映到网格角标）。 */
    private val store = PhotoEditStore()
    private val selection = PickerSelection(maxCount)
    private var preview: PhotoPreviewView? = null
    private var videoPreview: VideoPreviewView? = null
    private var compressor: VideoCompressor? = null
    private val countLabel = TextView(host)
    private val albumLabel = TextView(host)
    private val bucketPanel = ScrollView(host)
    private val bucketList = LinearLayout(host)
    private val grid = GridView(host)
    private val emptyLabel = TextView(host)
    private val emptyHint = TextView(host)
    private val autoCompressBox = CheckBox(host)
    private val compressOverlay = FrameLayout(host)
    private val compressLabel = TextView(host)
    private val compressBar = ProgressBar(host, null, android.R.attr.progressBarStyleHorizontal)
    private val pool = Executors.newFixedThreadPool(3)

    /** 勾选框状态：默认开（用户口径「自动压缩…当然这个也可以关了」） */
    private var autoCompress = true

    // 深浅色在这里自己算（宿主只给背景色，不想为此再加一个构造参数）。
    private val dark = Color.luminance(bgColor) < 0.5f
    private val surfaceColor = if (dark) Color.parseColor("#FF2C2E33") else Color.WHITE
    private val borderColor = if (dark) Color.parseColor("#FF3C4046") else Color.parseColor("#FFE4E6EB")
    private val accent = accentColor
    private val fg = fgColor
    private val sub = subColor

    /** 有勾选框那一行时，网格要往下让一行的距离 */
    private val headerOffsetDp: Int
        get() = HEADER_DP + ALBUM_BAR_DP + if (kinds.videos) COMPRESS_BAR_DP else 0

    /** 缩略图缓存：按张数计（每张约 300px 宽，几十 KB），最多 120 张——低端机也不至于吃内存 */
    private val thumbs = object : LruCache<String, Bitmap>(120) {
        override fun sizeOf(key: String, value: Bitmap) = 1
    }

    private val adapter = object : BaseAdapter() {
        override fun getCount() = items.size
        override fun getItem(position: Int) = items[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
            val cell = (convertView as? FrameLayout) ?: createCell()
            val item = items[position]
            // 编辑过的照片缩略图换成编辑版（key 带 revision，重新编辑后缓存立刻失效）
            val key = store.keyFor(item.uri)
            val image = cell.getChildAt(0) as ImageView
            val badge = cell.getChildAt(1) as TextView
            val duration = cell.getChildAt(2) as TextView
            val size = cell.getChildAt(3) as TextView

            image.tag = key
            val cached = thumbs.get(key)
            if (cached != null) {
                image.setImageBitmap(cached)
            } else {
                image.setImageDrawable(null)
                loadThumb(item, key, image)
            }

            if (item.video) {
                duration.text = clockOf(item.durationMs)
                duration.visibility = VISIBLE
                // 视频把**体积**也标出来：挑片时要按大小判断（勾了自动压缩也是拿它当判据之一）
                size.text = fileSizeLabel(item.sizeBytes)
                size.visibility = if (size.text.isEmpty()) GONE else VISIBLE
            } else {
                duration.visibility = GONE
                size.visibility = GONE
            }

            if (single) {
                badge.visibility = GONE
            } else {
                badge.visibility = VISIBLE
                badge.tag = item.uri
                updateBadge(badge, selection.badge(item.uri))
            }
            return cell
        }
    }

    init {
        setBackgroundColor(bgColor)
        addView(buildTopBar(fgColor, subColor, accentColor))
        addView(buildAlbumBar(fgColor, subColor))
        if (kinds.videos) {
            addView(buildCompressBar(fgColor, subColor))
        }
        addView(
            grid,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT).apply {
                topMargin = dp(headerOffsetDp)
            },
        )
        grid.numColumns = 3
        grid.horizontalSpacing = dp(3)
        grid.verticalSpacing = dp(3)
        grid.setPadding(dp(3), dp(3), dp(3), dp(3))
        grid.adapter = adapter
        grid.setOnItemClickListener { _, _, position, _ -> onTap(position) }

        addView(
            emptyLabel,
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.CENTER
            },
        )
        emptyLabel.setTextColor(fgColor)
        emptyLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        emptyLabel.visibility = GONE

        addView(
            emptyHint,
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.CENTER
                topMargin = dp(40)
            },
        )
        emptyHint.setTextColor(subColor)
        emptyHint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        emptyHint.visibility = GONE

        buildBucketPanel(fgColor, subColor)
        buildCompressOverlay()
        loadMedia()
    }

    // ---------------------------------------------------------------- 顶部两行

    private fun buildTopBar(fgColor: Int, subColor: Int, accentColor: Int): View {
        val bar = LinearLayout(host).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), 0, dp(8), 0)
        }
        bar.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(HEADER_DP))

        val cancel = TextView(host).apply {
            text = "取消"
            setTextColor(subColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setOnClickListener { onCancel() }
        }
        countLabel.apply {
            gravity = Gravity.CENTER
            setTextColor(fgColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        }
        val done = TextView(host).apply {
            text = if (single) "" else "完成"
            setTextColor(accentColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            visibility = if (single) GONE else VISIBLE
            setOnClickListener {
                if (selection.selected.isNotEmpty()) {
                    confirmSelection()
                }
            }
        }

        bar.addView(cancel)
        bar.addView(
            countLabel,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
        )
        bar.addView(done)
        updateCount()
        return bar
    }

    /**
     * 第二行：当前相册名 ▾。点一下展开相册集列表。
     *
     * ⚠️ 用 FrameLayout 而不是横向 LinearLayout：分隔线是 MATCH_PARENT 宽，
     * 放进横排会把标题挤成 0 宽（踩过一次：只剩一条线、看不到相册名）。
     */
    private fun buildAlbumBar(fgColor: Int, subColor: Int): View {
        val bar = FrameLayout(host).apply {
            setBackgroundColor(surfaceColor)
            isClickable = true
            setOnClickListener { toggleBucketPanel() }
        }
        bar.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(ALBUM_BAR_DP)).apply {
            topMargin = dp(HEADER_DP)
        }

        albumLabel.apply {
            setTextColor(fgColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            text = "全部媒体 ▾"
        }
        bar.addView(
            albumLabel,
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.CENTER_VERTICAL
                leftMargin = dp(20)
            },
        )
        // 分隔线：让"这行可以点"更明显一点
        bar.addView(
            View(host).apply { setBackgroundColor(borderColor) },
            LayoutParams(LayoutParams.MATCH_PARENT, dp(1)).apply { gravity = Gravity.BOTTOM },
        )
        return bar
    }

    /**
     * 第三行（只在允许视频时出现）：「自动压缩视频」。
     *
     * 勾选框是**这一屏的状态**，不是站点设置：站长在 App 里临时决定这次要不要压，
     * 关掉就原样上传（超站点上限时由服务端拒，页面上会有提示）。
     */
    private fun buildCompressBar(fgColor: Int, subColor: Int): View {
        val bar = LinearLayout(host).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), 0, dp(16), 0)
            setBackgroundColor(surfaceColor)
        }
        bar.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(COMPRESS_BAR_DP)).apply {
            topMargin = dp(HEADER_DP + ALBUM_BAR_DP)
        }

        autoCompressBox.apply {
            text = "自动压缩视频"
            setTextColor(fgColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            isChecked = true
            isEnabled = compressorAvailable
            setOnCheckedChangeListener { _, checked -> autoCompress = checked }
        }
        val hint = TextView(host).apply {
            text =
                if (compressorAvailable) {
                    "码率 >4Mbps、>50MB 或非 mp4/webm 时自动压缩"
                } else {
                    "此版本不含压缩器，视频原样上传"
                }
            setTextColor(subColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        }
        bar.addView(autoCompressBox)
        bar.addView(
            hint,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                leftMargin = dp(8)
            },
        )
        return bar
    }

    private fun updateCount() {
        countLabel.text = if (single) singleHint() else "已选 ${selection.size}/$maxCount"
    }

    private fun singleHint(): String =
        when {
            kinds.both -> "选择照片或视频"
            kinds.videos -> "选择一段视频"
            else -> "选择一张照片"
        }

    private fun mediaNoun(): String =
        when {
            kinds.both -> "媒体"
            kinds.videos -> "视频"
            else -> "照片"
        }

    /** 角标样式：未选 = 半透明描边圆；已选 = 主色实心圆 + 序号。 */
    private fun updateBadge(badge: TextView, order: Int) {
        badge.text = if (order > 0) order.toString() else ""
        badge.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(if (order > 0) accent else Color.parseColor("#66000000"))
            setStroke(dp(2), if (order > 0) Color.WHITE else Color.parseColor("#CCFFFFFF"))
        }
    }

    // ---------------------------------------------------------------- 相册集

    private fun buildBucketPanel(fgColor: Int, subColor: Int) {
        bucketList.orientation = LinearLayout.VERTICAL
        bucketList.setPadding(0, dp(6), 0, dp(6))
        bucketPanel.addView(bucketList)
        bucketPanel.setBackgroundColor(surfaceColor)
        bucketPanel.background = GradientDrawable().apply {
            setColor(surfaceColor)
            cornerRadius = dp(10).toFloat()
            setStroke(dp(1), borderColor)
        }
        bucketPanel.elevation = dp(8).toFloat()
        bucketPanel.visibility = GONE
        addView(
            bucketPanel,
            LayoutParams(dp(240), LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.TOP or Gravity.START
                topMargin = dp(HEADER_DP + ALBUM_BAR_DP - 6)
                leftMargin = dp(12)
            },
        )
        bucketPanel.layoutParams.height = LayoutParams.WRAP_CONTENT
    }

    private fun toggleBucketPanel() {
        if (buckets.isEmpty()) return
        refreshBucketPanel()
        bucketPanel.visibility = if (bucketPanel.visibility == VISIBLE) GONE else VISIBLE
    }

    private fun refreshBucketPanel() {
        bucketList.removeAllViews()
        // 「全部媒体」+ 各相册集（按最近有照片的排前面，和系统相册的习惯一致）
        val entries = buildList {
            add(Triple<String?, String, Int>(null, "全部${mediaNoun()}", allItems.size))
            buckets.forEach { add(Triple<String?, String, Int>(it.id, it.name, it.count)) }
        }
        entries.forEach { (id, name, count) ->
            val row = TextView(host).apply {
                text = "$name ($count)"
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
                setPadding(dp(16), dp(11), dp(16), dp(11))
                setTextColor(if (id == currentBucket) accent else fg)
                setOnClickListener {
                    currentBucket = id
                    bucketPanel.visibility = GONE
                    applyBucket()
                }
            }
            bucketList.addView(
                row,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
    }

    /** 切换相册：只在已取到的 allItems 上过滤，不重新查库 */
    private fun applyBucket() {
        val bucket = buckets.firstOrNull { it.id == currentBucket }
        albumLabel.text = (if (bucket == null) "全部${mediaNoun()}" else bucket.name) + " ▾"

        items.clear()
        items.addAll(
            if (currentBucket == null) allItems else allItems.filter { it.bucketId == currentBucket },
        )
        adapter.notifyDataSetChanged()

        val empty = items.isEmpty()
        emptyLabel.text = if (empty && currentBucket != null) "这个相册里没有${mediaNoun()}" else "相册里还没有${mediaNoun()}"
        emptyLabel.visibility = if (empty) VISIBLE else GONE
        emptyHint.visibility = if (empty) VISIBLE else GONE
        grid.visibility = if (empty) GONE else VISIBLE
    }

    // ---------------------------------------------------------------- 选图 / 预览

    /** 点缩略图 = 进预览（像微信）；勾选走右上角角标，不再"点一下就直接返回"。 */
    private fun onTap(index: Int) {
        val item = items.getOrNull(index) ?: return
        if (item.video) openVideoPreview(item) else openPhotoPreview(item)
    }

    /** 角标点击：勾选 / 取消（单选模式不显示角标）。 */
    private fun toggleSelection(uri: Uri?) {
        if (uri == null || single) return
        if (!selection.toggle(uri)) {
            countLabel.text = "最多选 $maxCount 个"
            return
        }
        updateCount()
        adapter.notifyDataSetChanged()
    }

    /** 图片预览只吃**图片**：网格现在可能混着视频，媒体列表照搬进去会让轮播翻到视频上。 */
    private fun openPhotoPreview(item: MediaItem) {
        if (preview != null || videoPreview != null) return
        val imageUris = items.filter { !it.video }.map { it.uri }
        val index = imageUris.indexOf(item.uri)
        if (index < 0) return
        val view = PhotoPreviewView(
            host = host,
            photos = imageUris,
            initialIndex = index,
            store = store,
            selection = selection,
            single = single,
            palette = hostPalette(host),
            onBack = { closePreview() },
            onConfirm = { confirmSelection() },
            onEdited = {
                // 编辑完成：网格缩略图与计数都刷新（key 带 revision，会重新解码编辑版）
                updateCount()
                adapter.notifyDataSetChanged()
            },
        )
        preview = view
        addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    private fun openVideoPreview(item: MediaItem) {
        if (preview != null || videoPreview != null) return
        val palette = hostPalette(host)
        val view = VideoPreviewView(
            host = host,
            uri = item.uri,
            bgColor = Color.BLACK,
            fgColor = palette.title,
            subColor = palette.hint,
            accentColor = palette.primary,
            onBack = { closePreview() },
            onPick = { pickVideoFromPreview(item.uri) },
        )
        videoPreview = view
        addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    /** 视频预览里的「选择」：勾上这段（若还没勾）再走同一条确认链路。 */
    private fun pickVideoFromPreview(uri: Uri) {
        if (!selection.contains(uri)) {
            if (!selection.toggle(uri)) {
                countLabel.text = "最多选 $maxCount 个"
                return
            }
            updateCount()
            adapter.notifyDataSetChanged()
        }
        confirmSelection()
    }

    private fun closePreview() {
        preview?.let { view ->
            preview = null
            removeView(view)
            view.shutdown()
        }
        videoPreview?.let { view ->
            videoPreview = null
            removeView(view)
            view.shutdown()
        }
        updateCount()
        adapter.notifyDataSetChanged()
    }

    /** 把选择收口成「编辑过的取编辑版」再交给调用方（MainActivity.confirmPending）。 */
    private fun confirmSelection() {
        if (selection.selected.isEmpty()) return
        // 用 allItems 而不是当前相册的 items：切过相册之后选择仍要认（有可能一半在别的目录里）
        val chosen = selection.selected.mapNotNull { uri -> allItems.firstOrNull { it.uri == uri } }
        val resolved = selection.selected.map { store.resolve(it) }
        closePreview()

        // 选到的视频一律先过规则与压缩裁决：**规则（30 分钟上限）与勾选框无关**，
        // 所以没有勾选框、没有压缩器（armeabi-v7a）时也要走这一趟；压缩只在「勾选框开着 + 有压缩器」时做。
        // 探测与裁决都放**后台线程**：大 H.265/HEVC 文件上 stat/取元信息都可能很慢，放主线程会 ANR。
        if (chosen.none { it.video }) {
            onPicked(resolved)
            return
        }
        val compressing = autoCompress && compressorAvailable
        showChecking()
        Thread {
            val metas = HashMap<String, VideoMeta>()
            val refusals = mutableListOf<String>()
            for (item in chosen) {
                if (!item.video) {
                    continue
                }
                val filled = MediaProbe.fillMissing(host, item.uri, item.meta())
                metas[item.uri.toString()] = filled
                val verdict = CompressPolicy.decide(filled, compressing, serverMaxBytes)
                // 一次选择只留一行日志：压谁、跳谁、拒绝谁（拒绝的必须可查 —— 用户看到的是"点了没反应"）
                Log.i(
                    LOG_TAG,
                    "压缩裁决：${item.bucketName}/${filled.sizeBytes} 字节/${filled.durationMs}ms " +
                        "${filled.mime} → " +
                        when {
                            verdict.refusal != null -> "拒绝：${verdict.refusal}"
                            verdict.compress -> "要压（长边 ${verdict.plan?.maxLongEdge}）"
                            else -> "不用压"
                        },
                )
                verdict.refusal?.let { refusals += it }
            }
            host.runOnUiThread {
                compressOverlay.visibility = GONE
                if (refusals.isNotEmpty()) {
                    Toast.makeText(host, refusals.first(), Toast.LENGTH_LONG).show()
                    updateCount()
                    adapter.notifyDataSetChanged()
                    return@runOnUiThread
                }
                val toCompress = chosen.filter { item ->
                    CompressPolicy
                        .decide(metas[item.uri.toString()] ?: item.meta(), compressing, serverMaxBytes)
                        .compress
                }
                if (toCompress.isEmpty()) {
                    onPicked(resolved)
                    return@runOnUiThread
                }
                startCompression(resolved, toCompress, metas)
            }
        }.start()
    }

    /** 探测阶段的小提示（复用压缩那层遮罩，只是不给百分比）。 */
    private fun showChecking() {
        compressLabel.text = "正在检查视频…"
        compressBar.isIndeterminate = true
        compressOverlay.visibility = VISIBLE
    }

    // ---------------------------------------------------------------- 压缩

    private fun buildCompressOverlay() {
        compressOverlay.apply {
            setBackgroundColor(Color.parseColor("#99000000"))
            isClickable = true
            visibility = GONE
        }
        val card = LinearLayout(host).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(18), dp(20), dp(16))
            background = GradientDrawable().apply {
                setColor(surfaceColor)
                cornerRadius = dp(12).toFloat()
                setStroke(dp(1), borderColor)
            }
        }
        compressLabel.apply {
            setTextColor(fg)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            text = "正在压缩…"
        }
        compressBar.apply {
            max = 100
            progress = 0
        }
        val cancel = TextView(host).apply {
            text = "取消压缩"
            setTextColor(accent)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(10), dp(12), dp(4))
            setOnClickListener { cancelCompression() }
        }
        card.addView(compressLabel)
        card.addView(
            compressBar,
            LinearLayout.LayoutParams(dp(220), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(10)
            },
        )
        card.addView(cancel)
        compressOverlay.addView(
            card,
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.CENTER
            },
        )
        addView(
            compressOverlay,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
    }

    /**
     * 逐个压缩，压完再统一交给页面。
     *
     * 失败/取消的那一个**退回原文件**（而不是整个操作失败）：用户要的是"发出去"，
     * 一个压不了的文件不该让整条瞬间发不出去。
     */
    private fun startCompression(
        resolved: List<Uri>,
        videos: List<MediaItem>,
        metas: Map<String, VideoMeta>,
    ) {
        val engine = VideoCompressor(host)
        compressor = engine
        val compressed = HashMap<String, Uri>()
        compressOverlay.visibility = VISIBLE

        fun step(index: Int) {
            if (index >= videos.size) {
                compressor = null
                compressOverlay.visibility = GONE
                onPicked(resolved.map { compressed[it.toString()] ?: it })
                return
            }
            val item = videos[index]
            updateCompressProgress(index + 1, videos.size, 0)
            engine.compress(
                source = item.uri,
                meta = metas[item.uri.toString()] ?: item.meta(),
                serverMaxBytes = serverMaxBytes,
                onProgress = { percent ->
                    host.runOnUiThread { updateCompressProgress(index + 1, videos.size, percent) }
                },
                onDone = { file ->
                    if (file != null) {
                        compressed[item.uri.toString()] = Uri.fromFile(file)
                    }
                    host.runOnUiThread { step(index + 1) }
                },
            )
        }

        step(0)
    }

    private fun updateCompressProgress(index: Int, total: Int, percent: Int) {
        compressBar.isIndeterminate = false
        compressLabel.text = "正在压缩 $index/$total · $percent%"
        compressBar.progress = percent.coerceIn(0, 100)
    }

    /** 取消 = 停掉压缩、回到网格（选择还在，用户可以少选几个或关掉勾选框重试）。 */
    private fun cancelCompression() {
        compressor?.cancel()
        compressor = null
        compressOverlay.visibility = GONE
        updateCount()
        adapter.notifyDataSetChanged()
    }

    /** 系统返回键先给叠层：压缩 → 视频预览 → 图片预览（内部再先关编辑器）→ false = 交回 Activity。 */
    fun handleBack(): Boolean {
        if (compressOverlay.visibility == VISIBLE) {
            cancelCompression()
            return true
        }
        videoPreview?.let { return it.handleBack() }
        val view = preview ?: return false
        return view.handleBack()
    }

    fun hasOverlay(): Boolean =
        preview != null || videoPreview != null || compressOverlay.visibility == VISIBLE

    /** 调用方收尾后必须调它：停掉解码线程、取消压缩、关掉预览并从视图树上摘掉 */
    fun shutdown() {
        compressor?.cancel()
        compressor = null
        closePreview()
        pool.shutdownNow()
        thumbs.evictAll()
    }

    // ---------------------------------------------------------------- 读取相册

    private fun loadMedia() {
        Thread {
            val found = mutableListOf<MediaItem>()
            if (kinds.images) {
                runCatching { queryImages(found) }.onFailure {
                    Log.w(LOG_TAG, "查询系统相册图片失败", it)
                }
            }
            if (kinds.videos) {
                runCatching { queryVideos(found) }.onFailure {
                    Log.w(LOG_TAG, "查询系统相册视频失败", it)
                }
            }
            // 两路各自按时间倒序，合并后整体重排（刚拍的/刚录的都在最前）
            val sorted = found.sortedByDescending { it.addedAt }
            val byBucket = LinkedHashMap<String, Bucket>()
            for (item in sorted) {
                val existing = byBucket[item.bucketId]
                byBucket[item.bucketId] = Bucket(
                    id = item.bucketId,
                    name = item.bucketName,
                    count = (existing?.count ?: 0) + 1,
                    newest = existing?.newest ?: item.addedAt,
                )
            }
            val bucketViews = byBucket.values.sortedByDescending { it.newest }
            Log.i(
                LOG_TAG,
                "相册载入：图片=${found.count { !it.video }} 视频=${found.count { it.video }} 合计=${sorted.size} " +
                    "首条=${sorted.firstOrNull()?.bucketName ?: "-"}/${sorted.firstOrNull()?.mime ?: "-"}",
            )
            host.runOnUiThread {
                allItems.clear()
                allItems.addAll(sorted)
                buckets.clear()
                buckets.addAll(bucketViews)
                // 切过一次相册的话保持选择；那个相册没了就回到全部
                if (currentBucket != null && buckets.none { it.id == currentBucket }) {
                    currentBucket = null
                }
                applyBucket()
            }
        }.start()
    }

    private fun queryImages(found: MutableList<MediaItem>) {
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.BUCKET_ID,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
        )
        host.contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            "${MediaStore.Images.Media.DATE_ADDED} DESC",
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                found += MediaItem(
                    uri = ContentUris.withAppendedId(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        cursor.getLong(0),
                    ),
                    bucketId = cursor.stringAt(1) ?: "",
                    bucketName = cursor.stringAt(2)?.takeIf { it.isNotBlank() } ?: "其它",
                    video = false,
                    addedAt = cursor.longAt(3),
                    sizeBytes = cursor.longAt(4),
                    durationMs = 0,
                    bitrateBps = 0,
                    width = cursor.intAt(5),
                    height = cursor.intAt(6),
                    // 图片不参与压缩，mime 不取（省一列）
                    mime = "",
                )
            }
        }
    }

    private fun queryVideos(found: MutableList<MediaItem>) {
        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.BUCKET_ID,
            MediaStore.Video.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Video.Media.DATE_ADDED,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.WIDTH,
            MediaStore.Video.Media.HEIGHT,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.BITRATE,
            MediaStore.Video.Media.MIME_TYPE,
        )
        host.contentResolver.query(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            "${MediaStore.Video.Media.DATE_ADDED} DESC",
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                found += MediaItem(
                    uri = ContentUris.withAppendedId(
                        MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                        cursor.getLong(0),
                    ),
                    bucketId = cursor.stringAt(1) ?: "",
                    bucketName = cursor.stringAt(2)?.takeIf { it.isNotBlank() } ?: "其它",
                    video = true,
                    addedAt = cursor.longAt(3),
                    sizeBytes = cursor.longAt(4),
                    width = cursor.intAt(5),
                    height = cursor.intAt(6),
                    durationMs = cursor.longAt(7),
                    bitrateBps = cursor.longAt(8),
                    // 体积/时长可能是 NULL（pending 行），mime 一般有；真值兜底见 MediaProbe
                    mime = cursor.stringAt(9) ?: "",
                )
            }
        }
    }

    // ---------------------------------------------------------------- 缩略图

    private fun loadThumb(item: MediaItem, key: String, image: ImageView) {
        pool.execute {
            val bitmap = runCatching {
                if (item.video) {
                    videoThumbnail(item.uri)
                } else {
                    // 统一走 PhotoFiles.decode：两遍解码 + EXIF 方向纠正（竖拍照片不再躺倒）
                    PhotoFiles.decode(host, store.sourceFor(item.uri), dp(300))
                }
            }.getOrNull()
            if (bitmap == null) {
                // 拿不到系统缩略图（个别机型/损坏文件）：留一块深色底 + 时长角标，不做假图
                if (item.video) {
                    host.runOnUiThread {
                        if (image.tag == key) image.setBackgroundColor(PLACEHOLDER_COLOR)
                    }
                }
                return@execute
            }
            thumbs.put(key, bitmap)
            host.runOnUiThread {
                // 视图可能已被复用给别的照片了 —— 比对 tag 再贴，否则会串图
                if (image.tag == key) image.setImageBitmap(bitmap)
            }
        }
    }

    /** 视频缩略图：API 29+ 用 `loadThumbnail`，26–28 退回 `MediaStore.Video.Thumbnails`。 */
    private fun videoThumbnail(uri: Uri): Bitmap? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return host.contentResolver.loadThumbnail(uri, Size(dp(300), dp(300)), null)
        }
        @Suppress("DEPRECATION")
        return MediaStore.Video.Thumbnails.getThumbnail(
            host.contentResolver,
            ContentUris.parseId(uri),
            MediaStore.Video.Thumbnails.MINI_KIND,
            null,
        )
    }

    // ---------------------------------------------------------------- 小工具

    /** 视频时长角标：`m:ss`（超过一小时给 `h:mm:ss`）。 */
    private fun clockOf(durationMs: Long): String {
        if (durationMs <= 0) return ""
        val total = durationMs / 1000
        val hours = total / 3600
        val minutes = (total % 3600) / 60
        val seconds = total % 60
        return if (hours > 0) {
            String.format("%d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format("%d:%02d", minutes, seconds)
        }
    }

    /**
     * 视频体积角标：`820 KB` / `12.3 MB` / `1.2 GB`。
     *
     * 固定用 `Locale.US`：部分区域用逗号做小数点（`12,3 MB`），在中文站点里看着像两个数。
     * 拿不到大小（个别 ROM 的 SIZE 列是空/0）返回空串，调用方会把角标整个藏起来。
     */
    private fun fileSizeLabel(bytes: Long): String {
        if (bytes <= 0) return ""
        val kb = bytes / 1024.0
        val mb = kb / 1024.0
        return when {
            mb >= 1024 -> String.format(Locale.US, "%.1f GB", mb / 1024.0)
            mb >= 10 -> String.format(Locale.US, "%.0f MB", mb)
            mb >= 1 -> String.format(Locale.US, "%.1f MB", mb)
            else -> String.format(Locale.US, "%.0f KB", kb)
        }
    }

    private fun createCell(): FrameLayout {
        val cell = FrameLayout(host)
        val image = ImageView(host).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        cell.addView(
            image,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
        val badge = TextView(host).apply {
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setOnClickListener { toggleSelection(it.tag as? Uri) }
        }
        cell.addView(
            badge,
            LayoutParams(dp(26), dp(26)).apply {
                gravity = Gravity.TOP or Gravity.END
                topMargin = dp(4)
                rightMargin = dp(4)
            },
        )
        // 时长角标（只有视频显示）：左下角小块半透明底
        val duration = TextView(host).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setPadding(dp(5), dp(1), dp(5), dp(1))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#99000000"))
                cornerRadius = dp(4).toFloat()
            }
            visibility = GONE
        }
        cell.addView(
            duration,
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.BOTTOM or Gravity.START
                leftMargin = dp(4)
                bottomMargin = dp(4)
            },
        )
        // 体积角标（只有视频显示）：右下角，样式与时长角标同一套
        val size = TextView(host).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setPadding(dp(5), dp(1), dp(5), dp(1))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#99000000"))
                cornerRadius = dp(4).toFloat()
            }
            visibility = GONE
        }
        cell.addView(
            size,
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                rightMargin = dp(4)
                bottomMargin = dp(4)
            },
        )
        // GridView 没有自己的 LayoutParams，用的是 AbsListView.LayoutParams
        cell.layoutParams = AbsListView.LayoutParams(AbsListView.LayoutParams.MATCH_PARENT, dp(120))
        return cell
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val LOG_TAG = "SmartBlog"
        const val HEADER_DP = 56
        const val ALBUM_BAR_DP = 44
        const val COMPRESS_BAR_DP = 40

        /** 视频缩略图拿不到时的占位底色（深色，跟视频格子的观感一致） */
        const val PLACEHOLDER_COLOR = 0xFF1A1D24.toInt()
    }
}

/** 列下标越界/类型不符时给个安全值（不同 ROM 的 MediaStore 列偶有出入）。 */
private fun android.database.Cursor.stringAt(index: Int): String? =
    if (index >= 0 && index < columnCount && !isNull(index)) getString(index) else null

private fun android.database.Cursor.longAt(index: Int): Long =
    if (index >= 0 && index < columnCount && !isNull(index)) getLong(index) else 0L

private fun android.database.Cursor.intAt(index: Int): Int =
    if (index >= 0 && index < columnCount && !isNull(index)) getInt(index) else 0
