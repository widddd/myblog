import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "仪表盘",
};

export default async function AdminDashboardPage() {
  const [published, draft, scheduled, moments, pendingComments] =
    await Promise.all([
      prisma.post.count({ where: { status: "published" } }),
      prisma.post.count({ where: { status: "draft" } }),
      prisma.post.count({ where: { status: "scheduled" } }),
      prisma.moment.count(),
      prisma.comment.count({ where: { status: "pending" } }),
    ]);

  const cards = [
    {
      href: "/admin/posts?status=published",
      label: "已发布文章",
      value: published,
      hint: "前台可见",
    },
    {
      href: "/admin/posts?status=draft",
      label: "草稿",
      value: draft,
      hint: "未发布",
    },
    {
      href: "/admin/posts?status=scheduled",
      label: "定时",
      value: scheduled,
      hint: "到达时间后上线",
    },
    {
      href: "/admin/moments",
      label: "瞬间",
      value: moments,
      hint: "已发布瞬间",
    },
    {
      href: "/admin/comments?status=pending",
      label: "待审评论",
      value: pendingComments,
      hint: pendingComments > 0 ? "需要处理" : "没有积压",
    },
  ] as const;

  return (
    <section className="admin-dash">
      <div className="admin-dash__head">
        <div>
          <h2>仪表盘</h2>
          <p className="admin-muted">站点内容一眼看完，点卡片进入对应管理页。</p>
        </div>
        <Link className="heo-button" href="/admin/posts/new">
          写新文章
        </Link>
      </div>
      <ul className="admin-stats">
        {cards.map((card) => (
          <li key={card.href}>
            <Link className="admin-stat-card" href={card.href}>
              <span className="admin-stat-card__label">{card.label}</span>
              <strong className="admin-stat-card__value">{card.value}</strong>
              <span className="admin-stat-card__hint">{card.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
