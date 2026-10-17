import { z } from "zod";

import {
  ALBUM_ASSIGN_MAX,
  ALBUM_DESCRIPTION_MAX,
  ALBUM_SLUG_MAX,
  ALBUM_SORT_MAX,
  ALBUM_TITLE_MAX,
  isValidAlbumSlug,
} from "@/lib/albums/slug";

/** 地址名留空 = 由标题生成并自动去重（服务端做，见 lib/albums/admin.ts）。 */
const slugField = z
  .string()
  .trim()
  .max(ALBUM_SLUG_MAX, `地址名不能超过 ${ALBUM_SLUG_MAX} 个字符`)
  .refine(
    (value) => !value || isValidAlbumSlug(value),
    "地址名只能用字母、数字、汉字、- 和 _，且不能以符号开头或结尾",
  );

export const albumWriteSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "相册名不能为空")
    .max(ALBUM_TITLE_MAX, `相册名不能超过 ${ALBUM_TITLE_MAX} 个字符`),
  slug: slugField.optional(),
  description: z
    .string()
    .trim()
    .max(ALBUM_DESCRIPTION_MAX, `相册说明不能超过 ${ALBUM_DESCRIPTION_MAX} 个字符`)
    .optional(),
  enabled: z.boolean().optional(),
  sort: z.number().int().min(0).max(ALBUM_SORT_MAX).optional(),
});

export const albumPatchSchema = albumWriteSchema
  .partial()
  .extend({
    /** 封面：本相册里的某张图；`null` = 回到「用第一张」 */
    coverId: z.number().int().positive().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个要修改的字段",
  });

export const albumAssignSchema = z.object({
  uploadIds: z
    .array(z.number().int().positive())
    .min(1, "至少选一张图片")
    .max(ALBUM_ASSIGN_MAX, `一次最多处理 ${ALBUM_ASSIGN_MAX} 张`),
});

/**
 * 媒体库单张改归属（`PATCH /api/admin/uploads/[id]`）：相册与卷都能单独改，至少给一个。
 * - `albumId: null` = 从相册里移出（回到「未分类」）；不给 = 不动相册
 * - `volumeId: null` = 放回该相册的「未分类」；不给 = 不动卷。**换相册时服务端会把卷清零**（不变量）
 */
export const uploadAlbumPatchSchema = z
  .object({
    albumId: z.number().int().positive().nullable().optional(),
    volumeId: z.number().int().positive().nullable().optional(),
  })
  .refine((value) => value.albumId !== undefined || value.volumeId !== undefined, {
    message: "至少提供一个要修改的字段",
  });

/* ------------------------------------------------------------------ 卷（AlbumVolume） */

/**
 * 卷标题：与相册名同一个长度上限（同一份常量，不另立一套）。
 * **允许空串**（只 trim + 限长）——空卷名是有语义的，不是漏填：
 * - 新建（`albumVolumeCreateSchema`）：留空由服务端给「第 N 卷」（友好默认，见 `createAlbumVolume`）；
 * - 改名（`albumVolumePatchSchema`）：空串 = 「这一卷不作为独立分组」，读层把它的照片并入「未分类」。
 */
const volumeTitleField = z
  .string()
  .trim()
  .max(ALBUM_TITLE_MAX, `卷标题不能超过 ${ALBUM_TITLE_MAX} 个字符`);

export const albumVolumeCreateSchema = z.object({
  title: volumeTitleField.optional(),
});

export const albumVolumePatchSchema = z
  .object({
    /** 空串合法：清空卷名 = 该卷并入相册的「未分类」（见 docs/albums-spec.md §3.5） */
    title: volumeTitleField.optional(),
    sort: z.number().int().min(0).max(ALBUM_SORT_MAX).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个要修改的字段",
  });

/** 重排：按 `ids` 的顺序写 sort。载荷上限与批量归册同一个（都是「一次带一批 id」的护栏）。 */
export const albumVolumeReorderSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "至少给一个卷")
    .max(ALBUM_ASSIGN_MAX, `一次最多处理 ${ALBUM_ASSIGN_MAX} 个卷`),
});

export const albumVolumeAssignSchema = z.object({
  uploadIds: z
    .array(z.number().int().positive())
    .min(1, "至少选一张照片")
    .max(ALBUM_ASSIGN_MAX, `一次最多处理 ${ALBUM_ASSIGN_MAX} 张`),
  /** 放入哪一卷。移出卷走同路由的 DELETE（与 `uploads` 那条「POST 加 / DELETE 移出」同一分工）。 */
  volumeId: z.number().int().positive(),
});
