import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/LoginForm";
import { hasAdminUser } from "@/lib/auth/initial-setup";
import {
  getSession,
  isAuthenticatedSession,
} from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "管理员登录",
};

export default async function AdminLoginPage() {
  if (!(await hasAdminUser())) {
    redirect("/admin/setup");
  }

  const session = await getSession();

  if (isAuthenticatedSession(session)) {
    redirect("/admin");
  }

  return (
    <div className="auth-shell">
      <section className="auth-card heo-card">
        <h1>管理员登录</h1>
        <p className="auth-card__subtitle">登录后进入管理后台。</p>
        <LoginForm />
      </section>
    </div>
  );
}
