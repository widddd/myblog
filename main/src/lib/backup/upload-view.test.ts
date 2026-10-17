import assert from "node:assert/strict";
import test from "node:test";

import {
  backupLocationLabel,
  backupUploadActionLabel,
  isCosUploadInFlight,
  type BackupCosUpload,
} from "./upload-view";

/** 后台是静默上传，这一列是用户唯一能看出「到底上云没有」的地方，文案必须钉住。 */

const upload = (status: BackupCosUpload["status"]): BackupCosUpload => ({
  status,
  attempts: 1,
  updatedAt: "2026-10-03T20:15:00.000Z",
});

test("位置列：本地 / 上传中 / 上云失败 / 本地 + COS / 仅 COS", () => {
  assert.equal(backupLocationLabel({ local: true, cos: false }), "本地");
  assert.equal(
    backupLocationLabel({ local: true, cos: false, cosUpload: upload("queued") }),
    "本地 · 上传中…",
  );
  assert.equal(
    backupLocationLabel({ local: true, cos: false, cosUpload: upload("uploading") }),
    "本地 · 上传中…",
  );
  assert.equal(
    backupLocationLabel({ local: true, cos: false, cosUpload: upload("failed") }),
    "本地 · 上云失败",
  );
  assert.equal(
    backupLocationLabel({ local: true, cos: true, cosUpload: upload("failed") }),
    "本地 + COS",
    "云端已有副本时不该再喊失败",
  );
  assert.equal(backupLocationLabel({ local: false, cos: true }), "仅 COS");
});

test("上传中判定：只有 queued / uploading 算在飞", () => {
  assert.equal(isCosUploadInFlight({ cosUpload: upload("queued") }), true);
  assert.equal(isCosUploadInFlight({ cosUpload: upload("uploading") }), true);
  assert.equal(isCosUploadInFlight({ cosUpload: upload("failed") }), false);
  assert.equal(isCosUploadInFlight({}), false);
});

test("手动按钮文案：失败给「重试上传」，在飞时锁成「上传中…」", () => {
  assert.equal(backupUploadActionLabel({}), "上传到 COS");
  assert.equal(backupUploadActionLabel({ cosUpload: upload("failed") }), "重试上传");
  assert.equal(backupUploadActionLabel({ cosUpload: upload("queued") }), "上传中…");
});
