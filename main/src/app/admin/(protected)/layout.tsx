import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AccountForm } from "@/components/admin/AccountForm";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { findAdminAccount } from "@/lib/auth/account";
import { hasAdminUser } from "@/lib/auth/initial-setup";
import { countPendingComments } from "@/lib/comments/service";
import {
  getAdminAccent,
  getDashboardCards,
} from "@/lib/settings";
import {
  getSession,
  isAuthenticatedSession,
} from "@/lib/auth/session";

import "@/editor/styles/globals.css";

export default async function AdminProtectedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  if (!(await hasAdminUser())) {
    redirect("/admin/setup");
  }

  const session = await getSession();

  if (!isAuthenticatedSession(session)) {
    redirect("/admin/login");
  }

  const account = await findAdminAccount(session.adminId);
  if (!account) {
    redirect("/admin/login");
  }

  // 外观面板在布局壳顶栏（任意后台页可换配色），所以这里把两个设置一并读出来下传。
  const [pendingComments, accent, cards] = await Promise.all([
    countPendingComments(),
    getAdminAccent(),
    getDashboardCards(),
  ]);

  if (account.mustChangeCredentials) {
    return (
      <AdminWorkspace
        credentialsOnly
        pendingComments={0}
        username={account.username}
      >
        <section className="admin-card">
          <h2>登录账号</h2>
          <AccountForm currentUsername={account.username} required />
        </section>
      </AdminWorkspace>
    );
  }

  return (
    <AdminWorkspace
      accent={accent}
      cards={cards}
      pendingComments={pendingComments}
      username={account.username}
    >
      {children}
    </AdminWorkspace>
  );
}
