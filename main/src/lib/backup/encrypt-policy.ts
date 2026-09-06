import { hostSecretExists } from "@/lib/backup/host-secret";
import { BackupError } from "@/lib/backup/errors";
import {
  defaultEncryptEnabled,
  isHttpsEndpoint,
} from "@/lib/backup/encrypt-defaults";
import { getSetting, setSetting, settingIsStored } from "@/lib/settings";
import { loadCosSettings } from "@/lib/storage/cos-config";

export type BackupEncryptPolicy = {
  enabled: boolean;
  userSet: boolean;
  cosHttps: boolean;
};

export { defaultEncryptEnabled, isHttpsEndpoint };

export async function isCosBackupHttps(): Promise<boolean> {
  const cos = await loadCosSettings();
  if (!cos) {
    return false;
  }
  return isHttpsEndpoint(cos.publicBaseUrl);
}

export async function resolveBackupEncrypt(): Promise<BackupEncryptPolicy> {
  const cosHttps = await isCosBackupHttps();
  const userSet = await settingIsStored("backupEncrypt");
  if (userSet) {
    return {
      enabled: Boolean(await getSetting<boolean>("backupEncrypt")),
      userSet: true,
      cosHttps,
    };
  }
  return {
    enabled: defaultEncryptEnabled(cosHttps),
    userSet: false,
    cosHttps,
  };
}

export async function setBackupEncrypt(enabled: boolean): Promise<BackupEncryptPolicy> {
  if (enabled && !(await hostSecretExists())) {
    throw new BackupError(
      "HOST_SECRET_MISSING",
      "打开加密备份前请先设定备份口令",
      409,
    );
  }
  await setSetting("backupEncrypt", enabled);
  return resolveBackupEncrypt();
}
