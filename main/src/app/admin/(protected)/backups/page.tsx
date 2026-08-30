import type { Metadata } from "next";

import { BackupPanel } from "@/components/admin/BackupPanel";
import { listBackups } from "@/lib/backup/backup";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = {
  title: "备份",
};

export default async function AdminBackupsPage() {
  const [files, lastBackupAt] = await Promise.all([
    listBackups(),
    getSetting<string | null>("lastBackupAt"),
  ]);

  return (
    <section className="heo-card admin-panel">
      <h2>备份</h2>
      <p className="admin-muted">
        使用 better-sqlite3 <code>.backup()</code> 快照数据库，再用 archiver
        打包 <code>uploads/</code>。周期与保留份数在「设置」里配置。
      </p>
      <BackupPanel
        initialFiles={files}
        initialLastBackupAt={lastBackupAt}
      />
    </section>
  );
}
