import assert from "node:assert/strict";
import test from "node:test";

import { formatClockDuration } from "../utils/date";

import {
  keysForDelete,
  mimePrefixForKind,
  mimePrefixesForKinds,
  parseUploadDuration,
  plannedLocations,
} from "./locations";

const hash = `${"ab".repeat(32)}`;

test("mimePrefixForKind and parseUploadDuration", () => {
  assert.equal(mimePrefixForKind("image"), "image/");
  assert.equal(mimePrefixForKind("audio"), "audio/");
  assert.equal(mimePrefixForKind("nope"), null);
  assert.equal(parseUploadDuration("83.4"), 83);
  assert.equal(parseUploadDuration(-1), null);
  assert.equal(parseUploadDuration(90_000), null);
  assert.equal(formatClockDuration(83), "1:23");
  assert.equal(formatClockDuration(3661), "1:01:01");
});

test("mimePrefixesForKinds：多值/单值/脏值都与旧行为一致", () => {
  // 瞬间配图的媒体库选择器：图片 + 视频
  assert.deepEqual(mimePrefixesForKinds("image,video"), ["image/", "video/"]);
  assert.deepEqual(mimePrefixesForKinds(" video , image "), ["video/", "image/"]);
  assert.deepEqual(mimePrefixesForKinds("image"), ["image/"]);
  // 重复值去重；未知值 / 空值 = 不过滤（与 mimePrefixForKind 同口径）
  assert.deepEqual(mimePrefixesForKinds("image,image"), ["image/"]);
  assert.deepEqual(mimePrefixesForKinds("nope"), []);
  assert.deepEqual(mimePrefixesForKinds(""), []);
  assert.deepEqual(mimePrefixesForKinds(null), []);
  assert.deepEqual(mimePrefixesForKinds(undefined), []);
});

test("plannedLocations lists local thumbs and never puts thumb2 on COS", () => {
  const row = {
    key: `images/original/ab/${hash}.jpg`,
    hash,
    mime: "image/jpeg",
    variants: JSON.stringify({
      thumb: { key: `images/thumbs/ab/${hash}.webp`, mime: "image/webp", width: 1, height: 1, size: 2 },
      thumb2: { key: `images/thumbs2/ab/${hash}.webp`, mime: "image/webp", width: 1, height: 1, size: 1 },
    }),
  };
  const plans = plannedLocations(row);
  assert.ok(plans.some((plan) => plan.place === "local" && plan.role === "thumb2"));
  assert.equal(
    plans.some((plan) => plan.place === "cos" && plan.role === "thumb2"),
    false,
  );
  assert.ok(keysForDelete(row).includes(`images/thumbs2/ab/${hash}.webp`));
  assert.ok(keysForDelete(row).includes(`images/original/ab/${hash}.jpg`));
});
