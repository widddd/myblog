import { requireAdmin } from "@/lib/auth/guard";
import { isBackupRunning, listBackupRecords } from "@/lib/backup/backup";
import { keyFingerprint } from "@/lib/backup/crypto";
import { resolveBackupEncrypt } from "@/lib/backup/encrypt-policy";
import { hostSecretExists } from "@/lib/backup/host-secret";
import { readPendingRestore } from "@/lib/backup/restore";
import { listBackupKeyHashes } from "@/lib/backup/secrets";
import { handleAdminError, jsonData } from "@/lib/admin/http";
import { currentBackupRelease } from "@/lib/release";
import { getSetting } from "@/lib/settings";
import { loadCosSettings } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const [
      files,
      lastBackupAt,
      pendingRestore,
      hashes,
      passphraseConfigured,
      encrypt,
      cos,
    ] = await Promise.all([
      listBackupRecords(),
      getSetting<string | null>("lastBackupAt"),
      readPendingRestore(),
      listBackupKeyHashes(),
      hostSecretExists(),
      resolveBackupEncrypt(),
      loadCosSettings(),
    ]);
    return jsonData({
      passphraseConfigured,
      encrypt,
      appRelease: currentBackupRelease(),
      // 备份页据此决定要不要显示「上传到 COS」与「只留本机」的说明（P-145 的「配没配」口径）
      cosConfigured: Boolean(cos),
      files: files.map((file) => {
        const keyHash = hashes.get(file.name);
        return {
          ...file,
          keyFingerprint: keyHash ? keyFingerprint(keyHash) : null,
        };
      }),
      running: isBackupRunning(),
      lastBackupAt,
      pendingRestore,
    });
  } catch (error) {
    return handleAdminError(error, "读取备份列表失败");
  }
}
