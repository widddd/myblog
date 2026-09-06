import assert from "node:assert/strict";
import test from "node:test";

import {
  hashFromMediaKey,
  hashPrefix,
  isThumb2Key,
  isThumbKey,
  localOriginalCandidates,
  originalMediaKey,
  thumb2MediaKey,
  thumbMediaKey,
} from "./media-keys";

const hash = `${"ab".repeat(32)}`;

test("media keys shard by the first two hex chars", () => {
  assert.equal(hashPrefix(hash), "ab");
  assert.equal(
    originalMediaKey(hash, "image/jpeg", "jpg"),
    `images/original/ab/${hash}.jpg`,
  );
  assert.equal(thumbMediaKey(hash), `images/thumbs/ab/${hash}.webp`);
  assert.equal(thumb2MediaKey(hash), `images/thumbs2/ab/${hash}.webp`);
  assert.equal(isThumbKey(`images/thumbs/ab/${hash}.webp`), true);
  assert.equal(isThumbKey(`images/thumbs2/ab/${hash}.webp`), false);
  assert.equal(isThumb2Key(`images/thumbs2/ab/${hash}.webp`), true);
  assert.equal(hashFromMediaKey(`images/original/ab/${hash}.jpg`), hash);
  assert.equal(hashFromMediaKey(`images/thumbs2/ab/${hash}.webp`), hash);
  assert.equal(
    originalMediaKey(hash, "video/mp4", "mp4"),
    `videos/mp4/ab/${hash}.mp4`,
  );
  assert.equal(
    originalMediaKey(hash, "audio/mpeg", "mp3"),
    `audio/mp3/ab/${hash}.mp3`,
  );
});

test("local original candidates include legacy media/ paths", () => {
  const keys = localOriginalCandidates({
    hash,
    key: `media/images/${hash}-original.png`,
    mime: "image/png",
  });
  assert.ok(keys.includes(`images/original/ab/${hash}.png`));
  assert.ok(keys.includes(`media/images/${hash}-original.png`));
});
