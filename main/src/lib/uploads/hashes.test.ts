import assert from "node:assert/strict";
import { test } from "node:test";

import { collectMediaHashes, firstMediaHash } from "./hashes";

test("collectMediaHashes reads canonical original and thumb paths", () => {
  const hash = "a".repeat(64);
  const hashes = collectMediaHashes(
    `![x](/api/uploads/images/original/aa/${hash}.jpg)`,
    `https://example.cos.ap-guangzhou.myqcloud.com/images/thumbs/${hash.slice(0, 2)}/${hash}.webp`,
  );
  assert.deepEqual(hashes, [hash]);
});

test("collectMediaHashes reads video keys", () => {
  const hash = "b".repeat(64);
  const hashes = collectMediaHashes(`<Video src="/api/uploads/videos/mp4/${hash.slice(0, 2)}/${hash}.mp4" />`);
  assert.deepEqual(hashes, [hash]);
});

test("firstMediaHash returns the first hash in a cover url", () => {
  const hash = "c".repeat(64);
  assert.equal(
    firstMediaHash(`https://cdn.example.com/images/original/${hash.slice(0, 2)}/${hash}.png`),
    hash,
  );
});
