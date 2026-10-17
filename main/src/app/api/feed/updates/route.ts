import { NextResponse } from "next/server";

import { isAuthenticatedSession, getSession } from "@/lib/auth/session";
import { findAdminAccount } from "@/lib/auth/account";
import { loadAdminFeedWindow, loadFeedWindow } from "@/lib/feed/query";
import { parseFeedCursor, resolveFeedLimit } from "@/lib/feed/updates";

export const dynamic = "force-dynamic";

/**
 * App 通知的增量源：`GET /api/feed/updates?since=<ISO>&limit=<n>`。
 *
 * 为什么要有这条接口（而不是让 App 去读 RSS）见 `lib/feed/updates.ts` 的文件头；
 * 一句话：**RSS 只有文章、没有瞬间**，而且是"每次一份完整列表"，不适合当通知判据。
 *
 * 约定：
 *  - `since` 缺省/空 → 回最新一批（客户端用它建立基线，**不要**拿它弹通知）；
 *  - `since` 解析不出来 → 400，别静默回退（回退会让客户端把旧内容当新的重推一遍）；
 *  - 回包里的 `nextCursor` 是**服务端时间**：客户端用它当下一轮游标，不依赖手机时钟；
 *  - 图片一律不解析（通知只显示一行字），文章按 `createdAt` 增量、只算**新增**行。
 *
 * 管理员（App 里登录过后台）走 `loadAdminFeedWindow`：能看到未发布与密码文。
 * 但通知层在 `admin: true` 时**根本不推**（见 `app/api/client/status/route.ts`），
 * 这条分支是给「应用内的更新提示」留的，不是给推送用的。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cursor = parseFeedCursor(url.searchParams.get("since"));
  if (cursor.mode === "invalid") {
    return NextResponse.json(
      { error: "since 需要是带时区的 ISO 时间戳，例如 2026-10-05T03:04:05Z" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const limit = resolveFeedLimit(url.searchParams.get("limit"));
  const since = cursor.mode === "since" ? cursor.value : null;

  const session = await getSession();
  const admin =
    isAuthenticatedSession(session) && Boolean(await findAdminAccount(session.adminId));

  const payload = admin
    ? await loadAdminFeedWindow({ since, limit })
    : await loadFeedWindow({ since, limit });

  return NextResponse.json(payload, {
    headers: {
      // 管理员视角带未发布内容，绝不能被任何中间层缓存；访客视角是公开内容，可短缓存
      "Cache-Control": admin
        ? "private, no-store"
        : "public, max-age=15, stale-while-revalidate=30",
    },
  });
}
