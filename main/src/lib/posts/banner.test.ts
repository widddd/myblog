import assert from "node:assert/strict";
import test from "node:test";

import {
  bannerFill,
  focalPosition,
  postCoverKind,
  randomBannerGradient,
  resolveBannerVisual,
  resolveCoverVisual,
} from "./banner";

test("封面形态与 Banner 解耦：纯色/混色只看 coverStyle", () => {
  assert.equal(postCoverKind("image", "/api/uploads/images/a-content.webp"), "image");
  assert.equal(postCoverKind("image", null), "none");
  assert.equal(postCoverKind("solid", null), "fill");
  assert.equal(postCoverKind("gradient", null), "fill");
  assert.equal(postCoverKind("none", "/api/uploads/images/a-content.webp"), "none");
  // 历史数据没有 coverStyle：有图按图，无图按无封面
  assert.equal(postCoverKind(null, "/api/uploads/images/a-content.webp"), "image");
  assert.equal(postCoverKind(null, null), "none");
});

test("Banner 支持与封面一致 / 单独图片 / 纯色混色，且永不留白", () => {
  const base = {
    bannerStyle: "cover",
    bannerImage: null,
    bannerColor: null,
    bannerColor2: null,
    coverStyle: "image",
    cover: "/api/uploads/images/cover.webp",
    coverColor: null,
    coverColor2: null,
  };
  assert.deepEqual(resolveBannerVisual(base), {
    kind: "image",
    src: "/api/uploads/images/cover.webp",
    source: "cover",
  });
  assert.deepEqual(
    resolveBannerVisual({ ...base, bannerStyle: "image", bannerImage: "/api/uploads/images/banner.webp" }),
    { kind: "image", src: "/api/uploads/images/banner.webp", source: "image" },
  );
  assert.equal(
    resolveBannerVisual({ ...base, bannerStyle: "solid", bannerColor: "#123456" }).kind,
    "fill",
  );
  // 与封面一致时，封面是混色也复用封面的色块
  assert.deepEqual(
    resolveBannerVisual({
      ...base,
      coverStyle: "gradient",
      cover: null,
      coverColor: "#111111",
      coverColor2: "#222222",
    }),
    { kind: "fill", background: "linear-gradient(135deg, #111111 0%, #222222 100%)" },
  );
  // 封面被删掉、Banner 仍然是“与封面一致” → 回退默认混色，不出现空白
  assert.equal(
    resolveBannerVisual({
      ...base,
      coverStyle: "none",
      cover: null,
      bannerColor: "#123456",
      bannerColor2: "#654321",
    }).kind,
    "fill",
  );
});

test("封面视觉：图片 / 色块 / 无封面", () => {
  assert.deepEqual(resolveCoverVisual("image", "/a.webp"), {
    kind: "image",
    src: "/a.webp",
  });
  assert.deepEqual(resolveCoverVisual("solid", null, "#123456"), {
    kind: "fill",
    background: "#123456",
  });
  assert.equal(resolveCoverVisual("none", "/a.webp").kind, "none");
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
  assert.equal(bannerFill("image", "#111111", "#222222"), undefined);
});

test("randomBannerGradient 只在点击删除时取一对稳定可用的颜色", () => {
  assert.deepEqual(randomBannerGradient(() => 0), {
    color: "#4db8e8",
    color2: "#7b6cff",
  });
  assert.deepEqual(randomBannerGradient(() => 0.999), {
    color: "#06b6d4",
    color2: "#3b82f6",
  });
});

test("focalPosition 夹取 0–100，缺省和异常都回落到居中", () => {
  assert.equal(focalPosition(0, 100), "0% 100%");
  assert.equal(focalPosition(35, 70), "35% 70%");
  assert.equal(focalPosition(-10, 140), "0% 100%");
  assert.equal(focalPosition(50.4, 49.6), "50% 50%");
  assert.equal(focalPosition(undefined, null), "50% 50%");
  assert.equal(focalPosition(Number.NaN, Number.POSITIVE_INFINITY), "50% 50%");
});
