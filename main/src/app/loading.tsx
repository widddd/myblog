import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SiteShell } from "@/components/layout/SiteShell";

export default function HomeLoading() {
  return (
    <SiteShell>
      <PageSkeleton rows={4} />
    </SiteShell>
  );
}
