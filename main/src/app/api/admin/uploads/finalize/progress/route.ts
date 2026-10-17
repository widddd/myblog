import { requireAdmin } from "@/lib/auth/guard";
import { handleAdminError, jsonData } from "@/lib/admin/http";
import { IMAGE_HASH_PATTERN } from "@/lib/upload/limits";
import { readFinalizeProgress } from "@/lib/uploads/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 读一次 finalize 的服务端进度（客户端在 `POST /api/admin/uploads/finalize` 还没返回时轮询）。
 *
 * 为什么是轮询而不是流式：生产入口是 nginx，流式响应会被它缓冲到请求结束才吐给浏览器，
 * 反而比轮询更晚看到进度（见 docs/api-contracts.md）。
 *
 * hash 不合法 / 已经没有这条记录 → 都回 `progress: null`，让客户端保持上一次的百分比，
 * 不用 4xx 打断正在进行的发布（这一步是"锦上添花"的显示，不该让主流程失败）。
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const hash = new URL(request.url).searchParams.get("hash") ?? "";
    if (!IMAGE_HASH_PATTERN.test(hash)) {
      return jsonData({ progress: null });
    }
    return jsonData({ progress: readFinalizeProgress(hash) });
  } catch (error) {
    return handleAdminError(error, "读取处理进度失败");
  }
}
