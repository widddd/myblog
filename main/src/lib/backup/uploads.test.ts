import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BACKUP_UPLOAD_ATTEMPTS,
  backupUploadBackoffMs,
  cosBackupKey,
  isBackupUploadPending,
  isBackupUploadRetryDue,
  pruneBackupUploadStore,
  type BackupUploadEntry,
} from "./uploads";

/**
 * 上云队列的**纯逻辑**部分。这里刻意不碰 IO / COS：真上传要网络与凭据，
 * 而「什么时候该重试」「谁该被放过」才是 2026-10-03 那次「本地有、云端没有」
 * 事故里最容易写错的地方。
 */

const at = new Date(2026, 9, 3, 12, 0, 0).getTime();

const entry = (patch: Partial<BackupUploadEntry> = {}): BackupUploadEntry => ({
  status: "queued",
  attempts: 0,
  updatedAt: new Date(at).toISOString(),
  ...patch,
});

test("COS 上备份对象的 key 口径固定（backups/ 前缀）", () => {
  assert.equal(
    cosBackupKey("myblog-20261003-201540.tar.gz"),
    "backups/myblog-20261003-201540.tar.gz",
  );
});

test("退避：指数增长并封顶 10 分钟", () => {
  assert.equal(backupUploadBackoffMs(1), 30_000);
  assert.equal(backupUploadBackoffMs(2), 60_000);
  assert.equal(backupUploadBackoffMs(3), 120_000);
  assert.equal(backupUploadBackoffMs(6), 600_000);
  assert.equal(
    backupUploadBackoffMs(99),
    600_000,
    "再多次失败也不能让重试间隔无限拉长",
  );
  assert.equal(backupUploadBackoffMs(0), 30_000, "脏值按第一次算");
});

test("该不该补传：排队/在传立刻算到期，失败等退避，试满停手", () => {
  assert.equal(isBackupUploadRetryDue(entry({ status: "queued" }), at), true);
  // 进程被打断后留在 uploading 的记录，必须在启动补偿时被捡回来
  assert.equal(
    isBackupUploadRetryDue(entry({ status: "uploading", attempts: 1 }), at),
    true,
  );
  // 刚失败：等退避时间
  assert.equal(
    isBackupUploadRetryDue(entry({ status: "failed", attempts: 1 }), at),
    false,
  );
  assert.equal(
    isBackupUploadRetryDue(entry({ status: "failed", attempts: 1 }), at + 30_000),
    true,
  );
  // 试满上限：不再自动重试（只剩管理员手动点「重试上传」）
  assert.equal(
    isBackupUploadRetryDue(
      entry({ status: "failed", attempts: MAX_BACKUP_UPLOAD_ATTEMPTS }),
      at + 60 * 60_000,
    ),
    false,
  );
});

test("幽灵记录（本地包已经不在）会被清掉", () => {
  const keep = "myblog-20261003-201540.tar.gz";
  const store = {
    [keep]: entry(),
    "myblog-20261001-214323.tar.gz": entry(),
    "not-a-backup.txt": entry(),
  };
  const { store: next, changed } = pruneBackupUploadStore(store, [keep]);
  assert.equal(changed, true);
  assert.deepEqual(Object.keys(next), [keep]);
  assert.equal(
    pruneBackupUploadStore(next, [keep]).changed,
    false,
    "没有幽灵记录时不该写盘",
  );
});

test("轮转清理要放过「等上传」的包", () => {
  assert.equal(isBackupUploadPending(entry({ status: "queued" })), true);
  assert.equal(isBackupUploadPending(entry({ status: "uploading" })), true);
  assert.equal(
    isBackupUploadPending(entry({ status: "failed" })),
    false,
    "失败的包不该永远挡住清理，否则本地磁盘会被撑满",
  );
  assert.equal(isBackupUploadPending(undefined), false);
});
