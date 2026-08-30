import { revalidatePath } from "next/cache";

export function revalidatePublicContent(slug?: string) {
  revalidatePath("/");
  revalidatePath("/posts");
  revalidatePath("/archives");
  revalidatePath("/categories");
  revalidatePath("/tags");
  revalidatePath("/moments");
  revalidatePath("/search");
  if (slug) {
    revalidatePath(`/posts/${slug}`);
  }
}
