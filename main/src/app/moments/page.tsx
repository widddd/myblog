import type { Metadata } from "next";
import { headers } from "next/headers";

import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { SiteShell } from "@/components/layout/SiteShell";
import { MomentList } from "@/components/moment/MomentList";
import { listApprovedComments } from "@/lib/comments/service";
import { listPublicMoments } from "@/lib/moments/query";
import { fingerprint, getClientIp } from "@/lib/utils/fingerprint";
import { publicMetadata } from "@/lib/seo/site";
import { parsePage } from "@/lib/utils/page";

export function generateMetadata(): Promise<Metadata> {
  return publicMetadata({
    title: "瞬间",
    description: "生活片段与九宫格照片。",
    path: "/moments",
  });
}

export const dynamic = "force-dynamic";

export default async function MomentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const headerList = await headers();
  const fp = fingerprint(
    getClientIp(headerList),
    headerList.get("user-agent") ?? "",
  );
  const listing = await listPublicMoments({
    page: parsePage(params.page),
    fingerprint: fp,
  });

  const commentLists =
    listing.data.length === 0
      ? []
      : await Promise.all(
          listing.data.map((moment) =>
            listApprovedComments({
              targetType: "moment",
              targetId: moment.id,
            }),
          ),
        );

  return (
    <SiteShell title="瞬间">
      {listing.data.length === 0 ? (
        <EmptyState
          title="还没有瞬间"
          description="到后台发布第一条瞬间。图片会按九宫格展示，卡片为瀑布流。"
        />
      ) : (
        <MomentList
          moments={listing.data.map((moment, index) => ({
            moment,
            comments: commentLists[index]?.data ?? [],
            commentTotal: commentLists[index]?.total ?? 0,
          }))}
        />
      )}
      <Pagination
        basePath="/moments"
        page={listing.page}
        pageSize={listing.pageSize}
        total={listing.total}
      />
    </SiteShell>
  );
}
