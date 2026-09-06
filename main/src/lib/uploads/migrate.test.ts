import assert from "node:assert/strict";
import test from "node:test";

import {
  alreadyOnCos,
  destCosOriginalKey,
  destCosThumbKey,
  mediaFolderForMime,
  originalExtension,
} from "./migrate";

const hash = "a".repeat(64);

test("dest COS keys shard by hash prefix and keep the original extension", () => {
  assert.equal(mediaFolderForMime("image/jpeg"), "images");
  assert.equal(mediaFolderForMime("video/mp4"), "videos");
  assert.equal(mediaFolderForMime("audio/mpeg"), "audio");
  assert.equal(originalExtension("images/abc-original.jpg", "image/jpeg"), "jpg");
  assert.equal(
    destCosOriginalKey({
      hash,
      key: `images/${hash}-original.png`,
      mime: "image/png",
    }),
    `images/original/aa/${hash}.png`,
  );
  assert.equal(destCosThumbKey({ hash }), `images/thumbs/aa/${hash}.webp`);
});

test("alreadyOnCos accepts canonical keys and legacy media/ keys", () => {
  assert.equal(
    alreadyOnCos({ driver: "cos", key: `media/images/${hash}-original.jpg` }),
    true,
  );
  assert.equal(
    alreadyOnCos({ driver: "oss", key: `images/original/bb/${"b".repeat(64)}.mp4` }),
    true,
  );
  assert.equal(
    alreadyOnCos({ driver: "local", key: `images/${hash}-original.jpg` }),
    false,
  );
});
