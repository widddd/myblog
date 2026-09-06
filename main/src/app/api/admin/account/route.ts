import { requireAdmin } from "@/lib/auth/guard";
import { getAdminAccount, updateAdminAccount } from "@/lib/auth/account";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { accountPutSchema } from "@/lib/validation/account";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireAdmin({ allowMustChange: true });
    return jsonData(await getAdminAccount(session.adminId));
  } catch (error) {
    return handleAdminError(error, "读取管理员账号失败");
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAdmin({ allowMustChange: true });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }

    const parsed = accountPutSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message || "请填写当前密码，并修改用户名或密码",
        400,
      );
    }

    const account = await updateAdminAccount(session.adminId, parsed.data);
    return jsonData(account);
  } catch (error) {
    return handleAdminError(error, "修改管理员账号失败");
  }
}
