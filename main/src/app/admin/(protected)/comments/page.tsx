import type { Metadata } from "next";
import Link from "next/link";
import { ChatBubbleIcon } from "@radix-ui/react-icons";

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

/**
 * 评论状态的语义色档：
 * - pending → warn：demo 概览「待审评论」用的就是 badge--warn，含义同为「等人处理」
 * - approved → ok：已通过是终态里的正常态，与文章「已发布」同档
 * 其它值（如 rejected）不在列表筛选里出现，落到 muted 兜底，不猜颜色。
 */
const STATUS_TONE: Record<string, string> = {
  pending: "warn",
  approved: "ok",
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
    <section className="admin-card">
      <div className="admin-panel-head">
        <h2>评论列表</h2>
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
        <button className="admin-btn" type="submit">
          筛选
        </button>
      </form>
      <p className="admin-danger">删除评论后无法恢复，回复会一并删掉。</p>
      <AdminCommentCompose />
      {result.data.length === 0 ? (
        <div className="admin-empty">
          <span className="admin-empty__ico">
            <ChatBubbleIcon width={24} height={24} />
          </span>
          <p>没有符合条件的评论。</p>
        </div>
      ) : (
        <div className="admin-list admin-list--comments">
          <div className="admin-list__head">
            <span>内容</span>
            <span>对象</span>
            <span>状态</span>
            <span>时间</span>
            <span />
          </div>
          {result.data.map((comment, index) => (
            <article
              className="admin-list__row admin-stagger"
              key={comment.id}
              style={{ "--i": index } as React.CSSProperties}
            >
              <div className="admin-list__cell admin-list__cell--main" data-label="内容">
                <div>
                  <strong>{comment.nickname}</strong>
                  {comment.isAdmin ? " · 管理员" : ""}
                  {comment.parentId ? " · 回复" : ""}
                </div>
                <p className="admin-comment-content">{comment.content}</p>
                {comment.email ? (
                  <p className="admin-muted">{comment.email}</p>
                ) : null}
              </div>
              <div className="admin-list__cell" data-label="对象">
                {comment.targetLabel}
              </div>
              <div className="admin-list__cell" data-label="状态">
                <span
                  className={`admin-badge admin-badge--${STATUS_TONE[comment.status] ?? "muted"}`}
                >
                  <span className="admin-dot" />
                  {STATUS_LABEL[comment.status] ?? comment.status}
                </span>
              </div>
              <div className="admin-list__cell" data-label="时间">
                {new Date(comment.createdAt).toLocaleString("zh-CN")}
              </div>
              <div className="admin-list__actions">
                <CommentRowActions comment={comment} />
              </div>
            </article>
          ))}
        </div>
      )}
      {result.total > result.pageSize ? (
        <p className="admin-pager">
          {result.page > 1 ? (
            <Link
              href={`/admin/comments?page=${result.page - 1}&status=${params.status ?? "all"}&targetType=${params.targetType ?? "all"}`}
            >
              上一页
            </Link>
          ) : null}
          <span className="is-current">
            第 {result.page} 页 / 共 {Math.ceil(result.total / result.pageSize)} 页
          </span>
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
