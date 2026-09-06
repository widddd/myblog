import assert from "node:assert/strict";
import { test } from "node:test";

import { formatUptime, parseSiteStartedAt } from "./uptime";

test("空字符串不算开始时间", () => {
  assert.equal(parseSiteStartedAt(""), null);
  assert.equal(parseSiteStartedAt("   "), null);
});

test("本地日期时间可解析", () => {
  const date = parseSiteStartedAt("2026-01-02T03:04:05");
  assert.ok(date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 0);
  assert.equal(date.getDate(), 2);
  assert.equal(date.getHours(), 3);
  assert.equal(date.getMinutes(), 4);
  assert.equal(date.getSeconds(), 5);
});

test("运行时间精确到秒并省略前置零单位", () => {
  assert.equal(formatUptime(5_000), "5 秒");
  assert.equal(formatUptime(90_000), "1 分 30 秒");
  assert.equal(formatUptime(3_661_000), "1 小时 1 分 1 秒");
  assert.equal(formatUptime(90_061_000), "1 天 1 小时 1 分 1 秒");
});
