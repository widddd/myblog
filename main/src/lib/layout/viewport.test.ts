import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bannerPresetToHPct,
  hPctToBannerPreset,
  isPhoneViewport,
} from "./viewport";

test("390 宽是手机", () => {
  assert.equal(isPhoneViewport(390, 844, true), true);
});

test("1440 宽带悬停是电脑", () => {
  assert.equal(isPhoneViewport(1440, 900, true), false);
});

test("横屏手机：宽过断点但无悬停且很矮", () => {
  assert.equal(isPhoneViewport(932, 430, false), true);
});

test("iPad 横屏高度约 744，不走手机套", () => {
  assert.equal(isPhoneViewport(1133, 744, false), false);
});

test("Banner 预设与 hPct 互转", () => {
  assert.equal(bannerPresetToHPct("full"), 100);
  assert.equal(bannerPresetToHPct("large"), 70);
  assert.equal(bannerPresetToHPct("medium"), 47);
  assert.equal(hPctToBannerPreset(100), "full");
  assert.equal(hPctToBannerPreset(70), "large");
  assert.equal(hPctToBannerPreset(47), "medium");
});
