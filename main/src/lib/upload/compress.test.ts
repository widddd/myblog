import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

import { compressImageToMaxBytes } from "./compress";

test("compressImageToMaxBytes keeps jpeg and stays under the cap", async () => {
  const input = await sharp({
    create: {
      width: 1600,
      height: 1200,
      channels: 3,
      background: { r: 40, g: 90, b: 180 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  const maxBytes = 40_000;
  const result = await compressImageToMaxBytes(input, "image/jpeg", maxBytes);
  assert.ok(result.buffer.length <= maxBytes);
  assert.ok((result.width ?? 0) > 0);
  const detected = await sharp(result.buffer).metadata();
  assert.equal(detected.format, "jpeg");
});

test("compressImageToMaxBytes returns the original buffer when already small", async () => {
  const input = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 10, g: 10, b: 10 },
    },
  })
    .png()
    .toBuffer();
  const result = await compressImageToMaxBytes(input, "image/png", 5_000_000);
  assert.equal(result.buffer, input);
});
