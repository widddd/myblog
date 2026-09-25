import type { AdminPostView } from "@/lib/posts/admin-types";
import { postHref } from "@/lib/posts/path";

/**
 * 文章列表行（`/admin/posts`）的行数据。
 *
 * 放在 lib 而不是列表页面里：`updatedLabel` 与 `canView` 都要碰"现在"，
 * 而组件渲染期间禁止调 `Date.now()` / `toLocaleString()` 这类不确定调用
 * （react-hooks/purity 会直接报错，浏览器与服务器算出来还可能不一致）。
 */
export type AdminPostRow = {
  id: number;
  title: string;
  status: string;
  /** 服务端格式化好的「更新」列 */
  updatedLabel: string;
  pinned: boolean;
  recommend: boolean;
  hasPassword: boolean;
  /** 前台文章地址：只走 postHref()（P-050） */
  href: string;
  /** 已发布且发布时间已到才有公开页面；草稿 / 定时 / 未到时间都没有 */
  canView: boolean;
};

export function buildAdminPostRows(
  posts: AdminPostView[],
  now: number = Date.now(),
): AdminPostRow[] {
  return posts.map((post) => ({
    id: post.id,
    title: post.title,
    status: post.status,
    updatedLabel: new Date(post.updatedAt ?? "").toLocaleString("zh-CN"),
    pinned: post.pinned,
    recommend: post.recommend,
    hasPassword: post.hasPassword,
    href: postHref({ publicId: post.publicId, slug: post.slug }),
    canView:
      post.status === "published" &&
      post.publishedAt != null &&
      new Date(post.publishedAt).getTime() <= now,
  }));
}
