import { requireAdmin } from "@/lib/auth/guard";
import { setUploadVolume } from "@/lib/albums/admin";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import {
  deleteAdminUpload,
  getAdminUploadResult,
  inspectAdminUpload,
  setUploadAlbum,
} from "@/lib/uploads/admin";
import { uploadAlbumPatchSchema } from "@/lib/validation/album";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(raw: string) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("VALIDATION_ERROR", "无效的文件 ID", 400);
  }
  return id;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id: raw } = await context.params;
    return jsonData(await inspectAdminUpload(parseId(raw)));
  } catch (error) {
    return handleAdminError(error, "读取文件信息失败");
  }
}

/**
 * 改归属：`{albumId?: number | null, volumeId?: number | null}`（至少给一个）。
 * - `albumId: null` = 移出相册（回到「未分类」）
 * - `volumeId: null` = 放回该相册的「未分类」；`volumeId` 必须属于这张图当前的相册
 * - **换成另一个相册时卷一并清零**（不变量：卷必须属于照片所在的相册，见 lib/uploads/admin.ts）
 * 只有图片能归册；非图片 400。
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id: raw } = await context.params;
    const id = parseId(raw);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = uploadAlbumPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "相册字段校验失败",
        400,
      );
    }
    const { albumId, volumeId } = parsed.data;
    // 自相矛盾的请求先挡住：移出相册之后这张图没有相册，卷必然非法——不写了半截再报错
    if (albumId === null && volumeId != null) {
      throw new AdminHttpError("VALIDATION_ERROR", "移出相册时不能同时指定卷", 400);
    }
    if (albumId !== undefined) {
      // 换相册时这个方法会顺手把卷清零（不变量）
      await setUploadAlbum(id, albumId);
    }
    if (volumeId !== undefined) {
      // 卷必须属于这张图**当前**的相册；越界由 setUploadVolume() 抛 400
      await setUploadVolume(id, volumeId);
    }
    return jsonData(await getAdminUploadResult(id));
  } catch (error) {
    return handleAdminError(error, "设置相册 / 卷失败");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id: raw } = await context.params;
    const id = parseId(raw);
    let keepCos = new URL(request.url).searchParams.get("keepCos") === "1";
    try {
      const body = (await request.json()) as { keepCos?: unknown };
      if (body?.keepCos === true) {
        keepCos = true;
      }
    } catch {
      // DELETE may have an empty body
    }
    await deleteAdminUpload(id, { keepCos });
    return jsonData({ ok: true, keepCos });
  } catch (error) {
    return handleAdminError(error, "删除文件失败");
  }
}
