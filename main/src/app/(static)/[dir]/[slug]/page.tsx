import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StaticPageRuntime } from "@/components/pages/StaticPageRuntime";
import { findPublicStaticPage } from "@/lib/pages/admin";
import { describeDirectoryConflict } from "@/lib/pages/directories";

/**
 * 静态页面公开路由：`/{Setting staticPagesDir}/{slug}`（见 lib/pages/directories.ts）。
 *
 * **这是 Next 里优先级最低的一段**：`src/app/` 下任何具体路由（/posts、/admin …）与
 * 同层的动态路由都比 `[dir]` 更具体，框架永远先匹配它们。所以将来新增顶层路由时，
 * 静态页会自动让位，而不是把它顶掉——「Next 路由完全优先」这条就是靠这个保证的。
 *
 * 另有两道让位：目录命中保留段直接 notFound()（连库都不查），以及目录与当前配置不一致
 * 时在 `findPublicStaticPage()` 里返回 null。二者合起来保证这里只处理「真的归静态页管」的地址。
 */
type StaticPageRouteProps = {
  params: Promise<{ dir: string; slug: string }>;
};

/** 只认单段 slug：`/{dir}/a/b` 这类更深或更浅的地址一律 404，交给别的路由。 */
function slugFromSegments(slug: string[] | undefined): string | null {
  if (!slug || slug.length !== 1) {
    return null;
  }
  const [only] = slug;
  return only && only.length > 0 ? only : null;
}

export async function generateMetadata({
  params,
}: StaticPageRouteProps): Promise<Metadata> {
  const { dir, slug } = await params;
  const single = slugFromSegments([slug]);
  if (!single || describeDirectoryConflict(dir)) {
    return {};
  }
  const page = await findPublicStaticPage(dir, single);
  if (!page) {
    return {};
  }
  return {
    title: page.title,
    description: page.description || undefined,
  };
}

export default async function StaticPageRoute({ params }: StaticPageRouteProps) {
  const { dir, slug } = await params;
  const single = slugFromSegments([slug]);
  if (!single) {
    notFound();
  }
  // 保留段：站位让给框架路由，不自作处理（目录与 slug 两侧都拦）。
  if (describeDirectoryConflict(dir) || describeDirectoryConflict(single)) {
    notFound();
  }

  const page = await findPublicStaticPage(dir, single);
  if (!page) {
    notFound();
  }

  return <StaticPageRuntime css={page.css} html={page.html} js={page.js} pageId={page.id} />;
}
