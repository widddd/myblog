import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StaticPageEditor } from "@/components/admin/StaticPageEditor";
import { getStaticPage, getStaticPagesDir } from "@/lib/pages/admin";

export const metadata: Metadata = {
  title: "编辑静态页面",
};

export default async function AdminStaticPageEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pageId = Number.parseInt(id, 10);
  if (!Number.isInteger(pageId) || pageId < 1) {
    notFound();
  }

  const [page, dir] = await Promise.all([getStaticPage(pageId), getStaticPagesDir()]);
  if (!page) {
    notFound();
  }

  return (
    <StaticPageEditor
      dir={dir}
      page={{
        id: page.id,
        slug: page.slug,
        title: page.title,
        description: page.description,
        html: page.html,
        css: page.css,
        js: page.js,
        enabled: page.enabled,
      }}
    />
  );
}
