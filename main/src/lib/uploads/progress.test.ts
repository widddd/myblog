import assert from "node:assert/strict";
import test from "node:test";

import {
  beginFinalizeProgress,
  endFinalizeProgress,
  FINALIZE_COS_END,
  FINALIZE_DERIVATIVES_END,
  finalizeCosPercent,
  forwardPercent,
  readFinalizeProgress,
  reportFinalizeProgress,
} from "./progress";

test("上云百分比：从「缩略图做完」那个点起步，传满落到封顶值（不是 100）", () => {
  assert.equal(finalizeCosPercent(0, 1000), FINALIZE_DERIVATIVES_END);
  assert.equal(finalizeCosPercent(1000, 1000), FINALIZE_COS_END);
  assert.ok(FINALIZE_COS_END < 100, "最后 1% 要留给「请求真的回来了」");
});

test("上云百分比：total 缺失（COS 没报长度）不炸、不倒退", () => {
  assert.equal(finalizeCosPercent(123, 0), FINALIZE_DERIVATIVES_END);
  assert.equal(
    finalizeCosPercent(Number.NaN, Number.NaN),
    FINALIZE_DERIVATIVES_END,
  );
});

test("上云百分比：越界夹住，且随字节数单调不回头", () => {
  assert.equal(finalizeCosPercent(5000, 1000), FINALIZE_COS_END);
  assert.equal(finalizeCosPercent(-10, 1000), FINALIZE_DERIVATIVES_END);
  const samples = [0, 1, 100, 400, 999, 1000].map((loaded) =>
    finalizeCosPercent(loaded, 1000),
  );
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(
      samples[index] >= samples[index - 1],
      `第 ${index} 个采样倒退了：${samples.join(",")}`,
    );
  }
});

test("forwardPercent：只许前进，且夹在 0–100", () => {
  assert.equal(forwardPercent(60, 40), 60);
  assert.equal(forwardPercent(0, 40.6), 41);
  assert.equal(forwardPercent(99, 1000), 100);
  assert.equal(forwardPercent(50, Number.NaN), 50);
});

test("登记表：begin → report → read → end，乱序报告不让进度倒退", () => {
  const hash = "a".repeat(64);
  endFinalizeProgress(hash);
  assert.equal(readFinalizeProgress(hash), null);

  beginFinalizeProgress(hash, "derivatives");
  assert.equal(readFinalizeProgress(hash)?.percent, 0);

  reportFinalizeProgress(hash, {
    stage: "replicate",
    percent: 70,
    loadedBytes: 5,
    totalBytes: 10,
  });
  const snapshot = readFinalizeProgress(hash);
  assert.equal(snapshot?.stage, "replicate");
  assert.equal(snapshot?.percent, 70);
  assert.equal(snapshot?.loadedBytes, 5);
  assert.equal(snapshot?.totalBytes, 10);

  // socket drain 回调与轮询可能乱序到：小的那个不许把进度拉回去
  reportFinalizeProgress(hash, { percent: 40 });
  assert.equal(readFinalizeProgress(hash)?.percent, 70);

  endFinalizeProgress(hash);
  assert.equal(readFinalizeProgress(hash), null);
});

test("登记表：没有 begin 过的 hash 不凭空造记录（避免内存被外部字符串撑大）", () => {
  const hash = "b".repeat(64);
  endFinalizeProgress(hash);
  reportFinalizeProgress(hash, { percent: 50 });
  assert.equal(readFinalizeProgress(hash), null);
});
