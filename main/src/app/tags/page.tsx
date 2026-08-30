import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { Sidebar } from "@/components/layout/Sidebar";
import { SiteShell } from "@/components/layout/SiteShell";
import { listTags } from "@/lib/posts/query";

export const metadata: Metadata = {
  title: "标签",
};

export default async function TagsPage() {
  const tags = await listTags();

  return (
    <SiteShell sidebar={<Sidebar />} title="标签">
      {tags.length === 0 ? (
        <EmptyState title="暂无标签" description="给文章打上标签后会出现在这里。" />
      ) : (
        <div className="tag-cloud glass-card" style={{ padding: 24 }}>
          {tags.map((item) => (
            <Link href={`/tags/${item.slug}`} key={item.slug}>
              {item.name} · {item.count}
            </Link>
          ))}
        </div>
      )}
    </SiteShell>
  );
}
