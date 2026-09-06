import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SiteShell } from "@/components/layout/SiteShell";

export default function PostsLoading() {
  return (
    <SiteShell title="文章">
      <PageSkeleton />
    </SiteShell>
  );
}
