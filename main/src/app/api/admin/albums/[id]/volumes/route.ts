import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import {
  createAlbumVolume,
  listAlbumVolumes,
  reorderAlbumVolumes,
} from "@/lib/albums/admin";
import {
  albumVolumeCreateSchema,
  albumVolumeReorderSchema,
} from "@/lib/validation/album";

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

/** 该相册的卷（按 sort → id，带各自的照片张数）。 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    return jsonData(await listAlbumVolumes(parseId(id)));
  } catch (error) {
    return handleAdminError(error, "读取卷失败");
  }
}

/** 新建一卷（标题留空 = 服务端给「第 N 卷」，排到末尾）。 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = albumVolumeCreateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "卷字段校验失败",
        400,
      );
    }
    return jsonData(await createAlbumVolume(parseId(id), parsed.data));
  } catch (error) {
    return handleAdminError(error, "新建卷失败");
  }
}

/** 重排：`{ids:number[]}` 按给定顺序写 sort（不在列表里的卷保持原样、排在其后）。 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = albumVolumeReorderSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "卷顺序校验失败",
        400,
      );
    }
    return jsonData(await reorderAlbumVolumes(parseId(id), parsed.data.ids));
  } catch (error) {
    return handleAdminError(error, "调整卷顺序失败");
  }
}
