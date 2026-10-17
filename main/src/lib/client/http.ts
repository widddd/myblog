/**
 * 客户端读 JSON 响应的**唯一口径**。
 *
 * 为什么不能直接 `await response.json()`：请求挂在反向代理后面时，网关（nginx）超时 /
 * 上游进程被重启会返回它**自己的 HTML 错误页**，`response.json()` 于是抛出一句
 * `Unexpected token '<', "<html> <h"... is not valid JSON`——用户看不懂，我们排障也拿不到
 * 状态码与 URL（2026-10-03 生产上就是这么报的：备份请求被重启腰斩，页面上只剩这句话）。
 *
 * 这里的契约：解析不出来时抛一个**带状态码、内容类型、URL、响应片段**的错误；502/503/504
 * 额外说明「应用可能正在重启，请求可能已经执行」——这类情况刷新确认结果比盲目重试靠谱。
 */

function previewBody(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "（空响应）";
  }
  return collapsed.length > 80 ? `${collapsed.slice(0, 80)}…` : collapsed;
}

export function describeNonJsonResponse(
  status: number,
  statusText: string,
  url: string,
  contentType: string,
  raw: string,
): string {
  const type = contentType ? ` ${contentType}` : "";
  const head = `请求 ${url} 返回了非 JSON 响应（HTTP ${status}${statusText ? ` ${statusText}` : ""}${type}）：${previewBody(raw)}`;
  if (status === 502 || status === 503 || status === 504) {
    return `${head}。反向代理没能从应用拿到响应——应用可能正在重启或刚重启过。如果刚点过备份 / 更新 / 恢复，请先刷新本页确认结果，再决定要不要重试。`;
  }
  return head;
}

/** 读 JSON；解析不出来就抛带诊断信息的 Error（错误信息是给用户看的）。 */
export async function readJsonResponse<T>(
  response: Response,
  url: string,
): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      describeNonJsonResponse(
        response.status,
        response.statusText,
        url,
        response.headers.get("content-type") ?? "",
        raw,
      ),
    );
  }
}
