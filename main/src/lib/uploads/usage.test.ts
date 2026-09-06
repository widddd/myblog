import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyLocalMediaKey,
  formatBytes,
  usagePercent,
} from "./usage-format";

const hash = `${"ab".repeat(32)}`;

test("classifyLocalMediaKey splits original / thumb / thumb2", () => {
  assert.equal(classifyLocalMediaKey(`images/original/ab/${hash}.jpg`), "original");
  assert.equal(classifyLocalMediaKey(`videos/mp4/ab/${hash}.mp4`), "original");
  assert.equal(classifyLocalMediaKey(`images/thumbs/ab/${hash}.webp`), "thumb");
  assert.equal(classifyLocalMediaKey(`images/${hash}-thumb.webp`), "thumb");
  assert.equal(classifyLocalMediaKey(`images/thumbs2/ab/${hash}.webp`), "thumb2");
});

test("formatBytes and usagePercent", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.0 MB");
  assert.equal(usagePercent(256 * 1024 * 1024, 512), 50);
  assert.equal(usagePercent(1024 * 1024 * 1024, 512), 100);
});
