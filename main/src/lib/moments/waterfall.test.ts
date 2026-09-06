import assert from "node:assert/strict";
import test from "node:test";

import {
  fillToHeight,
  isPortrait,
  layoutWaterfall,
  toWaterfallImage,
  type WaterfallImage,
} from "./waterfall";

function img(
  src: string,
  width: number,
  height: number,
): WaterfallImage {
  return toWaterfallImage({ src, width, height });
}

test("missing size counts as landscape", () => {
  assert.equal(isPortrait(), false);
  assert.equal(toWaterfallImage({ src: "x" }).portrait, false);
});

test("all landscapes are one per row", () => {
  const rows = layoutWaterfall([
    img("a", 800, 400),
    img("b", 600, 300),
  ]);
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["landscape", "landscape"],
  );
});

test("all portraits pair into two columns", () => {
  const rows = layoutWaterfall([
    img("a", 300, 500),
    img("b", 320, 480),
    img("c", 200, 400),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.kind, "pair");
  assert.equal(rows[1]?.kind, "portrait");
});

test("mixed: landscape spans full width, portraits pair", () => {
  const rows = layoutWaterfall([
    img("p1", 300, 500),
    img("l1", 800, 400),
    img("p2", 300, 500),
    img("p3", 280, 420),
  ]);
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["portrait", "landscape", "pair"],
  );
});

test("fillToHeight loops when the pool is short", () => {
  const picked = fillToHeight([img("a", 800, 400)], 400, 200, 0);
  assert.ok(picked.length >= 2);
  assert.equal(picked[0]?.src, "a");
});
