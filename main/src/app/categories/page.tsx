import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { Sidebar } from "@/components/layout/Sidebar";
import { SiteShell } from "@/components/layout/SiteShell";
import { listCategories } from "@/lib/posts/query";

export const metadata: Metadata = {
  title: "分类",
};

export default async function CategoriesPage() {
  const categories = await listCategories();

  return (
    <SiteShell sidebar={<Sidebar />} title="分类">
      {categories.length === 0 ? (
        <EmptyState title="暂无分类" description="发布文章并指定分类后会出现在这里。" />
      ) : (
        <div className="taxonomy-grid">
          {categories.map((item) => (
            <Link className="taxonomy-card glass-card" href={`/categories/${item.slug}`} key={item.slug}>
              <strong>{item.name}</strong>
              <span>{item.count}</span>
            </Link>
          ))}
        </div>
      )}
    </SiteShell>
  );
}
