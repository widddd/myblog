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

test("normalizePostContent turns HTML audio and audio images into Audio JSX", () => {
  const source = [
    '<audio src="https://bucket.cos.ap-shanghai.myqcloud.com/media/audio/a-original.mp3" controls></audio>',
    '![clip](https://cdn.example.com/song.m4a "Demo")',
    '<Audio src="https://cdn.example.com/keep.mp3" />',
  ].join("\n\n");

  const normalized = normalizePostContent(source);

  assert.match(
    normalized,
    /<Audio src="https:\/\/bucket\.cos\.ap-shanghai\.myqcloud\.com\/media\/audio\/a-original\.mp3" \/>/,
  );
  assert.match(
    normalized,
    /<Audio src="https:\/\/cdn\.example\.com\/song\.m4a" title="Demo" \/>/,
  );
  assert.match(normalized, /<Audio src="https:\/\/cdn\.example\.com\/keep\.mp3" \/>/);
  assert.doesNotMatch(normalized, /<audio[\s>]/);
});

test("normalizePostContent rejects unsafe video URLs", () => {
  const source = '<video src="javascript:alert(1)"></video>';
  assert.equal(normalizePostContent(source), source);
});
