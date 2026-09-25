import assert from "node:assert/strict";
import { test } from "node:test";

import { AUTHOR_NAME_MAX, normalizeAuthorName, resolveAuthorName } from "./author";

test("文章自己填了作者就用它", () => {
  assert.equal(resolveAuthorName("小明", "默认笔名"), "小明");
  assert.equal(resolveAuthorName("  小明  ", "默认笔名"), "小明");
});

test("文章没填作者时回落到默认笔名", () => {
  assert.equal(resolveAuthorName(null, "默认笔名"), "默认笔名");
  assert.equal(resolveAuthorName("", "默认笔名"), "默认笔名");
  assert.equal(resolveAuthorName("   ", " 默认笔名 "), "默认笔名");
  assert.equal(resolveAuthorName(undefined, "默认笔名"), "默认笔名");
});

test("两边都没有就返回空串（前台不渲染作者）", () => {
  assert.equal(resolveAuthorName(null, null), "");
  assert.equal(resolveAuthorName("", ""), "");
  assert.equal(resolveAuthorName(undefined, undefined), "");
  assert.equal(resolveAuthorName("  ", "  "), "");
});

test("超长作者名裁到上限", () => {
  const long = "阿".repeat(AUTHOR_NAME_MAX + 10);
  assert.equal(resolveAuthorName(long, null).length, AUTHOR_NAME_MAX);
  assert.equal(resolveAuthorName(null, long).length, AUTHOR_NAME_MAX);
});

test("写入归一：空白当没填（用默认笔名）", () => {
  assert.equal(normalizeAuthorName(""), null);
  assert.equal(normalizeAuthorName("   "), null);
  assert.equal(normalizeAuthorName(null), null);
  assert.equal(normalizeAuthorName(undefined), null);
  assert.equal(normalizeAuthorName(" 小明 "), "小明");
  assert.equal(normalizeAuthorName("阿".repeat(60))?.length, AUTHOR_NAME_MAX);
});
