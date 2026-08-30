import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { Sidebar } from "@/components/layout/Sidebar";
import { SiteShell } from "@/components/layout/SiteShell";
import { listArchivePosts } from "@/lib/posts/query";
import { formatArchiveMonth, formatPostDate } from "@/lib/utils/date";

export const metadata: Metadata = {
  title: "归档",
};

export default async function ArchivesPage() {
  const posts = await listArchivePosts();
  const groups = new Map<string, typeof posts>();

  for (const post of posts) {
    const key = post.publishedAt
      ? formatArchiveMonth(post.publishedAt)
      : "未注明日期";
    const list = groups.get(key) ?? [];
    list.push(post);
    groups.set(key, list);
  }

  return (
    <SiteShell sidebar={<Sidebar />} title="归档">
      {posts.length === 0 ? (
        <EmptyState title="还没有可归档的文章" description="发布文章后会按月份出现在这里。" />
      ) : (
        Array.from(groups.entries()).map(([month, items]) => (
          <section className="archive-group glass-card" key={month} style={{ padding: 20 }}>
            <h2>
              {month}
              <span className="count"> · {items.length}</span>
            </h2>
            <ul>
              {items.map((post) => (
                <li key={post.slug}>
                  <Link href={`/posts/${post.slug}`}>
                    {post.locked ? `🔒 ${post.title}` : post.title}
                  </Link>
                  <time>{formatPostDate(post.publishedAt)}</time>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </SiteShell>
  );
}
