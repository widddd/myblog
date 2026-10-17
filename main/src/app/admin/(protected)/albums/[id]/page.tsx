import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AlbumEditor } from "@/components/admin/AlbumEditor";
import { getAdminAlbum, listAlbumVolumes } from "@/lib/albums/admin";

export const metadata: Metadata = {
  title: "相册",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminAlbumPage({ params }: PageProps) {
  const { id } = await params;
  const albumId = Number.parseInt(id, 10);
  if (!Number.isInteger(albumId) || albumId < 1) {
    notFound();
  }

  const [data, volumes] = await Promise.all([
    getAdminAlbum(albumId),
    listAlbumVolumes(albumId),
  ]);
  if (!data) {
    notFound();
  }

  return (
    <section className="admin-card">
      <h2>{data.album.title}</h2>
      <p className="admin-muted">
        {data.album.count} 张照片 · {volumes.length} 卷 · 卷是相册内部的分组，
        只影响对外相册页的分段展示
      </p>
      <AlbumEditor
        album={data.album}
        images={data.images}
        imagesTruncated={data.imagesTruncated}
        volumes={volumes}
      />
    </section>
  );
}
