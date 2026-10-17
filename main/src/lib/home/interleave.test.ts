import assert from "node:assert/strict";
import test from "node:test";

import { interleaveByDate, normalizeMomentLimit } from "./interleave";

type Item = { id: string; at: string };

const post = (id: string, day: number): Item => ({
  id,
  at: `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`,
});
const moment = (id: string, day: number, hour = 12): Item => ({
  id,
  at: `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`,
});

const ids = (list: Array<{ kind: string; item: Item }>) =>
  list.map((entry) => `${entry.kind === "post" ? "P" : "M"}:${entry.item.id}`);

const options = { postDate: (item: Item) => item.at, momentDate: (item: Item) => item.at };

test("normalizeMomentLimit 兜脏值并封顶 8", () => {
  assert.equal(normalizeMomentLimit(), 0);
  assert.equal(normalizeMomentLimit(-3), 0);
  assert.equal(normalizeMomentLimit(2.6), 3);
  assert.equal(normalizeMomentLimit(99), 8);
});

test("按时间穿插：新的在前，瞬间落在它该在的位置", () => {
  const list = interleaveByDate(
    [post("p3", 3), post("p1", 1)],
    [moment("m2", 2)],
    { ...options, limit: 3 },
  );
  assert.deepEqual(ids(list), ["P:p3", "M:m2", "P:p1"]);
});

test("比本页最后一篇还早的瞬间不展示（属于后面的页）", () => {
  const list = interleaveByDate(
    [post("p5", 5), post("p4", 4)],
    [moment("m9", 9), moment("m3", 3), moment("m1", 1)],
    { ...options, limit: 3 },
  );
  // m9 比 p5 新 → 排最前；m3 / m1 比 p4 老 → 不在本页
  assert.deepEqual(ids(list), ["M:m9", "P:p5", "P:p4"]);
});

test("一页最多 limit 条，且只从最新的几条里挑", () => {
  // p5/p4/p3 都是当天 00:00，m5b 是 5 号中午 —— 时刻更晚，所以排在 p5 前面
  const list = interleaveByDate(
    [post("p5", 5), post("p4", 4), post("p3", 3)],
    [moment("m9", 9), moment("m5b", 5), moment("m4b", 4), moment("m1", 1)],
    { ...options, limit: 2 },
  );
  assert.equal(list.filter((entry) => entry.kind === "moment").length, 2);
  assert.deepEqual(ids(list), ["M:m9", "M:m5b", "P:p5", "P:p4", "P:p3"]);
});

test("limit 为 0 时只有文章，顺序不变", () => {
  const list = interleaveByDate([post("p2", 2), post("p1", 1)], [moment("m9", 9)], {
    ...options,
    limit: 0,
  });
  assert.deepEqual(ids(list), ["P:p2", "P:p1"]);
});

test("同一时刻先文章后瞬间；没有文章时返回空", () => {
  const same = "2026-10-05T00:00:00.000Z";
  const list = interleaveByDate(
    [{ id: "p", at: same }],
    [{ id: "m", at: same }],
    { ...options, limit: 3 },
  );
  assert.deepEqual(ids(list), ["P:p", "M:m"]);
  assert.deepEqual(interleaveByDate([], [moment("m9", 9)], { ...options, limit: 3 }), []);
});

test("缺时间（null / 坏值）按最早处理，不会挤到最前", () => {
  const list = interleaveByDate(
    [post("p5", 5), { id: "pBad", at: "not-a-date" }],
    [{ id: "mBad", at: "not-a-date" }],
    { ...options, limit: 3 },
  );
  assert.deepEqual(ids(list), ["P:p5", "P:pBad", "M:mBad"]);
});
