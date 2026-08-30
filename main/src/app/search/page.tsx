import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { SiteShell } from "@/components/layout/SiteShell";
import { searchPosts } from "@/lib/search/service";
import { formatPostDate } from "@/lib/utils/date";
import { parsePage } from "@/lib/utils/page";

export const metadata: Metadata = {
  title: "搜索",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const keyword = params.q?.trim() ?? "";
  const page = parsePage(params.page);
  const result = keyword
    ? await searchPosts(keyword, page)
    : { data: [], total: 0, page: 1, pageSize: 10 };

  return (
    <SiteShell title="搜索">
      <section className="search-panel glass-card">
        <form action="/search" method="get">
          <input
            defaultValue={keyword}
            maxLength={80}
            name="q"
            placeholder="搜索文章标题与正文"
            type="search"
          />
          <button className="heo-button" type="submit">
            搜索
          </button>
        </form>
        {keyword && result.data.length === 0 ? (
          <EmptyState
            title={`没有与「${keyword}」匹配的文章`}
            description="试试更短的关键词。密码文章只按标题匹配，正文不会出现在结果里。"
          />
        ) : null}
        {result.data.length > 0 ? (
          <ul className="search-results">
            {result.data.map((hit) => (
              <li key={hit.slug}>
                <Link href={`/posts/${hit.slug}`}>
                  <span className="search-results__title">
                    {hit.title}
                    {hit.locked ? (
                      <span className="chip chip--locked">密码</span>
                    ) : null}
                  </span>
                  {hit.excerpt ? <p>{hit.excerpt}</p> : null}
                  <time>{formatPostDate(hit.publishedAt)}</time>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {!keyword ? (
          <p className="widget__pending">输入关键词后回车，或按 ⌘K / Ctrl+K 打开搜索。</p>
        ) : null}
        <Pagination
          basePath={keyword ? `/search?q=${encodeURIComponent(keyword)}` : "/search"}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
        />
      </section>
    </SiteShell>
  );
}
