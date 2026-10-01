import type { Metadata } from "next";

import { StaticPagesManager } from "@/components/admin/StaticPagesManager";
import { getStaticPagesDir, listStaticPages } from "@/lib/pages/admin";
import { RESERVED_SEGMENTS } from "@/lib/pages/directories";
import { formatDateTimeSeconds } from "@/lib/utils/date";

export const metadata: Metadata = {
  title: "静态页面",
};

export default async function AdminPagesPage() {
  const [dir, items] = await Promise.all([getStaticPagesDir(), listStaticPages()]);

  return (
    <>
      <StaticPagesManager
        dir={dir}
        reserved={RESERVED_SEGMENTS.map((entry) => ({
          segment: entry.segment,
          decision: entry.decision,
          reason: entry.reason,
        }))}
        rows={items.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          enabled: item.enabled,
          hasCode: item.hasCode,
          // 时间在服务端算好：组件渲染期禁止调 Date.now()/toLocaleString()（react-hooks/purity）
          updatedAtText: formatDateTimeSeconds(item.updatedAt),
        }))}
      />
    </>
  );
}
