import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PostEditorForm } from "@/components/admin/PostEditorForm";
import { AdminHttpError } from "@/lib/admin/http";
import { readDefaultPenName } from "@/lib/auth/account";
import { getAdminPost } from "@/lib/posts/admin";
import { listCategories, listPenNames, listTags } from "@/lib/taxonomy/admin";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "编辑文章",
};

export default async function EditPostPage({ params }: PageProps) {
  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    notFound();
  }

  let post: Awaited<ReturnType<typeof getAdminPost>>;
  let categories: Awaited<ReturnType<typeof listCategories>>;
  let tags: Awaited<ReturnType<typeof listTags>>;
  let penNames: Awaited<ReturnType<typeof listPenNames>>;
  let defaultAuthorName: string;
  try {
    [post, categories, tags, penNames, defaultAuthorName] = await Promise.all([
      getAdminPost(id),
      listCategories(),
      listTags(),
      listPenNames(),
      readDefaultPenName(),
    ]);
  } catch (error) {
    if (error instanceof AdminHttpError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <PostEditorForm
      categories={categories}
      defaultAuthorName={defaultAuthorName}
      mode="edit"
      penNames={penNames}
      post={post}
      tags={tags}
    />
  );
}
