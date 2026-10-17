import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import Database from "better-sqlite3";

import type { BackupUploadEntry } from "./uploads";

/**
 * 上云队列的**状态文件与补传入口**契约（真 IO，跑在临时目录里，不碰开发机的 data/ 与库）。
 *
 * `lib/backup/uploads.ts` 的所有路径都是 `path.resolve(process.cwd(), ...)`，所以 chdir 到临时目录
 * **之后**再动态 import，就得到一份独立的实例：状态文件落在 `<tmp>/data/backup-uploads.json`，
 * 备份目录落在 `<tmp>/data/backups`。
 *
 * 临时目录里还要造一个只有 `Setting` 表的最小库：`retryPendingBackupUploads()` 会先问
 * 「配没配 COS」（`loadCosSettings()` → Prisma 查 Setting），没库的话这一步直接抛错，
 * 就测不到「没配 COS 时把队列清掉」这条分支。
 *
 * 依赖真实 COS 的分支（真的 putObject）不在这里——那需要桶和密钥，属于上机验证范围。
 */

const SAMPLE = "myblog-20261003-201540.tar.gz";

function entry(status: BackupUploadEntry["status"]): BackupUploadEntry {
  return {
    status,
    attempts: 1,
    updatedAt: new Date(2026, 9, 3, 20, 15, 0).toISOString(),
  };
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function readKeys(file: string): Promise<string[]> {
  if (!(await exists(file))) {
    return [];
  }
  return Object.keys(JSON.parse(await readFile(file, "utf8")) as object);
}

test("上云队列：状态文件读改写 + 没配 COS 的补传入口", async (t: TestContext) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myblog-uploads-io-"));
  const previousCwd = process.cwd();
  try {
    await mkdir(path.join(root, "data", "backups"), { recursive: true });
    // 最小 Setting 表：只为让 loadCosSettings() 能查到「没有 COS 配置」
    const db = new Database(path.join(root, "data", "blog.db"));
    db.exec(
      'CREATE TABLE "Setting" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "key" TEXT NOT NULL UNIQUE, "value" TEXT NOT NULL)',
    );
    db.close();

    process.chdir(root);
    const {
      clearAllBackupUploads,
      clearBackupUpload,
      getBackupUploads,
      retryPendingBackupUploads,
    } = await import("./uploads");

    const stateFile = path.join(root, "data", "backup-uploads.json");
    const backupFile = path.join(root, "data", "backups", SAMPLE);

    await t.test("空状态不造文件；幽灵记录清掉、在盘记录留下并落盘", async () => {
      assert.deepEqual(await getBackupUploads(), {});
      assert.equal(await exists(stateFile), false);

      await writeFile(
        stateFile,
        `${JSON.stringify(
          {
            [SAMPLE]: entry("uploading"),
            "myblog-19990101-000000.tar.gz": entry("queued"),
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      const kept = await getBackupUploads([SAMPLE]);
      assert.deepEqual(Object.keys(kept), [SAMPLE], "幽灵记录必须被清掉");
      assert.deepEqual(await readKeys(stateFile), [SAMPLE], "清理结果要落盘");
      assert.equal(
        kept[SAMPLE].status,
        "uploading",
        "进程被打断留在 uploading 的记录要保留（启动补偿靠它续传）",
      );

      // 没有幽灵可清时不该重写文件
      const before = (await stat(stateFile)).mtimeMs;
      await getBackupUploads([SAMPLE]);
      assert.equal((await stat(stateFile)).mtimeMs, before);
    });

    await t.test("单条清理 / 全清之后不留空壳文件", async () => {
      await clearBackupUpload(SAMPLE);
      assert.deepEqual(await readKeys(stateFile), []);
      assert.equal(await exists(stateFile), false);

      await writeFile(stateFile, `${JSON.stringify({ [SAMPLE]: entry("queued") })}\n`);
      await clearAllBackupUploads();
      assert.equal(await exists(stateFile), false);
    });

    await t.test("没配 COS：补传入口直接清空队列，不留永远传不完的记录", async () => {
      await writeFile(backupFile, "not-a-real-package");
      await writeFile(stateFile, `${JSON.stringify({ [SAMPLE]: entry("failed") })}\n`);

      assert.equal(await retryPendingBackupUploads(), null);
      assert.deepEqual(await getBackupUploads(), {});
      assert.equal(
        await exists(stateFile),
        false,
        "COS 关掉后这些记录再也不会成功，必须清掉（UI 上就只剩「本地」）",
      );
      assert.equal(await exists(backupFile), true, "清队列不能删掉备份包本身");
    });
  } finally {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});
