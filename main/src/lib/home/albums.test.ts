import assert from "node:assert/strict";
import test from "node:test";

import {
  HOME_ALBUM_CARD_LIMIT_DEFAULT,
  HOME_ALBUM_CARD_LIMIT_MAX,
  HOME_ALBUM_CARD_LIMIT_MIN,
  HOME_ALBUM_LIMIT_DEFAULT,
  HOME_ALBUM_SPEED_DEFAULT,
  HOME_ALBUM_SPEED_MAX,
  HOME_ALBUM_SPEED_MIN,
  normalizeAlbumCardLimit,
  normalizeAlbumLimit,
  normalizeAlbumSpeed,
  parseAlbumSlugField,
} from "./albums";

test("首页相册模块：滚动秒数夹到区间，脏值回落到默认", () => {
  assert.equal(normalizeAlbumSpeed(60), 60);
  assert.equal(normalizeAlbumSpeed(1), HOME_ALBUM_SPEED_MIN);
  assert.equal(normalizeAlbumSpeed(9999), HOME_ALBUM_SPEED_MAX);
  assert.equal(normalizeAlbumSpeed(0), HOME_ALBUM_SPEED_MIN);
  assert.equal(normalizeAlbumSpeed(-5), HOME_ALBUM_SPEED_MIN);
  assert.equal(normalizeAlbumSpeed(undefined), HOME_ALBUM_SPEED_DEFAULT);
  assert.equal(normalizeAlbumSpeed("快一点"), HOME_ALBUM_SPEED_DEFAULT);
});

test("首页相册模块：张数夹到区间", () => {
  assert.equal(normalizeAlbumLimit(12), 12);
  assert.equal(normalizeAlbumLimit(1), 6);
  assert.equal(normalizeAlbumLimit(500), 24);
  assert.equal(normalizeAlbumLimit(undefined), HOME_ALBUM_LIMIT_DEFAULT);
});

test("首页相册模块：相册地址名去空白去重，空 = 全部", () => {
  assert.deepEqual(parseAlbumSlugField(""), []);
  assert.deepEqual(parseAlbumSlugField("  \n \n"), []);
  assert.deepEqual(parseAlbumSlugField("sakura\n spring \nsakura"), ["sakura", "spring"]);
});

test("相册卡片模块：摆几本夹到区间，脏值回落到默认", () => {
  assert.equal(normalizeAlbumCardLimit(4), 4);
  assert.equal(normalizeAlbumCardLimit(1), HOME_ALBUM_CARD_LIMIT_MIN);
  assert.equal(normalizeAlbumCardLimit(500), HOME_ALBUM_CARD_LIMIT_MAX);
  assert.equal(normalizeAlbumCardLimit(0), HOME_ALBUM_CARD_LIMIT_MIN);
  assert.equal(normalizeAlbumCardLimit(-3), HOME_ALBUM_CARD_LIMIT_MIN);
  assert.equal(normalizeAlbumCardLimit(undefined), HOME_ALBUM_CARD_LIMIT_DEFAULT);
  assert.equal(normalizeAlbumCardLimit("全都要"), HOME_ALBUM_CARD_LIMIT_DEFAULT);
  // 上限必须小于滚动条那版：这里是摆出来的卡，不是图流
  assert.ok(HOME_ALBUM_CARD_LIMIT_MAX < 24);
});
