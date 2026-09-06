import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { Sidebar } from "@/components/layout/Sidebar";
import { SiteShell } from "@/components/layout/SiteShell";
import { postHref } from "@/lib/posts/path";
import { listArchivePosts } from "@/lib/posts/query";
import { publicMetadata } from "@/lib/seo/site";
import { formatArchiveMonth, formatPostDate } from "@/lib/utils/date";

export function generateMetadata(): Promise<Metadata> {
  return publicMetadata({
    title: "归档",
    description: "按月份浏览已发布文章。",
    path: "/archives",
  });
}

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
                <li key={post.publicId}>
                  <Link href={postHref(post)}>
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
