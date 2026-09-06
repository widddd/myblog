import type { Metadata } from "next";
import Link from "next/link";

import { DeleteButton } from "@/components/admin/DeleteButton";
import { listAdminPosts } from "@/lib/posts/admin";
import { parsePage } from "@/lib/utils/page";

export const metadata: Metadata = {
  title: "文章管理",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  scheduled: "定时",
  published: "已发布",
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

  return (
    <section className="heo-card admin-panel">
      <div className="admin-panel-head">
        <h2>文章列表</h2>
        <Link className="heo-button" href="/admin/posts/new">
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
        <button className="heo-button" type="submit">
          筛选
        </button>
      </form>
      <p className="admin-danger">删除文章后无法恢复。</p>
      {result.data.length === 0 ? (
        <p>还没有文章。</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>状态</th>
              <th>更新</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {result.data.map((post) => (
              <tr key={post.id}>
                <td>
                  {post.pinned ? "📌 " : ""}
                  {post.recommend ? "荐 " : ""}
                  {post.title}
                  {post.hasPassword ? " 🔒" : ""}
                </td>
                <td>{STATUS_LABEL[post.status] ?? post.status}</td>
                <td>{new Date(post.updatedAt ?? "").toLocaleString("zh-CN")}</td>
                <td className="admin-table-actions">
                  <Link href={`/admin/posts/${post.id}/edit`}>编辑</Link>
                  <DeleteButton
                    confirmText={`确定删除「${post.title}」？删除后无法恢复。`}
                    url={`/api/admin/posts/${post.id}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result.total > result.pageSize ? (
        <p className="admin-pager">
          {result.page > 1 ? (
            <Link href={`/admin/posts?page=${result.page - 1}`}>上一页</Link>
          ) : null}{" "}
          第 {result.page} 页 / 共 {Math.ceil(result.total / result.pageSize)} 页{" "}
          {result.page * result.pageSize < result.total ? (
            <Link href={`/admin/posts?page=${result.page + 1}`}>下一页</Link>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
