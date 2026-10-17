import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AlbumDetail } from "@/components/album/AlbumDetail";
import { EmptyState } from "@/components/common/EmptyState";
import { Lightbox } from "@/components/common/Lightbox";
import { SiteShell } from "@/components/layout/SiteShell";
import { albumHref } from "@/lib/albums/path";
import { getPublicAlbum } from "@/lib/albums/query";
import { publicMetadata } from "@/lib/seo/site";

// 相册板块的样式（与列表页同一份，Next 按模块去重）
import "../albums.css";

type AlbumPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: AlbumPageProps): Promise<Metadata> {
  const { slug } = await params;
  const album = await getPublicAlbum(slug);
  if (!album) {
    return { title: "未找到相册", robots: { index: false, follow: false } };
  }
  return publicMetadata({
    title: album.title,
    description: album.description || `${album.count} 张照片。`,
    path: albumHref(album.slug),
  });
}

export const dynamic = "force-dynamic";

/**
 * 相册详情：按"卷"展示，每一卷一叠照片（可展开）。
 *
 * `Lightbox` **不传 openSrc = 自管理模式**：它自己接管点击、先用 `data-lightbox-thumb`
 * （一级缩略图）顶上，真正打开时才加载 `data-lightbox-src`（原图）。
 * 所以本页默认展示阶段**一个原图请求都不会发**。
 */
export default async function AlbumPage({ params }: AlbumPageProps) {
  const { slug } = await params;
  const album = await getPublicAlbum(slug);

  if (!album) {
    notFound();
  }

  return (
    <SiteShell title={album.title}>
      <Lightbox>
        <div className="album-page">
          {album.total === 0 ? (
            <EmptyState
              title="这个相册还没有照片"
              description="到后台媒体库里把照片归入这个相册。"
            />
          ) : (
            <AlbumDetail album={album} />
          )}
        </div>
      </Lightbox>
    </SiteShell>
  );
}
