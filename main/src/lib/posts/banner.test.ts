import assert from "node:assert/strict";
import test from "node:test";

import { bannerFill, postBannerKind } from "./banner";

test("postBannerKind 区分封面图 / 色块 / 真无封面", () => {
  assert.equal(postBannerKind("cover", "/api/uploads/images/a-content.webp"), "image");
  assert.equal(postBannerKind("cover", null), "none");
  assert.equal(postBannerKind("cover", ""), "none");
  assert.equal(postBannerKind("gradient", null), "fill");
  assert.equal(postBannerKind("solid", null), "fill");
  // 选了纯色/混色就画色块，即使有遗留的旧封面值（与 PostHero 一致）
  assert.equal(postBannerKind("gradient", "/api/uploads/images/a-content.webp"), "fill");
  // 历史数据里 bannerStyle 为空但有图 → 当封面图
  assert.equal(postBannerKind(null, "/api/uploads/images/a-content.webp"), "image");
  assert.equal(postBannerKind(null, null), "none");
});

test("bannerFill 对缺色值兜底，只给纯色/混色返回值", () => {
  assert.equal(bannerFill("solid", null, null), "#4db8e8");
  assert.equal(bannerFill("solid", "#123456", null), "#123456");
  assert.equal(
    bannerFill("gradient", null, null),
    "linear-gradient(135deg, #4db8e8 0%, #7b6cff 100%)",
  );
  assert.equal(
    bannerFill("gradient", "#111111", "#222222"),
    "linear-gradient(135deg, #111111 0%, #222222 100%)",
  );
  assert.equal(bannerFill("cover", "#111111", "#222222"), undefined);
});
