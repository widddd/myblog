import assert from "node:assert/strict";
import { test } from "node:test";

import { parseUploadKindFilter, UPLOAD_KIND_FILTERS } from "./kind-filter";

test("媒体库类型分区：四个取值 + 非法值一律当全部", () => {
  assert.deepEqual(
    UPLOAD_KIND_FILTERS.map((option) => option.value),
    ["", "image", "video", "audio"],
  );
  assert.equal(parseUploadKindFilter("audio"), "audio");
  assert.equal(parseUploadKindFilter(" image "), "image");
  assert.equal(parseUploadKindFilter(""), "");
  assert.equal(parseUploadKindFilter(undefined), "");
  assert.equal(parseUploadKindFilter(null), "");
  // 多值、乱值、大小写都不认（页面上只有这四个按钮，脏查询串一律回落"全部"）
  assert.equal(parseUploadKindFilter("audio,video"), "");
  assert.equal(parseUploadKindFilter("AUDIO"), "");
  assert.equal(parseUploadKindFilter("' OR 1=1"), "");
});
