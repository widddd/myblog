import Link from "next/link";

import {
  getSidebarStats,
  listCategories,
  listRecentPosts,
  listTags,
} from "@/lib/posts/query";
import { getPublicSettings } from "@/lib/settings";
import { formatPostDate } from "@/lib/utils/date";

import { CoverMedia } from "@/components/common/CoverMedia";
import { Toc } from "@/components/post/Toc";
import type { TocItem } from "@/lib/markdown/toc";

export async function Sidebar({ toc }: { toc?: TocItem[] }) {
  const [settings, stats, categories, tags, recent] = await Promise.all([
    getPublicSettings(),
    getSidebarStats(),
    listCategories(),
    listTags(),
    listRecentPosts(5),
  ]);

  return (
    <div className="sticky-stack">
      {settings.announcement ? (
        <section className="widget glass-card">
          <h2 className="widget__title">公告</h2>
          <p>{settings.announcement}</p>
        </section>
      ) : null}

      <section className="widget glass-card">
        <h2 className="widget__title">站点</h2>
        <div className="widget-stat">
          <div>
            <strong>{stats.postCount}</strong>
            <span>文章</span>
          </div>
          <div>
            <strong>{stats.categoryCount}</strong>
            <span>分类</span>
          </div>
          <div>
            <strong>{stats.tagCount}</strong>
            <span>标签</span>
          </div>
        </div>
      </section>

      {toc ? <Toc items={toc} /> : null}

      <section className="widget glass-card">
        <h2 className="widget__title">分类</h2>
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

      <section className="widget glass-card">
        <h2 className="widget__title">标签</h2>
        {tags.length === 0 ? (
          <p className="widget__empty">还没有标签。</p>
        ) : (
          <div className="tag-cloud">
            {tags.map((item) => (
              <Link key={item.slug} href={`/tags/${item.slug}`}>
                {item.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="widget glass-card">
        <h2 className="widget__title">最近发布</h2>
        {recent.length === 0 ? (
          <p className="widget__empty">还没有文章。</p>
        ) : (
          <div>
            {recent.map((post) => (
              <Link className="recent-item" href={`/posts/${post.slug}`} key={post.slug}>
                <CoverMedia alt={post.title} src={post.cover} title={post.title} />
                <div>
                  <div className="recent-item__title">{post.title}</div>
                  <time>{formatPostDate(post.publishedAt)}</time>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
