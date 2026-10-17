import assert from "node:assert/strict";
import test from "node:test";

import { MEDIA_STEPS, shouldSkipCosStep } from "./steps";

test("没配 COS：只跳过「上云」，本地派生照做", () => {
  assert.equal(shouldSkipCosStep("derivatives", false), false);
  assert.equal(shouldSkipCosStep("replicate", false), true);
});

test("配了 COS：两步都要做", () => {
  assert.equal(shouldSkipCosStep("derivatives", true), false);
  assert.equal(shouldSkipCosStep("replicate", true), false);
});

test("步骤名清单与 finalize 的口径一致（迁移到 COS 之外不该再冒出第三步）", () => {
  assert.deepEqual([...MEDIA_STEPS], ["derivatives", "replicate"]);
});
