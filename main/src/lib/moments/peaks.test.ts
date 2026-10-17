import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MOMENT_PEAK_BUCKETS,
  MOMENT_SILENCE_AMPLITUDE,
  normalizePeaks,
  peakFromAmplitude,
  peaksFor,
  pseudoPeaks,
  pushLiveBar,
  resamplePeaks,
} from "./peaks";

test("peakFromAmplitude：0–1 振幅 → 0–100 波形高度（开方曲线 + 静音地板）", () => {
  assert.equal(peakFromAmplitude(0), 0);
  assert.equal(peakFromAmplitude(MOMENT_SILENCE_AMPLITUDE), 0);
  assert.equal(peakFromAmplitude(-1), 0);
  assert.equal(peakFromAmplitude(Number.NaN), 0);
  assert.equal(peakFromAmplitude(0.25), 50);
  assert.equal(peakFromAmplitude(1), 100);
  assert.equal(peakFromAmplitude(2), 100, "超过 1 也要夹住");
  assert.equal(peakFromAmplitude(0.009), 9);
});

test("pushLiveBar：末尾追加、超长从头丢（整条波形向左走）", () => {
  assert.deepEqual(pushLiveBar([], 50, 3), [50]);
  assert.deepEqual(pushLiveBar([1, 2], 50, 3), [1, 2, 50]);
  assert.deepEqual(pushLiveBar([1, 2, 3], 50, 3), [2, 3, 50]);
  assert.deepEqual(pushLiveBar([1], 500, 3), [1, 100], "越界值要夹到 0–100");
  // 不改入参（React state 靠新数组触发渲染）
  const source = [1, 2];
  pushLiveBar(source, 9, 3);
  assert.deepEqual(source, [1, 2]);
});

test("resamplePeaks：每个桶取组内最大值（平均会把语音尖峰抹平）", () => {
  assert.deepEqual(resamplePeaks([10, 90, 20, 30], 2), [90, 30]);
  assert.deepEqual(resamplePeaks([10, 20], 4), [10, 20], "本来就不长，原样返回");
  assert.deepEqual(resamplePeaks([], 4), []);
  assert.deepEqual(resamplePeaks([5, 200, -3], 3), [5, 100, 0], "顺带夹取与取整");
});

test("normalizePeaks：库里读出来的东西可能是任何形状，非法就返回 null", () => {
  assert.equal(normalizePeaks(null), null);
  assert.equal(normalizePeaks([]), null);
  assert.equal(normalizePeaks("not-an-array"), null);
  assert.equal(normalizePeaks([Number.NaN, Number.POSITIVE_INFINITY]), null);
  assert.deepEqual(normalizePeaks([1, "x", 2]), [1, 2], "混进来的非数字丢掉");
  assert.equal(normalizePeaks(Array.from({ length: 100 }, () => 50))?.length, MOMENT_PEAK_BUCKETS);
  assert.deepEqual(normalizePeaks([42]), [42]);
});

test("pseudoPeaks：同一 key 永远同一串（水合一致），形状有收口", () => {
  const first = pseudoPeaks("audio/media/ab/hash.webm");
  const second = pseudoPeaks("audio/media/ab/hash.webm");
  assert.deepEqual(first, second, "确定性：同一 seed 必须完全相同");
  assert.equal(first.length, MOMENT_PEAK_BUCKETS);
  assert.notDeepEqual(first, pseudoPeaks("audio/media/ab/other.webm"));
  assert.ok(first.every((value) => Number.isInteger(value)));
  assert.ok(first.every((value) => value >= 13 && value <= 100));
  // 两端收口：第 0 根与最后一根都落在低档（shape = 450/1000）
  assert.ok((first[0] ?? 0) <= 45 && (first[first.length - 1] ?? 0) <= 45);
  assert.equal(pseudoPeaks("x", 8).length, 8);
});

test("peaksFor：有真峰值用真的，没有才用确定性图案", () => {
  assert.deepEqual(peaksFor({ key: "k", peaks: [1, 2, 3] }), [1, 2, 3]);
  assert.deepEqual(peaksFor({ key: "k" }), pseudoPeaks("k"));
  assert.deepEqual(peaksFor({ key: "k", peaks: [] }), pseudoPeaks("k"));
});
