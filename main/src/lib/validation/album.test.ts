import assert from "node:assert/strict";
import test from "node:test";

import { albumVolumePatchSchema, uploadAlbumPatchSchema } from "@/lib/validation/album";

/**
 * 媒体库单张改归属（`PATCH /api/admin/uploads/[id]`）的入参契约。
 *
 * 这条路是「相册 + 卷」两件事共用一个 PATCH：以前只认 `albumId`，加了卷之后
 * ① 两个字段都必须可选（改卷不该被迫重发相册）、② 一个都不给要挡住（空 PATCH 是调用方的 bug，
 * 不能静默 200）——这两条错了要么功能不通，要么接口静默什么都不做。
 */

test("改卷可以单独发：给 volumeId 就够（不强制带 albumId）", () => {
  const parsed = uploadAlbumPatchSchema.safeParse({ volumeId: 7 });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success ? parsed.data : null, { volumeId: 7 });
});

test("volumeId = null 合法（放回「暂不分类」）", () => {
  const parsed = uploadAlbumPatchSchema.safeParse({ volumeId: null });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success ? parsed.data : null, { volumeId: null });
});

test("相册与卷可以一起发（换相册 + 归卷一次到位）", () => {
  const parsed = uploadAlbumPatchSchema.safeParse({ albumId: 3, volumeId: 9 });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success ? parsed.data : null, { albumId: 3, volumeId: 9 });
  // albumId = null 与 volumeId = null 一起发也合法（移出相册；卷本来就要清零）
  assert.equal(
    uploadAlbumPatchSchema.safeParse({ albumId: null, volumeId: null }).success,
    true,
  );
});

test("空 PATCH 与非法 id 一律拒绝", () => {
  const empty = uploadAlbumPatchSchema.safeParse({});
  assert.equal(empty.success, false);
  assert.equal(empty.error?.issues[0]?.message, "至少提供一个要修改的字段");

  for (const bad of [{ volumeId: 0 }, { volumeId: -1 }, { volumeId: 1.5 }, { albumId: 0 }, { volumeId: "7" }]) {
    assert.equal(
      uploadAlbumPatchSchema.safeParse(bad).success,
      false,
      `${JSON.stringify(bad)} 应被拒绝`,
    );
  }
});

/**
 * 卷改名的入参契约（2026-10-03 追加口径）：**空卷名合法**。
 *
 * 空卷名不是漏填，而是有语义的：「这一卷不作为独立分组」——读层把它的照片并入
 * 前台最前那组「不属于任何卷」（`lib/albums/query.ts` 的 `getPublicAlbum()`）。
 * 所以 `title` 上那条 `.min(1)`（空串 400「卷标题不能为空」）必须保持撤销；
 * 同时**不许**顺手加「至少一个字段」以外的额外限制（`{}` 该被 refine 挡住那条照旧）。
 */
test("卷改名收空串：空卷名 = 不作为独立分组（不再 400「卷标题不能为空」）", () => {
  const empty = albumVolumePatchSchema.safeParse({ title: "" });
  assert.equal(empty.success, true);
  assert.deepEqual(empty.success ? empty.data : null, { title: "" });
});

test("卷改名：纯空白按空串处理（trim 后落库就是空卷名）", () => {
  const blank = albumVolumePatchSchema.safeParse({ title: "   " });
  assert.equal(blank.success, true);
  assert.deepEqual(blank.success ? blank.data : null, { title: "" });
});

test("卷改名：正常卷名仍然 trim + 限长，空 PATCH 仍拒绝", () => {
  const named = albumVolumePatchSchema.safeParse({ title: "  周末散步  " });
  assert.equal(named.success, true);
  assert.deepEqual(named.success ? named.data : null, { title: "周末散步" });

  const tooLong = albumVolumePatchSchema.safeParse({ title: "卷".repeat(61) });
  assert.equal(tooLong.success, false);

  const emptyPatch = albumVolumePatchSchema.safeParse({});
  assert.equal(emptyPatch.success, false);
  assert.equal(emptyPatch.error?.issues[0]?.message, "至少提供一个要修改的字段");
});
