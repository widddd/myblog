/**
 * 登录 / 创建站点的失败限速策略：同一 IP 15 分钟内最多 5 次。
 *
 * 记账在 `proxy.ts`（请求还没进路由就先拦），登录成功后在 `api/auth/login` 里清账。
 * 成功的登录不该占用暴力破解预算——否则站长自己反复登录、退出、换设备试几次，
 * 就会被 429 挡在门外：点「登录」没反应，只能刷新才进得去后台。
 */
export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1_000;

export type LoginLimitScope = "login" | "setup";

/** 限速桶 key；proxy 记账与登录成功后的清账必须落到同一个 key 上 */
export function loginLimitKey(scope: LoginLimitScope, ip: string): string {
  return `${scope}:${ip}`;
}
