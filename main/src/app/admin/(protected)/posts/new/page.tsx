import type { Metadata } from "next";

import { PostEditorForm } from "@/components/admin/PostEditorForm";
import { listCategories, listTags } from "@/lib/taxonomy/admin";

export const metadata: Metadata = {
  title: "写文章",
};

export default async function NewPostPage() {
  const [categories, tags] = await Promise.all([listCategories(), listTags()]);

  return (
    <PostEditorForm
      categories={categories}
      mode="create"
      tags={tags}
    />
  );
}
