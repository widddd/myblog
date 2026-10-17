import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { MODULE_CODE_MAX, parseModuleImport } from "@/lib/home/import-html";

export const runtime = "nodejs";

/**
 * 导入一段现成的 HTML / CSS / JS 到模块三栏。
 *
 * 这里**只解析、不落库**：解析结果回给编辑器，由用户确认后再走正常的模块保存接口。
 * 好处是「导入」和「保存模块」各自只有一条写入路径，不会出现半导入状态。
 *
 * 走 JSON 而不是 multipart：文件在浏览器里已经被 `File.text()` 读成文本，
 * 再包一次 multipart 只是多一层解析，还要处理上传上限与临时文件。
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }

    const raw = (body ?? {}) as Record<string, unknown>;
    const fileName = typeof raw.fileName === "string" ? raw.fileName.trim().slice(0, 200) : "";
    const content = typeof raw.content === "string" ? raw.content : null;

    if (!fileName) {
      throw new AdminHttpError("VALIDATION_ERROR", "缺少文件名", 400);
    }
    if (content === null) {
      throw new AdminHttpError("VALIDATION_ERROR", "缺少文件内容", 400);
    }

    const parsed = parseModuleImport(fileName, content, MODULE_CODE_MAX);
    if (!parsed) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        "只支持 .html / .htm / .css / .js / .mjs / .txt 这几种文件",
        400,
      );
    }

    return jsonData(parsed);
  } catch (error) {
    return handleAdminError(error, "导入文件失败");
  }
}
