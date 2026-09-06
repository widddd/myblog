import assert from "node:assert/strict";
import test from "node:test";

import { isExternalMediaUrl, isSafeHref, isSafeMediaUrl, mediaSourceHost } from "./url";

test("isSafeMediaUrl allows local uploads and https only", () => {
  assert.equal(isSafeMediaUrl("/api/uploads/videos/a.mp4"), true);
  assert.equal(isSafeMediaUrl("https://cdn.example.com/a.mp4"), true);
  assert.equal(isSafeMediaUrl("http://cdn.example.com/a.mp4"), false);
  assert.equal(isSafeMediaUrl("javascript:alert(1)"), false);
});

test("isSafeHref allows same-origin paths and https only", () => {
  assert.equal(isSafeHref("/posts"), true);
  assert.equal(isSafeHref("https://example.com/a"), true);
  assert.equal(isSafeHref("javascript:alert(1)"), false);
  assert.equal(isSafeHref("//evil.com"), false);
  assert.equal(isSafeHref("http://cdn.example.com"), false);
});

test("mediaSourceHost labels external videos", () => {
  assert.equal(mediaSourceHost("/api/uploads/videos/a.mp4"), null);
  assert.equal(mediaSourceHost("https://cdn.example.com/watch.mp4"), "cdn.example.com");
  assert.equal(isExternalMediaUrl("https://cdn.example.com/watch.mp4"), true);
});
