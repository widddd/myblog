import type { Metadata } from "next";
import type { ReactNode } from "react";

import { adminAccentStyle } from "@/lib/admin/accents";
import { getAdminAccent } from "@/lib/settings";

import "./admin.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // 配色由 server 注入首屏 HTML：零闪烁、零 JS（P-040 只禁 layout 里的 <script>）。
  // token 必须挂 :root —— 弹窗 portal 到 document.body，挂 .admin-workspace 会掉色（P-076）。
  const accent = await getAdminAccent();

  return (
    <div className="site-offset">
      <style>{adminAccentStyle(accent)}</style>
      {children}
    </div>
  );
}
