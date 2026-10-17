import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { createAlbum, listAdminAlbums } from "@/lib/albums/admin";
import { albumWriteSchema } from "@/lib/validation/album";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return jsonData(await listAdminAlbums());
  } catch (error) {
    return handleAdminError(error, "读取相册列表失败");
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = albumWriteSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "相册字段校验失败",
        400,
      );
    }
    return jsonData(await createAlbum(parsed.data), 201);
  } catch (error) {
    return handleAdminError(error, "创建相册失败");
  }
}
