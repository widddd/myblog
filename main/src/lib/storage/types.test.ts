import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidStorageKeyError,
  contentTypeFromStorageKey,
  isImmutableStorageKey,
  normalizeStorageKey,
} from "./types";

test("storage keys remain canonical POSIX paths", () => {
  const key = `${"a".repeat(64)}-content.webp`;
  assert.equal(normalizeStorageKey(`images/${key}`), `images/${key}`);
  assert.equal(isImmutableStorageKey(`images/${key}`), true);
});

test("COS media keys stay POSIX and map audio MIME", () => {
  const hash = "a".repeat(64);
  const key = `media/audio/${hash}-original.mp3`;
  const canonical = `images/original/aa/${hash}.jpg`;
  assert.equal(normalizeStorageKey(key), key);
  assert.equal(isImmutableStorageKey(key), true);
  assert.equal(isImmutableStorageKey(canonical), true);
  assert.equal(contentTypeFromStorageKey(key), "audio/mpeg");
});

test("storage keys reject traversal and Windows separators", () => {
  for (const key of [
    "../secret",
    "images/../secret",
    "images\\secret",
    "/absolute/path",
    "images//file.webp",
    "images/%2e%2e/secret",
  ]) {
    assert.throws(() => normalizeStorageKey(key), InvalidStorageKeyError);
  }
});
