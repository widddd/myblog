import type { Metadata } from "next";

import { BackupPanel } from "@/components/admin/BackupPanel";
import { listBackupRecords } from "@/lib/backup/backup";
import { keyFingerprint } from "@/lib/backup/crypto";
import { resolveBackupEncrypt } from "@/lib/backup/encrypt-policy";
import { readPendingRestore } from "@/lib/backup/restore";
import { listBackupKeyHashes } from "@/lib/backup/secrets";
import { currentBackupRelease } from "@/lib/release";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = {
  title: "备份",
};

export default async function AdminBackupsPage() {
  const [
    files,
    lastBackupAt,
    pendingRestore,
    hashes,
    encrypt,
  ] = await Promise.all([
    listBackupRecords(),
    getSetting<string | null>("lastBackupAt"),
    readPendingRestore(),
    listBackupKeyHashes(),
    resolveBackupEncrypt(),
  ]);
  const appRelease = currentBackupRelease();

  return (
    <section className="admin-card">
      <h2>备份与恢复</h2>
      <p className="admin-muted">
        加密可以随时打开或关闭。关掉后备份仍会保存、出现在列表里、按周期执行，并在配置了 COS
        时上传。加密备份必须在每次操作时手动输入口令，口令不会在本地保存。点恢复只是预约，到点或点「立刻重启」才会覆盖当前数据。换电脑恢复加密包用{" "}
        <code>pnpm restore --passphrase</code>。
      </p>
      <p className="admin-danger">
        恢复会覆盖当前全部文章、图片和设置。保存成功前不要关闭本页。
      </p>
      <BackupPanel
        initialEncrypt={encrypt}
        initialAppRelease={appRelease}
        initialFiles={files.map((file) => {
          const keyHash = hashes.get(file.name);
          return {
            ...file,
            keyFingerprint: keyHash ? keyFingerprint(keyHash) : null,
          };
        })}
        initialLastBackupAt={lastBackupAt}
        initialPendingRestore={pendingRestore}
      />
    </section>
  );
}
