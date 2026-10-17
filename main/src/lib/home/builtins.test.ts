import assert from "node:assert/strict";
import test from "node:test";

import { parseLineField, sanitizeLineField } from "./builtins";

test("parseLineField keeps the empty line the user just created", () => {
  // 关键用例：末尾的空行必须留下来。丢掉它 = 受控 textarea 的 value 被写回旧值，
  // 光标回到末尾、下一个字粘上前面那段 —— 用户看到的就是「按回车没反应」。
  assert.deepEqual(parseLineField("lines", "AAA\n", 3), ["AAA", ""]);
  assert.deepEqual(parseLineField("lines", "AAA\nBBB", 3), ["AAA", "BBB"]);
  assert.deepEqual(parseLineField("lines", "\n", 3), ["", ""]);
  assert.deepEqual(parseLineField("lines", "", 3), [""]);
});

test("parseLineField trims each line and caps the count", () => {
  assert.deepEqual(parseLineField("lines", "  记录思考  \n\t也记录生活", 3), [
    "记录思考",
    "也记录生活",
  ]);
  assert.deepEqual(parseLineField("lines", "a\nb\nc\nd", 3), ["a", "b", "c"]);
});

test("parseLineField caps chips at 8 chars and titles at 60", () => {
  assert.deepEqual(parseLineField("chips", "12345678901", 12), ["12345678"]);
  const long = "x".repeat(80);
  assert.equal(parseLineField("lines", long, 3)[0]?.length, 60);
});

test("sanitizeLineField drops the editing blanks before persisting", () => {
  assert.deepEqual(sanitizeLineField(["AAA", "", "BBB"]), ["AAA", "BBB"]);
  assert.deepEqual(sanitizeLineField(["  ", ""]), []);
  assert.deepEqual(sanitizeLineField(["  NX  ", "TS"]), ["NX", "TS"]);
});

test("parse + sanitize round-trips a normal two-line title", () => {
  const parsed = parseLineField("lines", "记录思考\n也记录生活", 3);
  assert.deepEqual(sanitizeLineField(parsed), ["记录思考", "也记录生活"]);
});
