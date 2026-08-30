import Link from "next/link";

import { getPublicSettings } from "@/lib/settings";

export async function Footer() {
  const { siteName } = await getPublicSettings();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p>
          © {new Date().getFullYear()} {siteName}
        </p>
        <p>
          记录思考，也记录生活。
          <span> · </span>
          <Link href="/archives">归档</Link>
          <span> · </span>
          <Link href="/admin">管理后台</Link>
        </p>
      </div>
    </footer>
  );
}
