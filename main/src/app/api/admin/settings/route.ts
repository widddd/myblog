import { requireAdmin } from "@/lib/auth/guard";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import {
  DEFAULT_SETTINGS,
  getSetting,
  setSetting,
  type SettingKey,
} from "@/lib/settings";
import {
  isWritableSettingKey,
  settingsPutSchema,
} from "@/lib/validation/settings";

export const runtime = "nodejs";

async function readAllSettings() {
  const keys = Object.keys(DEFAULT_SETTINGS) as SettingKey[];
  const entries = await Promise.all(
    keys.map(async (key) => [key, await getSetting(key)] as const),
  );
  return Object.fromEntries(entries);
}

export async function GET() {
  try {
    await requireAdmin();
    return jsonData(await readAllSettings());
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
      await setSetting(key, value);
    }

    revalidatePublicContent();
    return jsonData(await readAllSettings());
  } catch (error) {
    return handleAdminError(error, "保存设置失败");
  }
}
