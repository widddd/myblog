import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { deleteAlbum, getAdminAlbum, updateAlbum } from "@/lib/albums/admin";
import { albumPatchSchema } from "@/lib/validation/album";

export const runtime = "nodejs";

function parseId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("NOT_FOUND", "相册不存在", 404);
  }
  return id;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const album = await getAdminAlbum(parseId(id));
    if (!album) {
      throw new AdminHttpError("NOT_FOUND", "相册不存在", 404);
    }
    return jsonData(album);
  } catch (error) {
    return handleAdminError(error, "读取相册失败");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = albumPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "相册字段校验失败",
        400,
      );
    }
    return jsonData(await updateAlbum(parseId(id), parsed.data));
  } catch (error) {
    return handleAdminError(error, "保存相册失败");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    return jsonData(await deleteAlbum(parseId(id)));
  } catch (error) {
    return handleAdminError(error, "删除相册失败");
  }
}
