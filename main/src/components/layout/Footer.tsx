import Link from "next/link";

import { ReleaseMark } from "@/components/common/ReleaseMark";
import { getPublicSettings } from "@/lib/settings";

export async function Footer() {
  const { siteName } = await getPublicSettings();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__left">
          <p className="site-footer__release">
            <ReleaseMark />
          </p>
          <p>
            © {new Date().getFullYear()} {siteName}
          </p>
        </div>
        <p>
          记录思考，也记录生活。
          <span> · </span>
          <Link href="/archives">归档</Link>
          <span> · </span>
          <Link href="/rss.xml">RSS</Link>
          <span> · </span>
          <Link href="/admin">管理后台</Link>
        </p>
      </div>
    </footer>
  );
}
