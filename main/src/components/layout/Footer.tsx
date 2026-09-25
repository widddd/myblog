import Link from "next/link";

import { ReleaseMark } from "@/components/common/ReleaseMark";
import { UptimeModule } from "@/components/home/modules/UptimeModule";
import { getHomeLayout } from "@/lib/home/layout";
import { getPublicSettings } from "@/lib/settings";

export async function Footer({ showUptime = false }: { showUptime?: boolean }) {
  const [{ siteName, siteStartedAt }, homeItems] = await Promise.all([
    getPublicSettings(),
    showUptime ? getHomeLayout() : Promise.resolve([]),
  ]);
  const uptime = showUptime
    ? homeItems.find(({ module }) => module.builtinKey === "uptime")
    : undefined;

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
        {uptime ? (
          <UptimeModule
            heading={uptime.module.config.heading}
            startedAt={siteStartedAt}
            variant="footer"
          />
        ) : null}
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
