import Link from "next/link";

import { CoverMedia } from "@/components/common/CoverMedia";
import type { PostCardModel } from "@/lib/posts/types";

const CHIPS = [
  { label: "NX", color: "#4db8e8" },
  { label: "TS", color: "#5ba3d9" },
  { label: "MD", color: "#e38100" },
  { label: "SQL", color: "#57bd6a" },
  { label: "CSS", color: "#62c4ee" },
  { label: "UI", color: "#ff7c7c" },
  { label: "NX", color: "#4db8e8" },
  { label: "TS", color: "#5ba3d9" },
  { label: "MD", color: "#e38100" },
  { label: "SQL", color: "#57bd6a" },
  { label: "CSS", color: "#62c4ee" },
  { label: "UI", color: "#ff7c7c" },
];

type HomeDashboardProps = {
  posts: PostCardModel[];
};

export function HomeDashboard({ posts }: HomeDashboardProps) {
  return (
    <div className="home-dashboard">
      <section className="dash-welcome glass-card">
        <p>欢迎光临</p>
        <h2>
          记录思考
          <br />
          也记录生活
        </h2>
        <div className="dash-chips" aria-hidden="true">
          {CHIPS.map((chip, index) => (
            <div
              className="dash-chip"
              key={`${chip.label}-${index}`}
              style={{ background: chip.color }}
            >
              {chip.label}
            </div>
          ))}
        </div>
        <div className="dash-links">
          <Link className="dash-link dash-link--hot" href="/posts">
            文章
          </Link>
          <Link className="dash-link dash-link--life" href="/moments">
            瞬间
          </Link>
        </div>
      </section>
      <div className="dash-recommend">
        {posts.slice(0, 6).map((post) => (
          <Link className="mini-card" href={`/posts/${post.slug}`} key={post.slug}>
            {post.recommend ? <span className="mini-card__badge">荐</span> : null}
            <CoverMedia alt={post.title} src={post.cover} title={post.title} />
            <div className="mini-card__title">{post.title}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
