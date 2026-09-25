import { getSession, isAuthenticatedSession } from "@/lib/auth/session";
import { getPublicSettings } from "@/lib/settings";

import { Navbar } from "./Navbar";

/**
 * 前台导航壳（server component）。
 *
 * 「外观」入口只给**已登录管理员**看：这个判断必须在服务端做——放在客户端要么先渲染再隐藏
 * （访客会闪一下后台入口），要么暴露一个「这里有个后台功能」的痕迹。这里读 session 后
 * 由 `Navbar` 决定渲不渲染，访客拿到的 HTML 里根本没有这个按钮。
 */
export async function SiteHeader() {
  const [{ siteName }, session] = await Promise.all([
    getPublicSettings(),
    getSession(),
  ]);

  return (
    <Navbar isAdmin={isAuthenticatedSession(session)} siteName={siteName} />
  );
}
