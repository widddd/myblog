import {
  getSidebarStats,
  listCategories,
  listRecentPosts,
  listTags,
} from "@/lib/posts/query";
import { getPublicSettings } from "@/lib/settings";

import { PostSidebar } from "@/components/layout/PostSidebar";
import { Toc } from "@/components/post/Toc";
import { AnnouncementWidget } from "@/components/widgets/AnnouncementWidget";
import { CategoriesWidget } from "@/components/widgets/CategoriesWidget";
import { RecentPostsWidget } from "@/components/widgets/RecentPostsWidget";
import { SiteStatsWidget } from "@/components/widgets/SiteStatsWidget";
import { TagsWidget } from "@/components/widgets/TagsWidget";
import type { TocItem } from "@/lib/markdown/toc";

export async function Sidebar({
  reading = false,
  toc,
}: {
  reading?: boolean;
  toc?: TocItem[];
}) {
  const [settings, stats, categories, tags, recent] = await Promise.all([
    getPublicSettings(),
    getSidebarStats(),
    listCategories(),
    listTags(),
    listRecentPosts(5),
  ]);

  const extras = (
    <>
      <AnnouncementWidget body={settings.announcement} />
      <SiteStatsWidget stats={stats} />
      <CategoriesWidget categories={categories} />
      <TagsWidget tags={tags} />
      <RecentPostsWidget posts={recent} />
    </>
  );

  if (reading) {
    return <PostSidebar extras={extras} toc={toc ? <Toc items={toc} /> : null} />;
  }

  return (
    <div className="sticky-stack">
      <AnnouncementWidget body={settings.announcement} />
      <SiteStatsWidget stats={stats} />
      {toc ? <Toc items={toc} /> : null}
      <CategoriesWidget categories={categories} />
      <TagsWidget tags={tags} />
      <RecentPostsWidget posts={recent} />
    </div>
  );
}
