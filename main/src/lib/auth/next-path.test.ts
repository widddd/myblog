import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_HOME_PATH, adminNextPath } from "./next-path";

test("adminNextPath keeps admin paths from ?next", () => {
  assert.equal(adminNextPath("/admin/posts"), "/admin/posts");
  assert.equal(adminNextPath("/admin/updates?tab=1"), "/admin/updates?tab=1");
  assert.equal(adminNextPath("  /admin/settings  "), "/admin/settings");
  assert.equal(adminNextPath("/admin"), "/admin");
});

test("adminNextPath falls back for anything outside /admin", () => {
  assert.equal(adminNextPath(undefined), ADMIN_HOME_PATH);
  assert.equal(adminNextPath(""), ADMIN_HOME_PATH);
  assert.equal(adminNextPath("/posts/abc"), ADMIN_HOME_PATH);
  assert.equal(adminNextPath("https://evil.example/admin"), ADMIN_HOME_PATH);
  assert.equal(adminNextPath(["//evil.example", "/admin/posts"]), ADMIN_HOME_PATH);
  assert.equal(adminNextPath(["/admin/posts", "/admin/settings"]), "/admin/posts");
});

test("adminNextPath refuses open-redirect and self-loop shapes", () => {
  // 协议相对 + 反斜杠变体：浏览器会把 /\evil.example 当成跨站
  assert.equal(adminNextPath("//evil.example"), ADMIN_HOME_PATH);
  assert.equal(adminNextPath("/\\evil.example"), ADMIN_HOME_PATH);
  assert.equal(adminNextPath("/admin\\..\\evil"), ADMIN_HOME_PATH);
  // 目录穿越（含编码）
  assert.equal(adminNextPath("/admin/../evil"), ADMIN_HOME_PATH);
  assert.equal(adminNextPath("/admin/%2e%2e/evil"), ADMIN_HOME_PATH);
  // 登录页自环
  assert.equal(adminNextPath("/admin/login"), ADMIN_HOME_PATH);
  assert.equal(adminNextPath("/admin/login?next=/admin"), ADMIN_HOME_PATH);
  // 超长与空白
  assert.equal(adminNextPath(`/admin/${"x".repeat(600)}`), ADMIN_HOME_PATH);
  assert.equal(adminNextPath("/admin/a b"), ADMIN_HOME_PATH);
});
