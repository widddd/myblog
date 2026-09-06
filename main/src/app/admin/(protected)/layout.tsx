import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AccountForm } from "@/components/admin/AccountForm";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { getAdminAccount } from "@/lib/auth/account";
import { countPendingComments } from "@/lib/comments/service";
import {
  getSession,
  isAuthenticatedSession,
} from "@/lib/auth/session";

import "@/editor/styles/globals.css";

export default async function AdminProtectedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await getSession();

  if (!isAuthenticatedSession(session)) {
    redirect("/admin/login");
  }

  const [pendingComments, account] = await Promise.all([
    countPendingComments(),
    getAdminAccount(session.adminId),
  ]);

  if (account.mustChangeCredentials) {
    return (
      <AdminWorkspace
        credentialsOnly
        pendingComments={0}
        username={account.username}
      >
        <section className="heo-card admin-panel">
          <h2>登录账号</h2>
          <AccountForm currentUsername={account.username} required />
        </section>
      </AdminWorkspace>
    );
  }

  return (
    <AdminWorkspace
      pendingComments={pendingComments}
      username={account.username}
    >
      {children}
    </AdminWorkspace>
  );
}
