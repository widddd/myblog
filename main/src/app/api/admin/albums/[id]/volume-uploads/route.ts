import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { setUploadsVolume } from "@/lib/albums/admin";
import { albumAssignSchema, albumVolumeAssignSchema } from "@/lib/validation/album";

export const runtime = "nodejs";

function parseId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("NOT_FOUND", "相册不存在", 404);
  }
  return id;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
  }
}

/** 批量归卷 `{uploadIds,volumeId}`：只影响**本来就在这个相册里**的照片，
 *  跨相册的（或非图片、已不存在的）记进 `skipped` 不报错 —— 卷必须属于照片所在的相册。 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = albumVolumeAssignSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "照片列表校验失败",
        400,
      );
    }
    return jsonData(
      await setUploadsVolume(parseId(id), parsed.data.uploadIds, parsed.data.volumeId),
    );
  } catch (error) {
    return handleAdminError(error, "放入卷失败");
  }
}

/** 批量移出卷（回到相册的「未分类」），照片仍留在相册里。 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = albumAssignSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "照片列表校验失败",
        400,
      );
    }
    return jsonData(await setUploadsVolume(parseId(id), parsed.data.uploadIds, null));
  } catch (error) {
    return handleAdminError(error, "移出卷失败");
  }
}
