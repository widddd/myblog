import assert from "node:assert/strict";
import test from "node:test";

import { formatClockDuration } from "../utils/date";

import {
  keysForDelete,
  mimePrefixForKind,
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
