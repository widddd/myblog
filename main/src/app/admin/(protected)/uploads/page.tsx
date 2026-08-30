import type { Metadata } from "next";

import { DeleteButton } from "@/components/admin/DeleteButton";
import { listAdminUploads } from "@/lib/uploads/admin";
import { parsePage } from "@/lib/utils/page";

export const metadata: Metadata = {
  title: "媒体库",
};

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminUploadsPage({ searchParams }: PageProps) {
  const page = parsePage((await searchParams).page);
  const result = await listAdminUploads(page, 24);

  return (
    <section className="heo-card admin-panel">
      <h2>媒体库</h2>
      {result.data.length === 0 ? (
        <p>还没有上传文件。</p>
      ) : (
        <ul className="admin-media-grid">
          {result.data.map((file) => (
            <li key={file.id}>
              {file.mime.startsWith("image/") && (file.thumb?.url || file.original.url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={file.hash.slice(0, 8)}
                  src={file.thumb?.url ?? file.original.url}
                />
              ) : (
                <p>{file.mime}</p>
              )}
              <p className="admin-muted">{Math.round(file.size / 1024)} KB</p>
              <DeleteButton
                confirmText="确定删除这个文件？被引用的文件会拒绝删除。"
                url={`/api/admin/uploads/${file.id}`}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
