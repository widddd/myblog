import type { Metadata } from "next";

import { AlbumManager } from "@/components/admin/AlbumManager";
import { listAdminAlbums } from "@/lib/albums/admin";

export const metadata: Metadata = {
  title: "相册",
};

export default async function AdminAlbumsPage() {
  const rows = await listAdminAlbums();

  return (
    <section className="admin-card">
      <h2>相册</h2>
      <AlbumManager rows={rows} />
    </section>
  );
}
