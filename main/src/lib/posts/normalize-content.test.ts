import assert from "node:assert/strict";
import test from "node:test";

import { normalizePostContent } from "./normalize-content";

test("normalizePostContent turns HTML video and video images into Video JSX", () => {
  const source = [
    "Intro",
    '<video src="/api/uploads/videos/a-original.mp4" controls></video>',
    '![clip](/api/uploads/videos/b-original.webm "Demo")',
    '<Video src="/api/uploads/videos/keep.mp4" />',
    "![photo](/api/uploads/images/c-content.webp)",
  ].join("\n\n");

  const normalized = normalizePostContent(source);

  assert.match(normalized, /<Video src="\/api\/uploads\/videos\/a-original\.mp4" \/>/);
  assert.match(
    normalized,
    /<Video src="\/api\/uploads\/videos\/b-original\.webm" title="Demo" \/>/,
  );
  assert.match(normalized, /<Video src="\/api\/uploads\/videos\/keep\.mp4" \/>/);
  assert.match(normalized, /!\[photo]\(\/api\/uploads\/images\/c-content\.webp\)/);
  assert.doesNotMatch(normalized, /<video[\s>]/);
});

test("normalizePostContent rejects unsafe video URLs", () => {
  const source = '<video src="javascript:alert(1)"></video>';
  assert.equal(normalizePostContent(source), source);
});
