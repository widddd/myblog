import { requireAdmin } from "@/lib/auth/guard";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
  jsonError,
} from "@/lib/admin/http";
import { finalizeUpload } from "@/lib/uploads/finalize";
import { UploadError } from "@/lib/upload/handle";
import { finalizeUploadSchema } from "@/lib/validation/upload";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const parsed = finalizeUploadSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "参数不合法",
        400,
      );
    }
    const result = await finalizeUpload(parsed.data.hash, parsed.data.step);
    if (!result) {
      return jsonData({ skipped: true as const, hash: parsed.data.hash });
    }
    return jsonData(result);
  } catch (error) {
    if (error instanceof UploadError) {
      return jsonError(error.code, error.message, error.status);
    }
    return handleAdminError(error, "处理媒体失败");
  }
}
