import { z } from "zod";

/**
 * 静态页面写入校验。
 *
 * 这里只做「形状」校验（必填、长度、类型）；**地址合法性与保留段判定**放在
 * `lib/pages/admin.ts` 里做，因为那时才能拿到当前目录（Setting）并按目录给出
 * 面向用户的错误文案。两处都不做「地址是否已被占用」的检查——那个必须查库。
 */
export const staticPageWriteSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  html: z.string().optional(),
  css: z.string().optional(),
  js: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const staticPagePatchSchema = staticPageWriteSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个要修改的字段",
  });

/** 目录名形状校验；保留段判定同样在 admin.ts 里做（两处共用 normalizeDirectory）。 */
export const staticPagesDirPutSchema = z.object({
  staticPagesDir: z.string(),
});
