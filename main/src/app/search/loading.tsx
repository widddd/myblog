import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SiteShell } from "@/components/layout/SiteShell";

export default function SearchLoading() {
  return (
    <SiteShell title="搜索">
      <PageSkeleton rows={2} />
    </SiteShell>
  );
}
