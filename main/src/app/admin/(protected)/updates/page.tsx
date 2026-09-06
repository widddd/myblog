import type { Metadata } from "next";

import { UpdatePanel } from "@/components/admin/UpdatePanel";
import { readPendingRestore } from "@/lib/backup/restore";
import { listUpdatePackages } from "@/lib/update/files";
import { readPendingUpdate, readUpdateState } from "@/lib/update/pending";
import { currentBackupRelease } from "@/lib/release";
import { readUpdateSidecar } from "@/lib/update/sidecar";

export const metadata: Metadata = {
  title: "更新",
};

export default async function AdminUpdatesPage() {
  const [files, pendingUpdate, pendingRestore, lastApply] = await Promise.all([
    listUpdatePackages(),
    readPendingUpdate(),
    readPendingRestore(),
    readUpdateState(),
  ]);
  const appRelease = currentBackupRelease();

  return (
    <section className="heo-card admin-panel">
      <h2>程序更新</h2>
      <p className="admin-muted">
        导入一份新的博客程序包（或把当前程序打成包带走）。点「应用」只写入预约，到点或点「立刻重启」后才会覆盖{" "}
        <code>src/</code>、<code>prisma/</code> 等程序文件。文章、图片、设置和 <code>.env</code>{" "}
        不会被换掉。生产环境重启后会尝试迁移数据库并重新构建，可能需要几分钟。
      </p>
      <p className="admin-danger">
        更新覆盖的是程序，不是备份恢复。建议先「打包当前程序」并下载，以便失败时再导回去。
      </p>
      <UpdatePanel
        initialAppRelease={appRelease}
        initialPendingUpdate={pendingUpdate}
        initialRestorePending={Boolean(pendingRestore)}
        initialLastApply={lastApply}
        initialFiles={await Promise.all(
          files.map(async (file) => {
            const sidecar = await readUpdateSidecar(file.name);
            return {
              ...file,
              channel: sidecar?.channel ?? null,
              version: sidecar?.version ?? null,
              label: sidecar?.label ?? "未知版本",
              packedAt: sidecar?.createdAt ?? file.createdAt,
              fileCount: sidecar?.fileCount ?? null,
            };
          }),
        )}
      />
    </section>
  );
}
