import type { Metadata } from "next";
import Link from "next/link";

import { AdminCommentCompose } from "@/components/admin/AdminCommentCompose";
import { CommentRowActions } from "@/components/admin/CommentRowActions";
import { listAdminComments } from "@/lib/comments/service";
import { parsePage } from "@/lib/utils/page";

export const metadata: Metadata = {
  title: "评论审核",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待审",
  approved: "已通过",
};

type PageProps = {
  searchParams: Promise<{ page?: string; status?: string; targetType?: string }>;
};

export default async function AdminCommentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const result = await listAdminComments({
    page,
    pageSize: 20,
    status: params.status,
    targetType: params.targetType,
  });

  return (
    <section className="heo-card admin-panel">
      <div className="admin-panel-head">
        <h2>评论</h2>
      </div>
      <form className="admin-filter" method="get">
        <select defaultValue={params.status ?? "all"} name="status">
          <option value="all">全部状态</option>
          <option value="pending">待审</option>
          <option value="approved">已通过</option>
        </select>
        <select defaultValue={params.targetType ?? "all"} name="targetType">
          <option value="all">全部对象</option>
          <option value="post">文章</option>
          <option value="moment">瞬间</option>
          <option value="board">留言板</option>
        </select>
        <button className="heo-button" type="submit">
          筛选
        </button>
      </form>
      <AdminCommentCompose />
      {result.data.length === 0 ? (
        <p>没有符合条件的评论。</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>内容</th>
              <th>对象</th>
              <th>状态</th>
              <th>时间</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {result.data.map((comment) => (
              <tr key={comment.id}>
                <td>
                  <div>
                    <strong>{comment.nickname}</strong>
                    {comment.isAdmin ? " · 管理员" : ""}
                    {comment.parentId ? " · 回复" : ""}
                  </div>
                  <p className="admin-comment-content">{comment.content}</p>
                  {comment.email ? (
                    <p className="admin-muted">{comment.email}</p>
                  ) : null}
                </td>
                <td>{comment.targetLabel}</td>
                <td>{STATUS_LABEL[comment.status] ?? comment.status}</td>
                <td>{new Date(comment.createdAt).toLocaleString("zh-CN")}</td>
                <td>
                  <CommentRowActions comment={comment} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result.total > result.pageSize ? (
        <p className="admin-pager">
          {result.page > 1 ? (
            <Link
              href={`/admin/comments?page=${result.page - 1}&status=${params.status ?? "all"}&targetType=${params.targetType ?? "all"}`}
            >
              上一页
            </Link>
          ) : null}{" "}
          第 {result.page} 页 / 共 {Math.ceil(result.total / result.pageSize)} 页{" "}
          {result.page * result.pageSize < result.total ? (
            <Link
              href={`/admin/comments?page=${result.page + 1}&status=${params.status ?? "all"}&targetType=${params.targetType ?? "all"}`}
            >
              下一页
            </Link>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
