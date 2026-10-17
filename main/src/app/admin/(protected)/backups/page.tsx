import type { Metadata } from "next";

import { BackupPanel } from "@/components/admin/BackupPanel";
import { listBackupRecords } from "@/lib/backup/backup";
import { keyFingerprint } from "@/lib/backup/crypto";
import { resolveBackupEncrypt } from "@/lib/backup/encrypt-policy";
import { readPendingRestore } from "@/lib/backup/restore";
import { resolvePeriodDays } from "@/lib/backup/schedule";
import { listBackupKeyHashes } from "@/lib/backup/secrets";
import { currentBackupRelease } from "@/lib/release";
import { getAdminSettings } from "@/lib/settings";
import { loadCosSettings } from "@/lib/storage";

export const metadata: Metadata = {
  title: "备份",
};

export default async function AdminBackupsPage() {
  const [files, pendingRestore, hashes, encrypt, settings, cos] =
    await Promise.all([
      listBackupRecords(),
      readPendingRestore(),
      listBackupKeyHashes(),
      resolveBackupEncrypt(),
      getAdminSettings(),
      loadCosSettings(),
    ]);
  const lastBackupAt = settings.lastBackupAt;
  const appRelease = currentBackupRelease();

  return (
    <section className="admin-card">
      <h2>备份与恢复</h2>
      <p className="admin-muted">
        自动备份（每几天 + 几点几分）、加密开关、手动备份与恢复都在本页。加密可以随时打开或关闭。
        关掉后备份仍会保存、出现在列表里、按周期执行，并在配置了 COS
        时在后台自动上传（备份一完成就能离开本页，不用等它传完；「位置」列会自己变成「本地 +
        COS」）。加密备份必须在每次操作时手动输入口令，口令不会在本地保存。点恢复只是预约，到点或点「立刻重启」才会覆盖当前数据。换电脑恢复加密包用{" "}
        <code>pnpm restore --passphrase</code>。
      </p>
      <p className="admin-danger">
        恢复会覆盖当前全部文章、图片和设置。保存成功前不要关闭本页。
      </p>
      <BackupPanel
        initialAppRelease={appRelease}
        initialCosConfigured={Boolean(cos)}
        initialEncrypt={encrypt}
        initialFiles={files.map((file) => {
          const keyHash = hashes.get(file.name);
          return {
            ...file,
            keyFingerprint: keyHash ? keyFingerprint(keyHash) : null,
          };
        })}
        initialLastBackupAt={lastBackupAt}
        initialPendingRestore={pendingRestore}
        initialSchedule={{
          backupPeriodDays: resolvePeriodDays(settings.backupPeriodDays),
          // 读取侧已归一（lib/settings.ts 走 normalizeBackupAtTime），这里直接给输入框
          backupAtTime: settings.backupAtTime,
          backupKeep: settings.backupKeep,
          backupLocalMaxMB: settings.backupLocalMaxMB,
        }}
      />
    </section>
  );
}
