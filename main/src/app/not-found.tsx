import Link from "next/link";

export default function NotFound() {
  return (
    <div className="site-offset">
      <div className="site-main">
        <section className="empty-state glass-card">
          <h2>这一页走丢了</h2>
          <p>链接可能已失效，或文章仍是草稿 / 未到定时发布时间。</p>
          <p style={{ marginTop: 18 }}>
            <Link className="heo-button" href="/">
              回到首页
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
