package com.smartblog.app

import android.app.Activity
import android.content.ContentUris
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.provider.MediaStore
import android.util.LruCache
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.AbsListView
import android.widget.BaseAdapter
import android.widget.FrameLayout
import android.widget.GridView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.Executors

/**
 * 全屏相册视图：直接读系统相册（MediaStore），而不是把用户丢进系统文件选择器。
 *
 * 只在「纯图片 accept」的 `<input type=file>` 上启用；视频/音频/任意文件仍走系统选择器
 * （见 `MainActivity.onFilePrompt`）。选几张由**服务端**决定（`GET /api/upload/limits`）。
 *
 * 顶部第二行是**相册集**：默认「全部照片」，点开可切换到某个目录（相机/截图/微信…）。
 * 切换只在已取到的列表上过滤，**不重新查库、不丢缩略图缓存**。
 *
 * 不引任何依赖：网格用 `GridView`、缩略图自己解码 + `LruCache`（不引 Glide/Coil）。
 *
 * @param maxCount 1 = 单选（点一张立刻返回）；>1 = 多选上限
 */
class AlbumPickerView(
    private val host: Activity,
    private val maxCount: Int,
    bgColor: Int,
    fgColor: Int,
    subColor: Int,
    accentColor: Int,
    private val onCancel: () -> Unit,
    private val onPicked: (List<Uri>) -> Unit,
) : FrameLayout(host) {

    private data class Photo(val uri: Uri, val bucketId: String, val bucketName: String)

    private data class Bucket(val id: String, val name: String, val count: Int, val newest: Long)

    private val single = maxCount <= 1

    /** 全部照片（查一次库就拿全，切换相册只在这上面过滤） */
    private val allPhotos = mutableListOf<Photo>()

    /** 当前相册的可见照片 */
    private val photos = mutableListOf<Photo>()

    private val buckets = mutableListOf<Bucket>()

    /** null = 全部照片 */
    private var currentBucket: String? = null

    private val selected = LinkedHashSet<Uri>()
    private val countLabel = TextView(host)
    private val albumLabel = TextView(host)
    private val bucketPanel = ScrollView(host)
    private val bucketList = LinearLayout(host)
    private val grid = GridView(host)
    private val emptyLabel = TextView(host)
    private val emptyHint = TextView(host)
    private val pool = Executors.newFixedThreadPool(3)

    // 深浅色在这里自己算（宿主只给背景色，不想为此再加一个构造参数）。
    private val dark = Color.luminance(bgColor) < 0.5f
    private val surfaceColor = if (dark) Color.parseColor("#FF2C2E33") else Color.WHITE
    private val borderColor = if (dark) Color.parseColor("#FF3C4046") else Color.parseColor("#FFE4E6EB")
    private val accent = accentColor
    private val fg = fgColor
    private val sub = subColor

    /** 缩略图缓存：按张数计（每张约 300px 宽，几十 KB），最多 120 张——低端机也不至于吃内存 */
    private val thumbs = object : LruCache<String, Bitmap>(120) {
        override fun sizeOf(key: String, value: Bitmap) = 1
    }

    private val adapter = object : BaseAdapter() {
        override fun getCount() = photos.size
        override fun getItem(position: Int) = photos[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
            val cell = (convertView as? FrameLayout) ?: createCell()
            val photo = photos[position]
            val key = photo.uri.toString()
            val image = cell.getChildAt(0) as ImageView
            val badge = cell.getChildAt(1) as TextView

            image.tag = key
            val cached = thumbs.get(key)
            if (cached != null) {
                image.setImageBitmap(cached)
            } else {
                image.setImageDrawable(null)
                loadThumb(photo, image, key)
            }

            val index = selected.indexOf(photo.uri)
            if (index >= 0) {
                cell.foreground = GradientDrawable().apply {
                    setStroke(dp(3), accent)
                    setColor(Color.TRANSPARENT)
                }
                badge.visibility = VISIBLE
                badge.text = (index + 1).toString()
            } else {
                cell.foreground = null
                badge.visibility = GONE
            }
            return cell
        }
    }

    init {
        setBackgroundColor(bgColor)
        addView(buildTopBar(fgColor, subColor, accentColor))
        addView(buildAlbumBar(fgColor, subColor))
        addView(
            grid,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT).apply {
                topMargin = dp(HEADER_DP + ALBUM_BAR_DP)
            },
        )
        grid.numColumns = 3
        grid.horizontalSpacing = dp(3)
        grid.verticalSpacing = dp(3)
        grid.setPadding(dp(3), dp(3), dp(3), dp(3))
        grid.adapter = adapter
        grid.setOnItemClickListener { _, _, position, _ -> onTap(photos[position]) }

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
        loadPhotos()
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
                if (selected.isNotEmpty()) {
                    onPicked(selected.toList())
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
            text = "全部照片 ▾"
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

    private fun updateCount() {
        countLabel.text = if (single) "选择一张照片" else "已选 ${selected.size}/$maxCount"
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
        // 「全部照片」+ 各相册集（按最近有照片的排前面，和系统相册的习惯一致）
        val entries = buildList {
            add(Triple<String?, String, Int>(null, "全部照片", allPhotos.size))
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

    /** 切换相册：只在已取到的 allPhotos 上过滤，不重新查库 */
    private fun applyBucket() {
        val bucket = buckets.firstOrNull { it.id == currentBucket }
        albumLabel.text = (if (bucket == null) "全部照片" else bucket.name) + " ▾"

        photos.clear()
        photos.addAll(
            if (currentBucket == null) allPhotos else allPhotos.filter { it.bucketId == currentBucket },
        )
        adapter.notifyDataSetChanged()

        val empty = photos.isEmpty()
        emptyLabel.text = if (empty && currentBucket != null) "这个相册里没有照片" else "相册里还没有照片"
        emptyLabel.visibility = if (empty) VISIBLE else GONE
        emptyHint.visibility = if (empty) VISIBLE else GONE
        grid.visibility = if (empty) GONE else VISIBLE
    }

    // ---------------------------------------------------------------- 选图

    private fun onTap(photo: Photo) {
        if (single) {
            onPicked(listOf(photo.uri))
            return
        }
        if (selected.contains(photo.uri)) {
            selected.remove(photo.uri)
        } else if (selected.size >= maxCount) {
            countLabel.text = "最多选 $maxCount 张"
            return
        } else {
            selected.add(photo.uri)
        }
        updateCount()
        adapter.notifyDataSetChanged()
    }

    /** 调用方收尾后必须调它：停掉解码线程并从视图树上摘掉 */
    fun shutdown() {
        pool.shutdownNow()
        thumbs.evictAll()
    }

    // ---------------------------------------------------------------- 读取相册

    private fun loadPhotos() {
        Thread {
            val found = mutableListOf<Photo>()
            val byBucket = LinkedHashMap<String, Bucket>()
            runCatching {
                val projection = arrayOf(
                    MediaStore.Images.Media._ID,
                    MediaStore.Images.Media.BUCKET_ID,
                    MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
                    MediaStore.Images.Media.DATE_ADDED,
                )
                // 新照片排在前面，符合"刚拍的想立刻发"的习惯
                host.contentResolver.query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    projection,
                    null,
                    null,
                    "${MediaStore.Images.Media.DATE_ADDED} DESC",
                )?.use { cursor ->
                    val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                    val bucketIdCol = cursor.getColumnIndex(MediaStore.Images.Media.BUCKET_ID)
                    val bucketNameCol =
                        cursor.getColumnIndex(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
                    val addedCol = cursor.getColumnIndex(MediaStore.Images.Media.DATE_ADDED)
                    while (cursor.moveToNext()) {
                        val id = cursor.getLong(idCol)
                        val bucketId =
                            if (bucketIdCol >= 0) cursor.getString(bucketIdCol) else null
                        val bucketName =
                            if (bucketNameCol >= 0) cursor.getString(bucketNameCol) else null
                        val added = if (addedCol >= 0) cursor.getLong(addedCol) else 0L
                        val photo = Photo(
                            uri = ContentUris.withAppendedId(
                                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                                id,
                            ),
                            bucketId = bucketId ?: "",
                            bucketName = bucketName?.takeIf { it.isNotBlank() } ?: "其它",
                        )
                        found += photo
                        val existing = byBucket[photo.bucketId]
                        byBucket[photo.bucketId] = Bucket(
                            id = photo.bucketId,
                            name = photo.bucketName,
                            count = (existing?.count ?: 0) + 1,
                            // cursor 已按 DATE_ADDED 倒序，第一次见到就是最新的
                            newest = existing?.newest ?: added,
                        )
                    }
                }
            }
            val bucketViews = byBucket.values.sortedByDescending { it.newest }
            host.runOnUiThread {
                allPhotos.clear()
                allPhotos.addAll(found)
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

    // ---------------------------------------------------------------- 缩略图

    private fun loadThumb(photo: Photo, image: ImageView, key: String) {
        pool.execute {
            val bitmap = runCatching { decodeThumb(photo.uri) }.getOrNull()
            if (bitmap == null) return@execute
            thumbs.put(key, bitmap)
            host.runOnUiThread {
                // 视图可能已被复用给别的照片了 —— 比对 tag 再贴，否则会串图
                if (image.tag == key) image.setImageBitmap(bitmap)
            }
        }
    }

    /** 两遍解码：先量尺寸再按 inSampleSize 采样，避免把整张原图读进内存 */
    private fun decodeThumb(uri: Uri): Bitmap? {
        val target = dp(300)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        host.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, bounds)
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (bounds.outWidth / (sample * 2) >= target || bounds.outHeight / (sample * 2) >= target) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        return host.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        }
    }

    // ---------------------------------------------------------------- 小工具

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
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#CC1F2329"))
            }
            visibility = GONE
        }
        cell.addView(
            badge,
            LayoutParams(dp(24), dp(24)).apply {
                gravity = Gravity.TOP or Gravity.END
                topMargin = dp(4)
                rightMargin = dp(4)
            },
        )
        // GridView 没有自己的 LayoutParams，用的是 AbsListView.LayoutParams
        cell.layoutParams = AbsListView.LayoutParams(AbsListView.LayoutParams.MATCH_PARENT, dp(120))
        return cell
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val HEADER_DP = 56
        const val ALBUM_BAR_DP = 44
    }
}
