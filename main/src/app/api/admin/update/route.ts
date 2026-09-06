import { requireAdmin } from "@/lib/auth/guard";
import { readPendingRestore } from "@/lib/backup/restore";
import { handleAdminError, jsonData } from "@/lib/admin/http";
import { listUpdatePackages } from "@/lib/update/files";
import { readPendingUpdate, readUpdateState } from "@/lib/update/pending";
import { currentBackupRelease } from "@/lib/release";
import { readUpdateSidecar } from "@/lib/update/sidecar";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const [files, pendingUpdate, pendingRestore, lastApply] = await Promise.all([
      listUpdatePackages(),
      readPendingUpdate(),
      readPendingRestore(),
      readUpdateState(),
    ]);
    return jsonData({
      appRelease: currentBackupRelease(),
      pendingUpdate,
      restorePending: Boolean(pendingRestore),
      lastApply,
      files: await Promise.all(
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
      ),
    });
  } catch (error) {
    return handleAdminError(error, "读取更新列表失败");
  }
}
