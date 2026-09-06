import type { MetadataRoute } from "next";

import { cachedPublic, PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import { postHref } from "@/lib/posts/path";
import { listArchivePosts, listCategories, listTags } from "@/lib/posts/query";
import { getSiteOrigin } from "@/lib/seo/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return cachedPublic(["sitemap"], [PUBLIC_CACHE_TAGS.seo, PUBLIC_CACHE_TAGS.posts], async () => {
    const origin = await getSiteOrigin();
    const [posts, categories, tags] = await Promise.all([
      listArchivePosts(),
      listCategories(),
      listTags(),
    ]);

    const staticRoutes: MetadataRoute.Sitemap = [
      "",
      "/posts",
      "/archives",
      "/categories",
      "/tags",
      "/moments",
      "/messages",
      "/search",
    ].map((path) => ({
      url: `${origin}${path || "/"}`,
      changeFrequency: path === "" ? "daily" : "weekly",
      priority: path === "" ? 1 : 0.7,
    }));

    const postRoutes = posts.map((post) => ({
      url: `${origin}${postHref(post)}`,
      lastModified: post.publishedAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: post.locked ? 0.4 : 0.8,
    }));

    const taxonomyRoutes = [
      ...categories.map((item) => ({
        url: `${origin}/categories/${item.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
      ...tags.map((item) => ({
        url: `${origin}/tags/${item.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
    ];

    return [...staticRoutes, ...postRoutes, ...taxonomyRoutes];
  });
}
