import { revalidatePath, revalidateTag } from "next/cache";

import { PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import { postHref } from "@/lib/posts/path";

export function revalidatePublicContent(
  target?: string | { slug?: string; publicId?: string },
) {
  revalidateTag(PUBLIC_CACHE_TAGS.posts, "max");
  revalidateTag(PUBLIC_CACHE_TAGS.taxonomies, "max");
  revalidateTag(PUBLIC_CACHE_TAGS.home, "max");
  revalidateTag(PUBLIC_CACHE_TAGS.seo, "max");
  revalidatePath("/");
  revalidatePath("/posts");
  revalidatePath("/archives");
  revalidatePath("/categories");
  revalidatePath("/tags");
  revalidatePath("/moments");
  revalidatePath("/search");
  revalidatePath("/sitemap.xml");
  revalidatePath("/rss.xml");
  revalidatePath("/robots.txt");
  if (!target) {
    return;
  }
  if (typeof target === "string") {
    revalidatePath(`/posts/${target}`);
    return;
  }
  if (target.slug) {
    revalidatePath(`/posts/${target.slug}`);
  }
  if (target.publicId) {
    revalidatePath(`/posts/${target.publicId}`);
    revalidatePath(
      postHref({
        publicId: target.publicId,
        slug: target.slug ?? "article",
      }),
    );
  }
}
