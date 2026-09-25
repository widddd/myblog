import type { Metadata } from "next";

import { PostEditorForm } from "@/components/admin/PostEditorForm";
import { readDefaultPenName } from "@/lib/auth/account";
import { listCategories, listPenNames, listTags } from "@/lib/taxonomy/admin";

export const metadata: Metadata = {
  title: "写文章",
};

export default async function NewPostPage() {
  const [categories, tags, penNames, defaultAuthorName] = await Promise.all([
    listCategories(),
    listTags(),
    listPenNames(),
    readDefaultPenName(),
  ]);

  return (
    <PostEditorForm
      categories={categories}
      defaultAuthorName={defaultAuthorName}
      mode="create"
      penNames={penNames}
      tags={tags}
    />
  );
}
