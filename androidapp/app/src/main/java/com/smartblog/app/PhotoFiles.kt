package com.smartblog.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * 相册 / 预览 / 编辑器共用的**位图读写**（单一事实源）。
 *
 * 三件事在这里定：
 *  1. 解码一律**两遍**（先 `inJustDecodeBounds` 量尺寸，再按 `inSampleSize` 采样）+ **EXIF 方向纠正**
 *     —— 相册缩略图以前不做 EXIF 纠正，竖拍照片会躺倒；预览/编辑必须纠正，顺便统一；
 *  2. 编辑结果只落 `cacheDir/edited/`（JPEG），**系统相册原图一个字节都不动**；
 *  3. 大图解码失败（OOM）只降级一次，绝不把编辑器卡死在"加载中"。
 */
object PhotoFiles {

    private const val LOG_TAG = "SmartBlog"
    private const val EDITED_DIR = "edited"

    /** 编辑工作位图的长边上限：再大就只是吃内存（2560 长边对博客配图足够清晰）。 */
    const val EDIT_MAX_DIMENSION = 2560

    /** 预览解码上限：屏幕上看不出差别，但内存少一半。 */
    const val PREVIEW_MAX_DIMENSION = 2048

    const val JPEG_QUALITY = 92

    private fun editedDir(context: Context): File =
        File(context.cacheDir, EDITED_DIR).apply { if (!exists()) mkdirs() }

    /**
     * 清掉上一次会话留下的编辑产物。
     *
     * ⚠️ 只能在**打开相册之前**调：`AlbumPickerView.shutdown()` 不能清 —— 点「完成」时
     * `closeAlbumPicker()` 先跑，`confirmPending()` 才把编辑版拷进 `picked/`，清早了会丢文件。
     */
    fun clearEditedDir(context: Context) {
        File(context.cacheDir, EDITED_DIR).listFiles()?.forEach { it.delete() }
    }

    /** 把编辑结果写成一个新的缓存文件；失败返回 null（调用方按原图处理）。 */
    fun saveEdited(context: Context, bitmap: Bitmap): File? {
        val file = File(editedDir(context), "edited-${System.currentTimeMillis()}.jpg")
        return try {
            FileOutputStream(file).use { output ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)
            }
            file
        } catch (error: Exception) {
            Log.w(LOG_TAG, "保存编辑结果失败", error)
            file.delete()
            null
        }
    }

    /**
     * 采样解码 + EXIF 方向纠正；长边不超过 [maxDimension]（**不放大**原图）。
     *
     * `content://`（系统相册）与 `file://`（编辑产物）都走同一个口。
     */
    fun decode(context: Context, uri: Uri, maxDimension: Int): Bitmap? {
        return try {
            decodeOnce(context, uri, maxDimension)
        } catch (error: OutOfMemoryError) {
            Log.w(LOG_TAG, "解码内存不足，降一半再试：$uri")
            runCatching { decodeOnce(context, uri, maxDimension / 2) }.getOrNull()
        }
    }

    private fun decodeOnce(context: Context, uri: Uri, maxDimension: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, bounds)
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / sample > maxDimension) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        } ?: return null

        val scaled = if (max(decoded.width, decoded.height) > maxDimension) {
            val ratio = maxDimension.toFloat() / max(decoded.width, decoded.height)
            val target = Bitmap.createScaledBitmap(
                decoded,
                (decoded.width * ratio).roundToInt().coerceAtLeast(1),
                (decoded.height * ratio).roundToInt().coerceAtLeast(1),
                true,
            )
            if (target != decoded) decoded.recycle()
            target
        } else {
            decoded
        }
        return applyExifOrientation(context, uri, scaled)
    }

    /** EXIF 方向（竖拍 / 镜像）纠正；认不出的方向原样返回。 */
    private fun applyExifOrientation(context: Context, uri: Uri, bitmap: Bitmap): Bitmap {
        val orientation = runCatching {
            context.contentResolver.openInputStream(uri)?.use { stream ->
                ExifInterface(stream).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL,
                )
            }
        }.getOrNull() ?: ExifInterface.ORIENTATION_NORMAL

        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.postRotate(90f)
                matrix.postScale(-1f, 1f)
            }

            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.postRotate(270f)
                matrix.postScale(-1f, 1f)
            }

            else -> return bitmap
        }
        return try {
            val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (rotated != bitmap) bitmap.recycle()
            rotated
        } catch (error: Exception) {
            Log.w(LOG_TAG, "EXIF 方向纠正失败，按原图使用", error)
            bitmap
        }
    }
}
