import assert from "node:assert/strict";
import test from "node:test";

import {
  isPopupDismissed,
  popupEdgeFromColumn,
  popupStorageKey,
  resolvePopupView,
} from "./popup";

test("出场方向：左 / 右上 / 右下 / 居中", () => {
  const fallback = { defaultPlacement: "left" as const };
  assert.equal(resolvePopupView({ placement: "left" }, fallback).enter, "left");
  assert.equal(resolvePopupView({ placement: "top-right" }, fallback).enter, "right");
  assert.equal(resolvePopupView({ placement: "bottom-right" }, fallback).enter, "right");
  assert.equal(resolvePopupView({ placement: "center" }, fallback).enter, "center");
});

test("缺省 / 脏值回落到模块自己的默认边", () => {
  assert.equal(resolvePopupView({}, { defaultPlacement: "top-right" }).edge, "top-right");
  assert.equal(
    resolvePopupView({ placement: "diagonal" as never }, { defaultPlacement: "center" }).edge,
    "center",
  );
});

test("延迟：秒 → 毫秒，0 / 负数 / 脏值都当立刻，封顶 60 秒", () => {
  const fallback = { defaultPlacement: "center" as const };
  assert.equal(resolvePopupView({ delaySeconds: 3 }, fallback).delayMs, 3000);
  assert.equal(resolvePopupView({ delaySeconds: 0 }, fallback).delayMs, 0);
  assert.equal(resolvePopupView({ delaySeconds: -5 }, fallback).delayMs, 0);
  assert.equal(resolvePopupView({ delaySeconds: "abc" as never }, fallback).delayMs, 0);
  assert.equal(resolvePopupView({ delaySeconds: 999 }, fallback).delayMs, 60_000);
});

test("关闭叉叉默认给；once 只影响是否记住", () => {
  const fallback = { defaultPlacement: "left" as const };
  const base = resolvePopupView({}, fallback);
  assert.equal(base.dismissible, true);
  assert.equal(base.remember, false);

  const noClose = resolvePopupView({ dismissible: false }, fallback);
  assert.equal(noClose.dismissible, false);

  const once = resolvePopupView({ once: true }, fallback);
  assert.equal(once.remember, true);
  assert.equal(once.dismissible, true);
});

test("localStorage 键按模块 slug 隔离", () => {
  assert.equal(popupStorageKey("app-promo"), "myblog:popup:app-promo");
  assert.notEqual(popupStorageKey("popup"), popupStorageKey("app-promo"));
});

test("无 window（SSR）时不判定为已关闭", () => {
  assert.equal(isPopupDismissed("popup"), false);
});

test("格点列 → 贴左 / 居中 / 贴右", () => {
  assert.equal(popupEdgeFromColumn(1, 12), "start");
  assert.equal(popupEdgeFromColumn(4, 12), "start");
  assert.equal(popupEdgeFromColumn(5, 12), "center");
  assert.equal(popupEdgeFromColumn(6, 12), "center");
  assert.equal(popupEdgeFromColumn(9, 12), "end");
  assert.equal(popupEdgeFromColumn(12, 12), "end");
  // 脏值当第一列
  assert.equal(popupEdgeFromColumn(Number.NaN, 12), "start");
});
