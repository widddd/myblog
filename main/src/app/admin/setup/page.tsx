import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetupForm } from "@/components/admin/SetupForm";
import { hasAdminUser } from "@/lib/auth/initial-setup";

export const metadata: Metadata = {
  title: "创建站点",
  robots: { index: false, follow: false },
};

export default async function AdminSetupPage() {
  if (await hasAdminUser()) {
    redirect("/admin/login");
  }

  return (
    <div className="auth-shell">
      <section className="auth-card heo-card">
        <h1>创建站点</h1>
        <p className="auth-card__subtitle">填写站点名称和管理员，即可开始使用。</p>
        <SetupForm />
      </section>
    </div>
  );
}
