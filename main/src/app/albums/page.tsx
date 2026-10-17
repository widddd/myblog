import type { Metadata } from "next";

import { AlbumCard } from "@/components/album/AlbumCard";
import { EmptyState } from "@/components/common/EmptyState";
import { SiteShell } from "@/components/layout/SiteShell";
import { listPublicAlbums } from "@/lib/albums/query";
import { publicMetadata } from "@/lib/seo/site";

// 相册板块的样式（只在这两条路由上加载，见文件头的说明）
import "./albums.css";

export function generateMetadata(): Promise<Metadata> {
  return publicMetadata({
    title: "相册",
    description: "按主题整理的照片。",
    path: "/albums",
  });
}

export const dynamic = "force-dynamic";

/** 相册列表（版式定稿见 demo/album-page）：每行两张，封面是这本相册的一叠照片。 */
export default async function AlbumsPage() {
  const albums = await listPublicAlbums();
  const photos = albums.reduce((total, album) => total + album.count, 0);

  return (
    <SiteShell title="相册">
      <div className="album-page">
        {albums.length === 0 ? (
          <EmptyState
            title="还没有相册"
            description="到后台「相册」里建一个，再把媒体库里的照片归进去。"
          />
        ) : (
          <>
            <div className="album-toolbar">
              <span className="album-toolbar__count">
                共 {albums.length} 本 · {photos} 张
              </span>
            </div>
            <ul className="album-list">
              {albums.map((album) => (
                <AlbumCard album={album} key={album.slug} />
              ))}
            </ul>
          </>
        )}
      </div>
    </SiteShell>
  );
}
