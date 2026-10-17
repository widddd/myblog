import type { Metadata } from "next";
import { headers } from "next/headers";

import { Pagination } from "@/components/common/Pagination";
import { UploadCard } from "@/components/admin/UploadCard";
import { UploadsAlbumFilter } from "@/components/admin/UploadsAlbumFilter";
import {
  parseUploadKindFilter,
  UploadsKindFilter,
} from "@/components/admin/UploadsKindFilter";
import { UploadsToolbar } from "@/components/admin/UploadsToolbar";
import { listAdminAlbums, listAlbumVolumes } from "@/lib/albums/admin";
import type { AlbumOption } from "@/lib/albums/types";
import { isSmartBlogApp } from "@/lib/client/detect";
import { loadCosSettings } from "@/lib/storage";
import { listAdminUploads } from "@/lib/uploads/admin";
import { parsePage } from "@/lib/utils/page";

export const metadata: Metadata = {
  title: "媒体库",
};

type PageProps = {
  searchParams: Promise<{ page?: string; album?: string; kind?: string }>;
};

export default async function AdminUploadsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parsePage(params.page);
  // `?album=<id>` 只看某个相册；`?album=none` 只看未分类；空 = 全部
  const albumFilter = params.album ?? "";
  // `?kind=image|video|audio` 类型分区（**音频与图片/视频分开看**）；空 = 全部。
  // 列表接口本来就支持 `?kind=`，这里只是把入口接上（见 docs/moment-audio-spec.md §2.6）。
  const kindFilter = parseUploadKindFilter(params.kind);
  // 这一发是不是 SmartBlog App：决定上传按钮是「直接开文件对话框」还是「相册视图 / 文件视图」两项下拉。
  // 判定只有 lib/client/detect.ts 一个口子（UA 标记），不在客户端再写一遍（见 docs/moment-video-spec.md）。
  const isApp = isSmartBlogApp((await headers()).get("user-agent"));
  const [result, albums, cos] = await Promise.all([
    listAdminUploads(page, 24, kindFilter || null, albumFilter),
    listAdminAlbums(),
    loadCosSettings(),
  ]);

  // 卷跟着相册一起交给 client（上传预览弹窗与卡片上的卷下拉共用同一个形状）：
  // 每个相册查一次 listAlbumVolumes()，页面渲染时只查这一次，别让每张卡各查一遍。
  const albumOptions: AlbumOption[] = await Promise.all(
    albums.map(async (album) => ({
      id: album.id,
      title: album.title,
      volumes: (await listAlbumVolumes(album.id)).map((volume) => ({
        id: volume.id,
        title: volume.title,
      })),
    })),
  );

  return (
    <section className="admin-card">
      <h2>媒体库</h2>
      <p className="admin-danger">
        默认删除会同时清掉本机原图、一级/二级缩略图和 COS。也可以只删本地、保留云端。若文章或瞬间还在用，删除前会警告。
      </p>
      {/* 没配 COS 不是错误：上传只落到本机，缩略图照常生成。这里把「东西在哪」说清楚，
          免得站长以为必须先去填云存储才能用媒体库（老实现会直接报 503，见 P-145）。 */}
      {cos ? null : (
        <p className="admin-muted">
          当前<strong>没有配置 COS</strong>：上传的图片只存在本机；上传、生成缩略图、归入相册、写进文章都照常可用
          ——<strong>不需要</strong>先去填云存储。注意「本地媒体上限」只在图片已有云端副本时才会清本机缓存，
          所以没有 COS 时这些文件会一直留着，自己留意磁盘占用；以后配了 COS，用上面的「迁移到 COS」补传即可。
        </p>
      )}
      <UploadsToolbar albums={albumOptions} appMode={isApp} />
      {/* 类型分区（图片 / 视频 / 音频）与相册筛选是两个独立维度：各自换值时都会带上对方 */}
      <UploadsKindFilter album={albumFilter} value={kindFilter} />
      {/* 相册筛选走原生 GET 表单：服务端筛选，不需要客户端状态。
          下拉本身是 AdminSelect 的浮层自绘列表（媒体库页不留原生 <select>）。 */}
      <UploadsAlbumFilter
        hidden={{ kind: kindFilter }}
        options={[
          { value: "", label: "全部" },
          { value: "none", label: "未分类" },
          ...albums.map((album) => ({
            value: String(album.id),
            label: `${album.title}（${album.count}）`,
          })),
        ]}
        value={albumFilter}
      />
      {result.data.length === 0 ? (
        <p>
          {albumFilter || kindFilter
            ? "这个筛选下还没有文件。"
            : "还没有上传文件。用上面的按钮上传图片、视频或音频。"}
        </p>
      ) : (
        <ul className="admin-media-grid">
          {result.data.map((file, index) => (
            <UploadCard albums={albumOptions} file={file} index={index} key={file.id} />
          ))}
        </ul>
      )}
      <Pagination
        basePath={(() => {
          const query = new URLSearchParams();
          if (albumFilter) {
            query.set("album", albumFilter);
          }
          if (kindFilter) {
            query.set("kind", kindFilter);
          }
          const suffix = query.toString();
          return suffix ? `/admin/uploads?${suffix}` : "/admin/uploads";
        })()}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </section>
  );
}
