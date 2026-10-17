import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import {
  deleteAlbumVolume,
  listAlbumVolumes,
  updateAlbumVolume,
} from "@/lib/albums/admin";
import { albumVolumePatchSchema } from "@/lib/validation/album";

export const runtime = "nodejs";

function parseId(raw: string, message: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("NOT_FOUND", message, 404);
  }
  return id;
}

/** 路径上的相册与卷必须是一家人：卷的写函数只认 volumeId，别让 URL 上的相册成了摆设。 */
async function requireVolumeOfAlbum(albumId: number, volumeId: number): Promise<void> {
  const volumes = await listAlbumVolumes(albumId);
  if (!volumes.some((volume) => volume.id === volumeId)) {
    throw new AdminHttpError("NOT_FOUND", "这一卷不属于该相册", 404);
  }
}

/** 改名 / 改排序（`{title?,sort?}`）。 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; volumeId: string }> },
) {
  try {
    await requireAdmin();
    const { id, volumeId } = await params;
    const albumId = parseId(id, "相册不存在");
    const target = parseId(volumeId, "这一卷不存在");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = albumVolumePatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "卷字段校验失败",
        400,
      );
    }
    await requireVolumeOfAlbum(albumId, target);
    return jsonData(await updateAlbumVolume(target, parsed.data));
  } catch (error) {
    return handleAdminError(error, "保存卷失败");
  }
}

/** 删卷：**只解绑不删图**，卷里的照片回到相册的「未分类」；返回受影响张数供确认文案。 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; volumeId: string }> },
) {
  try {
    await requireAdmin();
    const { id, volumeId } = await params;
    const albumId = parseId(id, "相册不存在");
    const target = parseId(volumeId, "这一卷不存在");
    await requireVolumeOfAlbum(albumId, target);
    return jsonData(await deleteAlbumVolume(target));
  } catch (error) {
    return handleAdminError(error, "删除卷失败");
  }
}
