import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidStorageKeyError,
  isImmutableStorageKey,
  normalizeStorageKey,
} from "./types";

test("storage keys remain canonical POSIX paths", () => {
  const key = `${"a".repeat(64)}-content.webp`;
  assert.equal(normalizeStorageKey(`images/${key}`), `images/${key}`);
  assert.equal(isImmutableStorageKey(`images/${key}`), true);
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
