import type { Metadata } from "next";

import { Pagination } from "@/components/common/Pagination";
import { UploadCard } from "@/components/admin/UploadCard";
import { UploadsToolbar } from "@/components/admin/UploadsToolbar";
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
    <section className="admin-card">
      <h2>媒体库</h2>
      <p className="admin-danger">
        默认删除会同时清掉本机原图、一级/二级缩略图和 COS。也可以只删本地、保留云端。若文章或瞬间还在用，删除前会警告。
      </p>
      <UploadsToolbar />
      {result.data.length === 0 ? (
        <p>还没有上传文件。用上面的按钮上传图片、视频或音频。</p>
      ) : (
        <ul className="admin-media-grid">
          {result.data.map((file, index) => (
            <UploadCard file={file} index={index} key={file.id} />
          ))}
        </ul>
      )}
      <Pagination
        basePath="/admin/uploads"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </section>
  );
}
