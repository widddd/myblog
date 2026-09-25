import type { Metadata } from "next";
import { CameraIcon, ClockIcon, LightningBoltIcon } from "@radix-ui/react-icons";

import { DeleteButton } from "@/components/admin/DeleteButton";
import { MomentForm } from "@/components/admin/MomentForm";
import { listAdminMoments } from "@/lib/moments/admin";
import { parsePage } from "@/lib/utils/page";

export const metadata: Metadata = {
  title: "瞬间",
};

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminMomentsPage({ searchParams }: PageProps) {
  const page = parsePage((await searchParams).page);
  const result = await listAdminMoments(page, 20);

  return (
    <section className="admin-card">
      <div className="admin-section">
        <h2 className="admin-section__title">发布新瞬间</h2>
        <p className="admin-section__lead">记录此刻心情，分享生活中的美好瞬间</p>
        <MomentForm />
      </div>
      <div className="admin-section">
        <h2 className="admin-section__title">我的动态</h2>
        {result.data.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty__ico">
              <LightningBoltIcon width={24} height={24} />
            </span>
            <p>还没有发布任何瞬间</p>
            <p className="admin-muted">来发第一条动态，记录生活吧！</p>
          </div>
        ) : (
          <ul className="admin-moment-list">
            {result.data.map((moment, index) => (
              <li
                key={moment.id}
                className="admin-stagger"
                style={{ "--i": index } as React.CSSProperties}
              >
                <div className="admin-moment-content">
                  <p>{moment.content}</p>
                </div>
                <div className="admin-moment-meta">
                  <span className="admin-moment-time">
                    <ClockIcon />{" "}
                    {new Date(moment.createdAt).toLocaleString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {moment.images.length > 0 && (
                    <span className="admin-moment-badge">
                      <CameraIcon /> {moment.images.length} 张图片
                    </span>
                  )}
                </div>
                <DeleteButton
                  confirmText="确定删除这条瞬间？删除后无法恢复。"
                  label="删除"
                  url={`/api/admin/moments/${moment.id}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
