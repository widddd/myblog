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
    ] = await Promise.all([
      listBackupRecords(),
      getSetting<string | null>("lastBackupAt"),
      readPendingRestore(),
      listBackupKeyHashes(),
      hostSecretExists(),
      resolveBackupEncrypt(),
    ]);
    return jsonData({
      passphraseConfigured,
      encrypt,
      appRelease: currentBackupRelease(),
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
