import type { Metadata } from "next";
import Link from "next/link";

import { AdminSection } from "@/components/admin/AdminSection";
import { MomentAdminList } from "@/components/admin/MomentAdminList";
import { MomentCompose } from "@/components/admin/MomentCompose";
import { listAdminMoments } from "@/lib/moments/admin";
import { buildAdminMomentListItems } from "@/lib/moments/admin-list-view";
import { loadMomentComposeData } from "@/lib/moments/compose-data";
import { parsePage } from "@/lib/utils/page";

export const metadata: Metadata = {
  title: "瞬间",
};

/** 「瞬间管理」每页条数 */
const MOMENTS_PAGE_SIZE = 10;

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminMomentsPage({ searchParams }: PageProps) {
  const page = parsePage((await searchParams).page);
  // 时间只在服务端取一次：抽屉里的预览、列表的到期时刻与「还剩多久」都以它为准。
  const now = new Date();
  const [compose, list] = await Promise.all([
    loadMomentComposeData(now),
    listAdminMoments(page, MOMENTS_PAGE_SIZE, now),
  ]);
  const items = buildAdminMomentListItems(list.data);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <section className="admin-card">
      {/* 发布区：只有输入框 + 插入图片图标按钮 + 可见范围；其它设置全在右侧抽屉里 */}
      <div className="admin-section">
        <MomentCompose
          globalDays={compose.globalDays}
          groups={compose.groups}
          maxImages={compose.maxImages}
          settingsData={compose.settingsData}
        />
      </div>

      {/* 管理区：默认折叠，点开才是列表（逐条改可见范围 / 删除）。
          翻页后（page > 1）自动展开——否则在折叠状态下点「下一页」会看起来没反应。 */}
      <AdminSection
        defaultOpen={page > 1}
        hint={list.total > 0 ? `共 ${list.total} 条` : "还没有瞬间"}
        title="瞬间管理"
      >
        <MomentAdminList
          globalDays={compose.globalDays}
          groups={compose.groups}
          moments={items}
          nowMs={compose.nowMs}
        />
        {list.total > list.pageSize ? (
          <p className="admin-pager">
            {page > 1 ? (
              <Link href={`/admin/moments?page=${page - 1}`}>上一页</Link>
            ) : null}
            <span className="is-current">
              第 {page} 页 / 共 {totalPages} 页
            </span>
            {page < totalPages ? (
              <Link href={`/admin/moments?page=${page + 1}`}>下一页</Link>
            ) : null}
          </p>
        ) : null}
      </AdminSection>
    </section>
  );
}
