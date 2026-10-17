import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { assignUploads, removeUploads } from "@/lib/albums/admin";
import { albumAssignSchema } from "@/lib/validation/album";

export const runtime = "nodejs";

function parseId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AdminHttpError("NOT_FOUND", "相册不存在", 404);
  }
  return id;
}

async function readUploadIds(request: Request): Promise<number[]> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
  }
  const parsed = albumAssignSchema.safeParse(body);
  if (!parsed.success) {
    throw new AdminHttpError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "图片列表校验失败",
      400,
    );
  }
  return parsed.data.uploadIds;
}

/** 批量加入相册（只吃图片；非图片与不存在的 id 记进 skipped，不报错）。 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const uploadIds = await readUploadIds(request);
    return jsonData(await assignUploads(parseId(id), uploadIds));
  } catch (error) {
    return handleAdminError(error, "加入相册失败");
  }
}

/** 批量移出（回到「未分类」）。 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const uploadIds = await readUploadIds(request);
    return jsonData(await removeUploads(parseId(id), uploadIds));
  } catch (error) {
    return handleAdminError(error, "移出相册失败");
  }
}
