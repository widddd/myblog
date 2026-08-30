import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
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

  const pendingComments = await countPendingComments();

  return (
    <AdminWorkspace
      pendingComments={pendingComments}
      username={session.username}
    >
      {children}
    </AdminWorkspace>
  );
}
