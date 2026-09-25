import type { Metadata } from "next";
import Link from "next/link";
import {
  ArchiveIcon,
  ChatBubbleIcon,
  EyeOpenIcon,
  FileTextIcon,
  ImageIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

import { DashboardView } from "@/components/admin/DashboardView";
import { prisma } from "@/lib/db";
import { APP_RELEASE_LABEL } from "@/lib/release";
import { getDashboardCards, getSetting } from "@/lib/settings";

export const metadata: Metadata = {
  title: "仪表盘",
};

/**
 * 最近文章的状态色档，与 /admin/posts 列表同一套：
 * 已发布 → ok、草稿 → warn、定时 → info，未知 → muted。
 */
const POST_STATUS_LABEL: Record<string, string> = {
  published: "已发布",
  draft: "草稿",
  scheduled: "定时",
};

const POST_STATUS_TONE: Record<string, string> = {
  published: "ok",
  draft: "warn",
  scheduled: "info",
};

/** 1024 进制，避免站点体积数字在不同环境下口径不一致 */
function formatSize(bytes: number): string {
  if (bytes <= 0) {
    return "0 MB";
  }
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function relativeTime(value: Date | null): string {
  if (!value) {
    return "尚未备份";
  }
  const diff = Date.now() - value.getTime();
  const hour = 60 * 60 * 1000;
  if (diff < hour) {
    return "1 小时内";
  }
  if (diff < 24 * hour) {
    return `${Math.round(diff / hour)} 小时前`;
  }
  return `${Math.round(diff / (24 * hour))} 天前`;
}

export default async function AdminDashboardPage() {
  const [
    postTotal,
    published,
    draft,
    scheduled,
    commentTotal,
    pendingComments,
    viewAgg,
    topPosts,
    mediaAgg,
    recentPosts,
    cards,
    lastBackupAt,
    backupPeriodDays,
    backupKeep,
    cosBucket,
    cosRegion,
  ] = await Promise.all([
    prisma.post.count(),
    prisma.post.count({ where: { status: "published" } }),
    prisma.post.count({ where: { status: "draft" } }),
    prisma.post.count({ where: { status: "scheduled" } }),
    prisma.comment.count(),
    prisma.comment.count({ where: { status: "pending" } }),
    // 累计阅读：值由 /api/posts/[slug]/view 逐次累加，这里只做单表聚合
    prisma.post.aggregate({ _sum: { views: true } }),
    prisma.post.findMany({
      orderBy: { views: "desc" },
      select: { id: true, title: true, views: true, status: true },
      take: 5,
      where: { status: "published" },
    }),
    // 媒体体积走数据库聚合，**不扫盘**（项目既有约定：打开设置页也不自动扫盘）
    prisma.upload.aggregate({ _count: true, _sum: { size: true } }),
    prisma.post.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        views: true,
      },
      take: 4,
    }),
    getDashboardCards(),
    getSetting<string | null>("lastBackupAt"),
    getSetting<number>("backupPeriodDays"),
    getSetting<number>("backupKeep"),
    getSetting<string>("cosBucket"),
    getSetting<string>("cosRegion"),
  ]);

  const totalViews = viewAgg._sum.views ?? 0;
  const mediaCount = mediaAgg._count;
  const mediaSize = mediaAgg._sum.size ?? 0;
  const backupDate = lastBackupAt ? new Date(lastBackupAt) : null;
  const backupLabel =
    backupDate && !Number.isNaN(backupDate.getTime())
      ? relativeTime(backupDate)
      : "尚未备份";

  const slots = {
    kpiPosts: (
      <Link className="admin-card admin-stat-card" href="/admin/posts">
        <span className="admin-stat-card__head">
          <span className="admin-stat-card__icon">
            <FileTextIcon width={15} height={15} />
          </span>
          <span className="admin-stat-card__label">文章</span>
        </span>
        <strong className="admin-stat-card__value">{postTotal}</strong>
        <span className="admin-stat-card__hint">
          已发布 {published} · 草稿 {draft} · 定时 {scheduled}
        </span>
      </Link>
    ),
    kpiComments: (
      <Link className="admin-card admin-stat-card" href="/admin/comments">
        <span className="admin-stat-card__head">
          {/* 有待审 → 暖色提示需要人工处理；无待审 → 蓝色（互动类指标） */}
          <span
            className={
              pendingComments > 0
                ? "admin-stat-card__icon admin-stat-card__icon--warn"
                : "admin-stat-card__icon admin-stat-card__icon--info"
            }
          >
            <ChatBubbleIcon width={15} height={15} />
          </span>
          <span className="admin-stat-card__label">评论</span>
        </span>
        <strong className="admin-stat-card__value">{commentTotal}</strong>
        <span className="admin-stat-card__hint">
          {pendingComments > 0 ? `待审 ${pendingComments}` : "暂无待审"}
        </span>
      </Link>
    ),
    kpiViews: (
      <div className="admin-card admin-stat-card">
        <span className="admin-stat-card__head">
          {/* 累计类正向指标 → 绿色 */}
          <span className="admin-stat-card__icon admin-stat-card__icon--ok">
            <EyeOpenIcon width={15} height={15} />
          </span>
          <span className="admin-stat-card__label">累计阅读</span>
        </span>
        <strong className="admin-stat-card__value">{totalViews}</strong>
        <span className="admin-stat-card__hint">文章浏览计数合计</span>
      </div>
    ),
    kpiMedia: (
      <Link className="admin-card admin-stat-card" href="/admin/uploads">
        <span className="admin-stat-card__head">
          {/* 容量占用 → 暖色（与 demo 的 .kpi__ico--warn 同档） */}
          <span className="admin-stat-card__icon admin-stat-card__icon--warn">
            <ImageIcon width={15} height={15} />
          </span>
          <span className="admin-stat-card__label">媒体文件</span>
        </span>
        <strong className="admin-stat-card__value">{mediaCount}</strong>
        <span className="admin-stat-card__hint">
          {formatSize(mediaSize)} · 按上传记录统计
        </span>
      </Link>
    ),
    rankViews: (
      <article className="admin-card">
        <div className="admin-section">
          <h2 className="admin-section__title">阅读量最高</h2>
          <p className="admin-section__lead">Top 5 · 取文章浏览计数，不依赖埋点</p>
        </div>
        {topPosts.length === 0 ? (
          <p className="admin-muted">还没有已发布的文章。</p>
        ) : (
          <ul className="admin-ranks">
            {topPosts.map((post) => {
              const peak = topPosts[0]?.views || 1;
              return (
                <li className="admin-rank" key={post.id}>
                  <span className="admin-rank__name">{post.title}</span>
                  <span className="admin-rank__value">{post.views}</span>
                  <span className="admin-rank__bar">
                    <i style={{ width: `${Math.round((post.views / peak) * 100)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    ),
    systemStatus: (
      <article className="admin-card">
        <div className="admin-section">
          <h2 className="admin-section__title">系统状态</h2>
          <p className="admin-section__lead">备份、存储与版本</p>
        </div>
        <div className="admin-status-list">
          <div className="admin-status-row">
            <span className="admin-status-row__icon">
              <ArchiveIcon width={15} height={15} />
            </span>
            <div>
              <p className="admin-status-row__title">
                自动备份{" "}
                {/* 有备份记录 = 正常运行 → ok（demo 这一行是 badge--ok + 圆点）；
                    没备份过 = 需要站长处理 → warn；都不是「未设置」 */}
                <span
                  className={
                    backupDate
                      ? "admin-badge admin-badge--ok"
                      : "admin-badge admin-badge--warn"
                  }
                >
                  {backupDate ? <span className="admin-dot" /> : null}
                  {backupDate ? "正常" : "未备份"}
                </span>
              </p>
              <p className="admin-status-row__meta">
                每 {backupPeriodDays} 天一次 · 保留 {backupKeep} 份 · {backupLabel}
              </p>
            </div>
          </div>
          <div className="admin-status-row">
            <span className="admin-status-row__icon">
              <ReloadIcon width={15} height={15} />
            </span>
            <div>
              <p className="admin-status-row__title">
                对象存储{" "}
                {/* 已配置 = 可选能力已开启 → info；未配置 = 中性的「没设置」→ muted */}
                <span
                  className={
                    cosBucket
                      ? "admin-badge admin-badge--info"
                      : "admin-badge admin-badge--muted"
                  }
                >
                  {cosBucket ? "已配置" : "未配置"}
                </span>
              </p>
              <p className="admin-status-row__meta">
                {cosBucket ? `${cosRegion || "默认地域"} · 连通性在设置页点测` : "在设置页填写凭证"}
              </p>
            </div>
          </div>
          <div className="admin-status-row">
            <span className="admin-status-row__icon">
              <ReloadIcon width={15} height={15} />
            </span>
            <div>
              <p className="admin-status-row__title">程序版本</p>
              <p className="admin-status-row__meta">{APP_RELEASE_LABEL}</p>
            </div>
          </div>
          <div className="admin-status-row">
            <span className="admin-status-row__icon">
              <ChatBubbleIcon width={15} height={15} />
            </span>
            <div>
              <p className="admin-status-row__title">
                待审评论{" "}
                {/* demo 的「待审评论」就是 badge--warn + 数量 */}
                {pendingComments > 0 ? (
                  <span className="admin-badge admin-badge--warn">{pendingComments}</span>
                ) : null}
              </p>
              <p className="admin-status-row__meta">
                {pendingComments > 0 ? `${pendingComments} 条等待处理` : "全部处理完毕"}
              </p>
            </div>
          </div>
        </div>
      </article>
    ),
    recentPosts: (
      <article className="admin-card">
        <div className="admin-section">
          <h2 className="admin-section__title">最近文章</h2>
          <Link className="admin-btn admin-btn--ghost admin-btn--sm" href="/admin/posts">
            查看全部
          </Link>
        </div>
        {recentPosts.length === 0 ? (
          <p className="admin-muted">还没有文章，去写第一篇吧。</p>
        ) : (
          <ul className="admin-list">
            {recentPosts.map((post) => (
              <li className="admin-list__row" key={post.id}>
                <Link
                  className="admin-list__cell admin-list__cell--main"
                  href={`/admin/posts/${post.id}/edit`}
                >
                  {post.title}
                </Link>
                <span
                  className={`admin-badge admin-badge--${POST_STATUS_TONE[post.status] ?? "muted"}`}
                >
                  <span className="admin-dot" />
                  {POST_STATUS_LABEL[post.status] ?? post.status}
                </span>
                <span className="admin-list__cell">浏览 {post.views}</span>
              </li>
            ))}
          </ul>
        )}
      </article>
    ),
  };

  return (
    // key 随 cards 变化：服务端读到新值后重建本组件，state 自动跟上（无需 effect 同步）
    <DashboardView
      cards={cards}
      key={JSON.stringify(cards)}
      slots={slots}
    />
  );
}
