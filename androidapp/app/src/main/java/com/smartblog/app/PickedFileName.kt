package com.smartblog.app

/**
 * 相册/文件选择器回传文件的临时文件名收口。
 *
 * GeckoView 读取 `file://` 副本时仍然会保留这个文件名；超长或有非法字符的名字在
 * 某些系统/文件管理器上可能落盘失败，页面表现就是“上传坏了/格式不支持”。站点最终
 * 用内容 hash 存媒体，原名不参与寻址，所以这里可以安全压短，只要保留扩展名即可。
 */
object PickedFileName {

    /** 与站点侧 `lib/upload/file-name.ts` 的上限保持一致（80）。 */
    const val MAX_LENGTH = 80

    private val unsafe = Regex("[^A-Za-z0-9._-]+")

    /**
     * 清理并截断文件名：
     * - 保留最后一个合法扩展名（1–8 位字母数字）；
     * - 主体只留 `A-Z a-z 0-9 . _ -`，其余折叠成 `_`；
     * - 空主体用 fallback 兜底；
     * - 总长不超过 [MAX_LENGTH]。
     */
    fun sanitize(raw: String?, fallback: String = "picked-${System.currentTimeMillis()}"): String {
        val trimmed = raw?.trim().orEmpty()
        val dot = trimmed.lastIndexOf('.')
        val sourceExtension =
            if (dot > 0 && dot < trimmed.length - 1) {
                trimmed.substring(dot + 1).lowercase()
            } else {
                ""
            }
        val extension =
            sourceExtension.takeIf { it.matches(Regex("[a-z0-9]{1,8}")) } ?: ""
        val rawStem = if (dot > 0 && extension.isNotEmpty()) trimmed.substring(0, dot) else trimmed
        val stem = rawStem
            .replace(unsafe, "_")
            .trim('.', '_', '-')
            .ifEmpty { fallback.replace(unsafe, "_").trim('.', '_', '-') }
            .ifEmpty { "picked" }
        val suffix = if (extension.isEmpty()) "" else ".$extension"
        val budget = (MAX_LENGTH - suffix.length).coerceAtLeast(1)
        return stem.take(budget) + suffix
    }
}
