import { requireAdmin } from "@/lib/auth/guard";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { getAdminSettings, setSetting } from "@/lib/settings";
import { clearCosSettingsCache, loadCosSettings } from "@/lib/storage";
import {
  isWritableSettingKey,
  settingsPutSchema,
} from "@/lib/validation/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return jsonData(await getAdminSettings());
  } catch (error) {
    return handleAdminError(error, "读取设置失败");
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const parsed = settingsPutSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "设置字段校验失败",
        400,
      );
    }

    for (const [key, value] of Object.entries(parsed.data)) {
      if (!isWritableSettingKey(key) || value === undefined) {
        continue;
      }
      if (
        (key === "cosSecretId" || key === "cosSecretKey") &&
        String(value).trim() === ""
      ) {
        continue;
      }
      await setSetting(key, value);
    }

    clearCosSettingsCache();
    await loadCosSettings();
    revalidatePublicContent();
    return jsonData(await getAdminSettings());
  } catch (error) {
    return handleAdminError(error, "保存设置失败");
  }
}
