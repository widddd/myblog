import { NextResponse } from "next/server";

import { isSmartBlogApp } from "@/lib/client/detect";
import { isAuthenticatedSession, getSession } from "@/lib/auth/session";
import { findAdminAccount } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

/**
 * App 客户端状态（**公开**，只回答"这一发是谁"）。
 *
 * 两件事一次问清，App 的通知层按它决定推不推：
 *  1. `app`：请求是不是 SmartBlog App 自己发的（UA 标记，见 `lib/client/detect.ts`）；
 *  2. `admin`：**这一发是否已登录后台**。
 *
 * ## `admin` 的用途：管理员不收自己站点的推送
 * App 里登录后台之后，`myblog.session` cookie 就在同一个 Gecko cookie jar 里
 * （见 docs/android/architecture.md §8），所以 App **总是**以管理员身份访问站点的 ——
 * 自己发文章、自己发瞬间，手机再弹一条"你有新内容"是纯噪声。
 * 所以通知层每次轮询先问这个接口，`admin: true` 就一条都不推（**永久抑制**，不是"当前页面抑制"）。
 *
 * 判定必须在这里做、不能放客户端：客户端只看得到 cookie 的存在与否（httpOnly），
 * 认不出"这个 cookie 现在还对应一个有效的管理员"——会话失效、账号被清空都要服务端说了算。
 * 同理，**只在服务端**判：`isAuthenticatedSession` + `findAdminAccount`
 * （与 `requireAdmin()` 的判据一致，见 `lib/auth/guard.ts`），别自己写一套。
 *
 * 响应**明确 no-store**：它随 cookie 变化，被任何中间层缓存住都会把管理员误判成访客
 * （后果正好相反：给管理员狂推通知）。
 */
export async function GET(request: Request) {
  const session = await getSession();
  const loggedIn = isAuthenticatedSession(session);
  const admin = loggedIn && Boolean(await findAdminAccount(session.adminId));

  return NextResponse.json(
    {
      app: isSmartBlogApp(request.headers.get("user-agent")),
      admin,
      username: admin ? session.username : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
