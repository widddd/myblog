import type { Metadata } from "next";

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
    <section className="heo-card admin-panel">
      <h2>瞬间</h2>
      <MomentForm />
      <ul className="admin-moment-list">
        {result.data.map((moment) => (
          <li key={moment.id}>
            <p>{moment.content}</p>
            <p className="admin-muted">
              {new Date(moment.createdAt).toLocaleString("zh-CN")} ·{" "}
              {moment.images.length} 张图
            </p>
            <DeleteButton
              confirmText="确定删除这条瞬间？"
              url={`/api/admin/moments/${moment.id}`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
