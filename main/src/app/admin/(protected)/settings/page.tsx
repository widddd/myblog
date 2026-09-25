import type { Metadata } from "next";

import { AccountForm } from "@/components/admin/AccountForm";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { getAdminAccount } from "@/lib/auth/account";
import { getSession, isAuthenticatedSession } from "@/lib/auth/session";
import { getAdminSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "站点设置",
};

export default async function AdminSettingsPage() {
  const session = await getSession();
  const settings = await getAdminSettings();
  const account = isAuthenticatedSession(session)
    ? await getAdminAccount(session.adminId)
    : null;

  return (
    <>
      <section className="admin-card">
        <h2>站点</h2>
        <SettingsForm initial={settings} />
      </section>
      {account ? (
        <section className="admin-card">
          <h2>登录账号</h2>
          <AccountForm
            currentPenName={account.penName}
            currentUsername={account.username}
          />
        </section>
      ) : null}
    </>
  );
}
