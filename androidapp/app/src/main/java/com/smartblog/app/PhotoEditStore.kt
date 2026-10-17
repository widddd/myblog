package com.smartblog.app

import android.net.Uri
import java.io.File

/**
 * 一次相册会话里的「编辑版登记表」。
 *
 * 设计口径：
 *  - 原图（`content://`）**永远不动**；编辑结果只登记成 `cacheDir/edited/` 下的 jpg；
 *  - 交给页面的地址走 [resolve]：编辑过就是 `file://` 编辑版，没编辑过还是原 `content://`；
 *  - [revision] 供缩略图 / 预览缓存当 key：同一条 uri 重新编辑后缓存立刻失效。
 */
class PhotoEditStore {

    private val editedFiles = HashMap<String, File>()
    private val revisions = HashMap<String, Int>()

    fun editedFile(uri: Uri): File? = editedFiles[uri.toString()]

    fun isEdited(uri: Uri): Boolean = editedFiles.containsKey(uri.toString())

    fun revision(uri: Uri): Int = revisions[uri.toString()] ?: 0

    /** 缩略图 / 预览缓存 key（uri + 编辑版本）。 */
    fun keyFor(uri: Uri): String = "${uri}#${revision(uri)}"

    /** 解码 / 预览用的源：编辑过用编辑版，否则原图。 */
    fun sourceFor(uri: Uri): Uri = editedFiles[uri.toString()]?.let { Uri.fromFile(it) } ?: uri

    /** 交回 GeckoView 的地址（收口在 `confirmPending` 之前）。 */
    fun resolve(uri: Uri): Uri = sourceFor(uri)

    fun put(uri: Uri, file: File) {
        val key = uri.toString()
        editedFiles[key]?.takeIf { it.absolutePath != file.absolutePath }?.delete()
        editedFiles[key] = file
        revisions[key] = (revisions[key] ?: 0) + 1
    }
}

/**
 * 网格角标与预览底部「选择」共用的**唯一**选择集（两处各存一份必然打架）。
 */
class PickerSelection(val max: Int) {

    val selected = LinkedHashSet<Uri>()

    val size: Int get() = selected.size

    fun contains(uri: Uri): Boolean = selected.contains(uri)

    /** 已选序号（1 起，角标显示用）；未选中返回 0。 */
    fun badge(uri: Uri): Int = selected.indexOf(uri) + 1

    /** 返回 false = 已到上限，没加进去。 */
    fun toggle(uri: Uri): Boolean {
        if (selected.remove(uri)) return true
        if (selected.size >= max) return false
        selected.add(uri)
        return true
    }
}
