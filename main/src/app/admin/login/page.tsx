import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/LoginForm";
import { findAdminAccount } from "@/lib/auth/account";
import { hasAdminUser } from "@/lib/auth/initial-setup";
import { adminNextPath } from "@/lib/auth/next-path";
import {
  getSession,
  isAuthenticatedSession,
} from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "管理员登录",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  if (!(await hasAdminUser())) {
    redirect("/admin/setup");
  }

  const session = await getSession();

  if (
    isAuthenticatedSession(session) &&
    (await findAdminAccount(session.adminId))
  ) {
    redirect("/admin");
  }

  // 未登录访问后台时 proxy 会把原地址塞进 ?next=（校验见 lib/auth/next-path.ts）
  const next = adminNextPath((await searchParams).next);

  return (
    <div className="auth-shell">
      <section className="auth-card admin-card">
        <div className="auth-card__icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h1>欢迎回来</h1>
        <p className="auth-card__subtitle">登录你的博客管理后台，继续创作精彩内容。</p>
        <LoginForm next={next} />
      </section>
    </div>
  );
}
