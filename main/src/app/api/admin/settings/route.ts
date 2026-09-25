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
      // 可写 key 白名单集中在 validation/settings.ts 的 WRITABLE_SETTING_KEYS
      // （含 adminAccent / dashboardCards），此处只按白名单放行，不再逐个列举；
      // 值已在 settingsPutSchema 里归一化（配色枚举、卡片显隐补全）。
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
