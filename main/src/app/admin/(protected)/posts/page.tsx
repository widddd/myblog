import type { Metadata } from "next";
import Link from "next/link";
import { FileTextIcon, Pencil2Icon } from "@radix-ui/react-icons";

import { PostListRows } from "@/components/admin/PostListRows";
import { buildAdminPostRows } from "@/lib/admin/post-rows";
import { listAdminPosts } from "@/lib/posts/admin";
import { parsePage } from "@/lib/utils/page";

export const metadata: Metadata = {
  title: "文章管理",
};

type PageProps = {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
};

export default async function AdminPostsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const result = await listAdminPosts({
    page,
    pageSize: 20,
    status: params.status,
    q: params.q?.trim() || undefined,
  });
  // 「更新」列与「查看」是否可用都在服务端算好（见 lib/admin/post-rows.ts），
  // 页面本身不碰 Date.now()，client 里也不用再算一遍
  const rows = buildAdminPostRows(result.data);

  return (
    <section className="admin-card">
      <div className="admin-panel-head">
        <h2>文章列表</h2>
        <Link className="admin-btn admin-desktop-only" href="/admin/posts/new">
          写文章
        </Link>
      </div>
      <form className="admin-filter" method="get">
        <input defaultValue={params.q ?? ""} name="q" placeholder="搜索标题/slug" />
        <select defaultValue={params.status ?? "all"} name="status">
          <option value="all">全部状态</option>
          <option value="draft">草稿</option>
          <option value="scheduled">定时</option>
          <option value="published">已发布</option>
        </select>
        <button className="admin-btn" type="submit">
          筛选
        </button>
      </form>
      <p className="admin-danger">删除文章后无法恢复。</p>
      {result.data.length === 0 ? (
        <div className="admin-empty">
          <span className="admin-empty__ico">
            <FileTextIcon width={24} height={24} />
          </span>
          <p>还没有文章。</p>
        </div>
      ) : (
        <div className="admin-list admin-list--posts">
          <PostListRows rows={rows} />
        </div>
      )}
      {result.total > result.pageSize ? (
        <p className="admin-pager">
          {result.page > 1 ? (
            <Link href={`/admin/posts?page=${result.page - 1}`}>上一页</Link>
          ) : null}
          <span className="is-current">
            第 {result.page} 页 / 共 {Math.ceil(result.total / result.pageSize)} 页
          </span>
          {result.page * result.pageSize < result.total ? (
            <Link href={`/admin/posts?page=${result.page + 1}`}>下一页</Link>
          ) : null}
        </p>
      ) : null}
      <Link className="admin-btn admin-fab" href="/admin/posts/new">
        <Pencil2Icon />
        写文章
      </Link>
    </section>
  );
}
