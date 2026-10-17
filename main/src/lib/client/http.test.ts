import assert from "node:assert/strict";
import test from "node:test";

import { describeNonJsonResponse } from "./http";

/**
 * 非 JSON 响应的诊断口径。
 *
 * 起因（2026-10-03 生产）：备份请求被重启腰斩后 nginx 回了自己的 HTML 错误页，
 * 页面上的报错只有一句 `Unexpected token '<', "<html> <h"... is not valid JSON`——
 * 没有状态码、没有 URL、看不出是网关还是应用。这条断言就是防止它退回去。
 */

const html = "<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n</html>";

test("502/504 的 HTML 错误页要说清楚「可能正在重启」并给出下一步", () => {
  const message = describeNonJsonResponse(502, "Bad Gateway", "/api/admin/backup/run", "text/html", html);
  assert.match(message, /HTTP 502 Bad Gateway/);
  assert.match(message, /\/api\/admin\/backup\/run/);
  assert.match(message, /text\/html/);
  assert.match(message, /<html>/);
  assert.match(message, /反向代理/);
  assert.match(message, /刷新本页确认结果/);
});

test("其它非 JSON 响应也带状态码、URL 与响应片段", () => {
  const message = describeNonJsonResponse(500, "Internal Server Error", "/api/x", "", "boom");
  assert.match(message, /HTTP 500 Internal Server Error/);
  assert.match(message, /boom/);
  assert.equal(/反向代理/.test(message), false, "非网关错误不该套用重启话术");
});

test("空响应要显式写出来，预览过长要截断", () => {
  assert.match(describeNonJsonResponse(502, "", "/api/x", "", "   \n  "), /（空响应）/);
  const long = describeNonJsonResponse(200, "OK", "/api/x", "", "<html>".repeat(60));
  assert.match(long, /…$/);
  assert.ok(long.length < 400, "诊断信息不能长到刷屏");
});
