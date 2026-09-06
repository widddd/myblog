import { unstable_cache } from "next/cache";

export const PUBLIC_CACHE_TAGS = {
  posts: "public-posts",
  taxonomies: "public-taxonomies",
  home: "public-home",
  seo: "public-seo",
} as const;

export function cachedPublic<T>(
  keyParts: string[],
  tags: string[],
  fn: () => Promise<T>,
  revalidate = 60,
): Promise<T> {
  return unstable_cache(fn, keyParts, { tags, revalidate })();
}
