import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyPan,
  applyPinch,
  clampLightboxScale,
  containScale,
  fitCentered,
  isLightboxFit,
  maxLightboxScale,
  pointerDistance,
  pointerMidpoint,
  wheelFactor,
  zoomAtPoint,
} from "./lightbox-zoom";

test("scale 默认收进 1–8，也可按适配倍率收", () => {
  assert.equal(clampLightboxScale(0.2), 1);
  assert.equal(clampLightboxScale(12), 8);
  assert.equal(clampLightboxScale(2.5), 2.5);
  assert.equal(clampLightboxScale(0.2, 0.1, 8), 0.2);
});

test("containScale 按视口把原图像素装进去", () => {
  assert.equal(containScale(1000, 800, 2000, 1000), 0.5);
  assert.equal(containScale(400, 300, 200, 100), 2);
});

test("最大倍率是适配倍率的 8 倍", () => {
  assert.equal(maxLightboxScale(0.2), 1.6);
});

test("1x 时图片在视口居中", () => {
  assert.deepEqual(fitCentered(1000, 800, 400, 200), {
    scale: 1,
    x: 300,
    y: 300,
  });
});

test("按适配倍率居中时位移用缩放后的宽高", () => {
  assert.deepEqual(fitCentered(1000, 800, 2000, 1000, 0.5), {
    scale: 0.5,
    x: 0,
    y: 150,
  });
});

test("对着某点放大时该点屏幕坐标不变", () => {
  const current = { scale: 1, x: 100, y: 50 };
  const point = { x: 220, y: 110 };
  const next = zoomAtPoint(current, point, 2);
  assert.equal(next.scale, 2);
  assert.equal(point.x, next.x + (point.x - current.x) * 2);
  assert.equal(point.y, next.y + (point.y - current.y) * 2);
});

test("双指捏合：距离翻倍则倍率翻倍，中点跟着走", () => {
  const origin = { scale: 1, x: 10, y: 20 };
  const startMid = { x: 100, y: 80 };
  const nextMid = { x: 130, y: 90 };
  const next = applyPinch(origin, startMid, 40, nextMid, 80);
  assert.equal(next.scale, 2);
  assert.equal(next.x, nextMid.x - 2 * (startMid.x - origin.x));
  assert.equal(next.y, nextMid.y - 2 * (startMid.y - origin.y));
});

test("单指平移只改位移", () => {
  const origin = { scale: 3, x: 8, y: 9 };
  assert.deepEqual(applyPan(origin, { x: 10, y: 10 }, { x: 40, y: 0 }), {
    scale: 3,
    x: 38,
    y: -1,
  });
});

test("滚轮向下缩小、向上放大", () => {
  assert.ok(wheelFactor(120) < 1);
  assert.ok(wheelFactor(-120) > 1);
});

test("缩回适配倍率视为回正", () => {
  assert.equal(isLightboxFit(1), true);
  assert.equal(isLightboxFit(1.01), true);
  assert.equal(isLightboxFit(1.5), false);
  assert.equal(isLightboxFit(0.18, 0.18), true);
  assert.equal(isLightboxFit(0.5, 0.18), false);
});

test("指针距离与中点", () => {
  assert.equal(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.deepEqual(pointerMidpoint({ x: 0, y: 10 }, { x: 10, y: 0 }), {
    x: 5,
    y: 5,
  });
});
