/**
 * 相册地址名（slug）的守卫。
 * 行为口径来自 lib/utils/slugify.ts（实测：`樱花` → `樱花`、`Hello World` → `hello-world`、
 * `2026 樱花` → `2026`（strict 模式丢掉非 ASCII）、`!!!` → 空串）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  albumSlugFromTitle,
  ALBUM_SLUG_FALLBACK,
  ALBUM_SLUG_MAX,
  isValidAlbumSlug,
  normalizeAlbumSlugInput,
  uniqueAlbumSlug,
} from "./slug";

test("相册地址名：英文标题转 kebab，中文标题保留中文", () => {
  assert.equal(albumSlugFromTitle("Hello World"), "hello-world");
  assert.equal(albumSlugFromTitle("2026 Sakura Trip"), "2026-sakura-trip");
  assert.equal(albumSlugFromTitle("樱花"), "樱花");
});

test("相册地址名：中英混排时只留 ASCII（与文章地址同一套 slugify 口径，作者可在表单里手改）", () => {
  assert.equal(albumSlugFromTitle("2026 樱花"), "2026");
});

test("相册地址名：挑不出合法值时返回空串，交给调用方兜底", () => {
  assert.equal(albumSlugFromTitle("!!!"), "");
  assert.equal(albumSlugFromTitle("   "), "");
  assert.equal(albumSlugFromTitle("..."), "");
});

test("相册地址名：合法形态判定（允许中文，禁止路径危险字符）", () => {
  for (const value of ["spring", "spring-2026", "sakura_trip", "樱花", "2026樱花", "a"]) {
    assert.equal(isValidAlbumSlug(value), true, `${value} 应该合法`);
  }
  for (const [value, label] of [
    ["", "空"],
    [" ", "空格"],
    ["spring 2026", "含空格"],
    ["a/b", "含斜杠"],
    ["..", "路径穿越"],
    ["...spring", "以点开头"],
    ["-spring", "以连字符开头"],
    ["spring-", "以连字符结尾"],
    ["spring%2f", "含百分号"],
    ["spring?x=1", "含查询串"],
    ["spring#a", "含锚点"],
    ["a".repeat(ALBUM_SLUG_MAX + 1), "超长"],
  ] as const) {
    assert.equal(isValidAlbumSlug(value), false, `${label} 应该被拒：${value}`);
  }
  assert.equal(isValidAlbumSlug(undefined), false);
  assert.equal(isValidAlbumSlug(123), false);
});

test("相册地址名：撞名依次加后缀，且后缀不会被长度上限吃掉", () => {
  assert.equal(uniqueAlbumSlug("spring", []), "spring");
  assert.equal(uniqueAlbumSlug("spring", ["spring"]), "spring-2");
  assert.equal(uniqueAlbumSlug("spring", ["spring", "spring-2"]), "spring-3");
  assert.equal(uniqueAlbumSlug("spring", ["spring", "spring-2", "spring-3"]), "spring-4");

  // 根已经到长度上限：截短后再加后缀，结果仍在 60 字内、且不等于根
  const root = "x".repeat(ALBUM_SLUG_MAX);
  const next = uniqueAlbumSlug(root, [root]);
  assert.equal(next.length <= ALBUM_SLUG_MAX, true, `超长了：${next.length}`);
  assert.equal(next.endsWith("-2"), true);
  assert.notEqual(next, root);
  assert.equal(isValidAlbumSlug(next), true);
});

test("相册地址名：非法根值统一回落到 album，并照样去重", () => {
  assert.equal(uniqueAlbumSlug("!!!", []), ALBUM_SLUG_FALLBACK);
  assert.equal(uniqueAlbumSlug("", []), ALBUM_SLUG_FALLBACK);
  assert.equal(uniqueAlbumSlug("", [ALBUM_SLUG_FALLBACK]), `${ALBUM_SLUG_FALLBACK}-2`);
});

test("相册地址名：表单手填值的归一（去空白与首尾连字符）", () => {
  assert.equal(normalizeAlbumSlugInput("  spring  "), "spring");
  assert.equal(normalizeAlbumSlugInput("-spring-"), "spring");
  assert.equal(normalizeAlbumSlugInput("   "), "");
});
