import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatPostDate,
  formatPostDateDetail,
  formatRelativeDate,
  formatDateTimeSeconds,
} from "./date";

const DAY_MS = 86_400_000;

function ago(days: number, extraHours = 1): Date {
  return new Date(Date.now() - days * DAY_MS - extraHours * 3_600_000);
}

test("文章页：三天以内仍说相对时间", () => {
  assert.equal(formatPostDateDetail(new Date()), "最近");
  assert.equal(formatPostDateDetail(new Date(Date.now() - 2 * 3_600_000)), "最近");
  assert.equal(formatPostDateDetail(ago(1)), "1 天前");
  assert.equal(formatPostDateDetail(ago(3)), "3 天前");
});

test("文章页：超过三天给精确到秒的日期", () => {
  const value = formatPostDateDetail(ago(4));
  assert.match(value, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.match(formatPostDateDetail(ago(400)), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.doesNotMatch(value, /天前|最近/);
});

test("卡片：只给相对时间，天/月/年三档", () => {
  assert.equal(formatRelativeDate(new Date(Date.now() - 60_000)), "最近");
  assert.equal(formatRelativeDate(ago(5)), "5 天前");
  assert.equal(formatRelativeDate(ago(29)), "29 天前");
  assert.equal(formatRelativeDate(ago(45)), "1 个月前");
  assert.equal(formatRelativeDate(ago(200)), "6 个月前");
  assert.equal(formatRelativeDate(ago(400)), "1 年前");
});

test("卡片时间不出现精确日期", () => {
  assert.doesNotMatch(formatRelativeDate(ago(500)), /\d{4}-\d{2}-\d{2}/);
});

test("旧版 formatPostDate 行为不变（侧栏/搜索/归档仍在用）", () => {
  assert.equal(formatPostDate(new Date(Date.now() - 3_600_000)), "最近");
  assert.equal(formatPostDate(ago(7)), "7 天前");
  assert.match(formatPostDate(ago(45)), /^\d{4}-\d{2}-\d{2}$/);
});

test("已修改时间永远精确到秒，不退回相对时间", () => {
  assert.match(formatDateTimeSeconds(new Date()), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(
    formatDateTimeSeconds(new Date(2026, 0, 2, 3, 4, 5)),
    "2026-01-02 03:04:05",
  );
});

test("空值与非法值回空串", () => {
  for (const fn of [formatPostDate, formatPostDateDetail, formatRelativeDate, formatDateTimeSeconds]) {
    assert.equal(fn(null), "");
    assert.equal(fn(undefined), "");
    assert.equal(fn(""), "");
    assert.equal(fn("not-a-date"), "");
  }
});
