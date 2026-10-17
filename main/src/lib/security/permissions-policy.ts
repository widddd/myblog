/**
 * Permissions-Policy 的**纯逻辑唯一入口**。
 *
 * 麦克风是整站默认关闭的，只对**已登录的管理后台整个 `/admin` 路径树**放开
 * `microphone=(self)`。不能只列“当前有录音按钮的两个页面”：
 *
 * 1. `Permissions-Policy` 属于**顶层文档**，Next 的后台内软导航不会重新请求文档；
 *    从 `/admin/posts` 点到 `/admin/moments` 后，文档仍沿用进入后台时那份策略。
 * 2. 前台也可能通过链接进入后台。前台文档必须保持 `microphone=()`，所以后台入口
 *    使用文档级跳转（见 Footer / Navbar），进入后台后整棵路径树都放行，后续软导航
 *    才不会把麦克风权限弄丢。
 *
 * 前台、API 与其它路径继续关闭；camera / geolocation 永远关闭。
 */

const ADMIN_PREFIX = "/admin";

/** 去掉查询串与末尾斜杠，保证 `/admin/moments/` 与 `/admin/moments` 同口径。 */
export function normalizePermissionPathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  const collapsed = pathOnly.replace(/\/{2,}/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
}

/** 这一页是否允许同源页面自己使用麦克风。 */
export function allowsMicrophone(pathname: string): boolean {
  const normalized = normalizePermissionPathname(pathname);
  return (
    normalized === ADMIN_PREFIX || normalized.startsWith(`${ADMIN_PREFIX}/`)
  );
}

/** 整条 `Permissions-Policy` 响应头（camera / geolocation 永远关闭）。 */
export function permissionsPolicyFor(pathname: string): string {
  return `camera=(), ${
    allowsMicrophone(pathname) ? "microphone=(self)" : "microphone=()"
  }, geolocation=()`;
}
