import Link from "next/link";

import type { TaxonomyItem } from "@/lib/posts/types";

export function CategoriesWidget({
  heading = "分类",
  categories,
}: {
  heading?: string;
  categories: TaxonomyItem[];
}) {
  return (
    <section className="widget glass-card">
      <h2 className="widget__title">{heading}</h2>
      {categories.length === 0 ? (
        <p className="widget__empty">还没有分类。</p>
      ) : (
        <ul className="widget-list">
          {categories.map((item) => (
            <li key={item.slug}>
              <Link href={`/categories/${item.slug}`}>
                <span>{item.name}</span>
                <span className="count">{item.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
