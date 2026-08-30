import type { Metadata } from "next";

import { SettingsForm } from "@/components/admin/SettingsForm";
import { DEFAULT_SETTINGS, getSetting, type SettingKey } from "@/lib/settings";

export const metadata: Metadata = {
  title: "站点设置",
};

async function readSettings() {
  const keys = Object.keys(DEFAULT_SETTINGS) as SettingKey[];
  const entries = await Promise.all(
    keys.map(async (key) => [key, await getSetting(key)] as const),
  );
  return Object.fromEntries(entries) as {
    siteName: string;
    announcement: string;
    banner: string;
    pageSize: number;
    backupPeriodDays: number;
    backupKeep: number;
    uploadMaxSizeMB: number;
    lastBackupAt: string | null;
  };
}

export default async function AdminSettingsPage() {
  const settings = await readSettings();

  return (
    <section className="heo-card admin-panel">
      <h2>站点设置</h2>
      <SettingsForm initial={settings} />
    </section>
  );
}
