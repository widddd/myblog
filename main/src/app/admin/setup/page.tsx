import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetupForm } from "@/components/admin/SetupForm";
import { hasAdminUser } from "@/lib/auth/initial-setup";
import { hostSecretExists } from "@/lib/backup/host-secret";

export const metadata: Metadata = {
  title: "创建站点",
  robots: { index: false, follow: false },
};

export default async function AdminSetupPage() {
  const adminExists = await hasAdminUser();
  if (adminExists) {
    redirect("/admin/login");
  }

  const recovery = await hostSecretExists();
  return (
    <div className="auth-shell">
      <section className="auth-card admin-card">
        <h1>{recovery ? "重建管理员" : "创建站点"}</h1>
        <p className="auth-card__subtitle">
          {recovery
            ? "站点配置和备份口令会保留，只需重新设置管理员账号。"
            : "填写站点名称和管理员，即可开始使用。"}
        </p>
        <SetupForm recovery={recovery} />
      </section>
    </div>
  );
}
