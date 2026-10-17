import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampModuleHeight,
  dragDeltaToModulePx,
  H_PCT_MAX,
  isAutoHeight,
  isPhoneViewport,
  moduleHeightCss,
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

test("模块高度：0 = 自适应，其余按像素", () => {
  assert.equal(isAutoHeight(0), true);
  assert.equal(isAutoHeight(-1), true);
  assert.equal(isAutoHeight(380), false);
  assert.equal(moduleHeightCss(0), "auto");
  assert.equal(moduleHeightCss(380), "380px");
  assert.equal(moduleHeightCss(379.6), "380px");
});

test("高度夹取到 0–H_PCT_MAX 且取整", () => {
  assert.equal(clampModuleHeight(-20), 0);
  assert.equal(clampModuleHeight(380.4), 380);
  assert.equal(clampModuleHeight(9999), H_PCT_MAX);
  assert.equal(clampModuleHeight(Number.NaN), 0);
});

test("拖动像素换算：画框被放大/缩小都要还原成模块像素", () => {
  // 画框与设计视口等高：屏幕位移就是模块像素
  assert.equal(dragDeltaToModulePx(100, 900, 900), 100);
  // 画框只有设计视口一半高（缩放到 0.5）：屏幕拖 50px = 模块 100px
  assert.equal(dragDeltaToModulePx(50, 450, 900), 100);
  // 画框比设计视口还高（放大）：屏幕拖 100px 只该长 50px
  assert.equal(dragDeltaToModulePx(100, 1800, 900), 50);
  assert.equal(dragDeltaToModulePx(100, 0, 900), 0);
});
