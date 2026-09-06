import Link from "next/link";

import type { TaxonomyItem } from "@/lib/posts/types";

export function TagsWidget({
  heading = "标签",
  tags,
}: {
  heading?: string;
  tags: TaxonomyItem[];
}) {
  return (
    <section className="widget glass-card">
      <h2 className="widget__title">{heading}</h2>
      {tags.length === 0 ? (
        <p className="widget__empty">还没有标签。</p>
      ) : (
        <div className="tag-cloud">
          {tags.map((item) => (
            <Link href={`/tags/${item.slug}`} key={item.slug}>
              {item.name}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
