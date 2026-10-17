import assert from "node:assert/strict";
import test from "node:test";

import { countWords, readingMinutes, readingStats } from "./reading";

test("汉字一个字算一个，标点空格换行不算", () => {
  // 「记录思考，也记录生活。」= 9 个汉字 + 2 个标点
  assert.equal(countWords("记录思考，也记录生活。"), 9);
  assert.equal(countWords("记录思考\n\n也记录生活"), 9);
  assert.equal(countWords("，。！？；：、（）《》——…"), 0);
  assert.equal(countWords(" "), 0);
  assert.equal(countWords(""), 0);
});

test("英文按词算，标点不连词", () => {
  assert.equal(countWords("hello world"), 2);
  assert.equal(countWords("Hello, world!"), 2);
  assert.equal(countWords("don't stop"), 2);
  assert.equal(countWords("my-blog is here"), 3);
  assert.equal(countWords("Next.js 16"), 3);
});

test("中英混排各算各的", () => {
  // 「我在」2 汉字 + Windows 1 词 + 「上跑」2 汉字 + Next 1 词 + 16 1 词
  assert.equal(countWords("我在 Windows 上跑 Next 16"), 7);
  // 「记录思考」4 汉字 + 「生活」2 汉字 + and 1 词
  assert.equal(countWords("记录思考 and 生活"), 7);
});

test("阅读时长向上取整且最少 1 分钟", () => {
  assert.equal(readingMinutes(0), 0);
  assert.equal(readingMinutes(1), 1);
  assert.equal(readingMinutes(400), 1);
  assert.equal(readingMinutes(401), 2);
  assert.equal(readingMinutes(1200), 3);
});

test("readingStats 一次给出字数与时长", () => {
  assert.deepEqual(readingStats("记录思考，也记录生活。"), {
    count: 9,
    minutes: 1,
  });
  assert.deepEqual(readingStats(""), { count: 0, minutes: 0 });
});
