import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extensionOfUploadName,
  extensionFitsMediaKind,
  MAX_UPLOAD_FILE_NAME_LENGTH,
  safeUploadFileName,
  suppliedExtensionMatchesKind,
} from "./file-name";

const LONG_WEIBO_NAME =
  "img-1792197890327e459ffaeb3a3cf7e2dce3bb514cab86d7bb60809b3af4acc87584006850f56b.jpg";

test("超长微博图片文件名会被压到上限以内并保留 .jpg", () => {
  const safe = safeUploadFileName(LONG_WEIBO_NAME, "image/jpeg");
  assert.ok(safe.length <= MAX_UPLOAD_FILE_NAME_LENGTH, safe);
  assert.ok(safe.endsWith(".jpg"), safe);
  assert.ok(safe.startsWith("img-"), safe);
});

test("短文件名和中文文件名不被无谓改写", () => {
  assert.equal(safeUploadFileName("微信图片_2025-08-22_082637_147.jpg", "image/jpeg"), "微信图片_2025-08-22_082637_147.jpg");
  assert.equal(safeUploadFileName("photo.webp", "image/webp"), "photo.webp");
  assert.equal(safeUploadFileName("README", "text/plain"), "README");
});

test("路径分隔符与控制字符会被替换，无后缀时按 MIME 补", () => {
  assert.equal(safeUploadFileName("../dir\\bad:name.png", "image/png"), "dir-bad-name.png");
  assert.equal(safeUploadFileName("", "image/webp"), "upload.webp");
  assert.ok(safeUploadFileName("abc", "video/mp4").endsWith(".mp4"));
});

test("扩展名解析与同类型容错：错后缀图片可以进，跨媒体类型不行", () => {
  assert.equal(extensionOfUploadName(LONG_WEIBO_NAME), "jpg");
  assert.equal(extensionOfUploadName("no-extension"), "");
  assert.equal(extensionFitsMediaKind("jpg", "image"), true);
  assert.equal(extensionFitsMediaKind("webp", "image"), true);
  assert.equal(extensionFitsMediaKind("jpg", "video"), false);

  // 微博/图床常见的“WebP 内容 + .jpg 文件名”：同一媒体类型，放行。
  assert.equal(suppliedExtensionMatchesKind("weibo-image.jpg", "image"), true);
  assert.equal(suppliedExtensionMatchesKind("clip.mov", "video"), false);
  assert.equal(suppliedExtensionMatchesKind("photo.jpg", "video"), false);
  assert.equal(suppliedExtensionMatchesKind("voice.m4a", "audio"), true);
  // 无后缀不靠猜，交给内容嗅探。
  assert.equal(suppliedExtensionMatchesKind("blob", "audio"), true);
});
