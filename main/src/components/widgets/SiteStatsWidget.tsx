export type SiteStats = {
  postCount: number;
  categoryCount: number;
  tagCount: number;
};

export function SiteStatsWidget({
  heading = "站点",
  stats,
}: {
  heading?: string;
  stats: SiteStats;
}) {
  return (
    <section className="widget glass-card">
      <h2 className="widget__title">{heading}</h2>
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
  );
}
