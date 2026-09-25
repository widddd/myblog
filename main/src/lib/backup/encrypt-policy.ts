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
  await setSetting("backupEncrypt", enabled);
  return resolveBackupEncrypt();
}
