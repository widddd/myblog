/**
 * CSRF cookie 名（**唯一事实源**）。
 *
 * 为什么要单独一个文件：服务端签发（`lib/auth/csrf.ts`）与浏览器读取（`lib/client/csrf.ts`）
 * 必须用同一个名字，而 `lib/auth/csrf.ts` 里引了 `node:crypto` / `iron-session`，
 * 客户端组件不能 import 它。名字写两处迟早会漂（改一处、另一处静默失效）。
 *
 * 这个 cookie 刻意**不是 HttpOnly**：服务端校验时是把它跟请求头逐字节比对
 * （见 `verifyCsrfRequest`），浏览器直接把它当令牌复用可以省掉一次
 * `GET /api/auth/csrf` 往返 —— 改一个设置从前是「取令牌 + 保存」两个请求。
 */
export const CSRF_COOKIE_NAME = "myblog.csrf";
