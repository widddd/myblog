export const ARTICLE_SEGMENT = "article";
export const PUBLIC_ID_LENGTH = 8;
export const PUBLIC_ID_PATTERN = /^[0-9A-Za-z]{8}$/;

export function isPublicId(value: string): boolean {
  return PUBLIC_ID_PATTERN.test(value);
}

export function postPathName(slug: string): string {
  const name = slug.trim();
  return name || ARTICLE_SEGMENT;
}

export function postHref(post: { publicId: string; slug: string }): string {
  return `/posts/${post.publicId}/${postPathName(post.slug)}`;
}

export function isCanonicalPostName(name: string, slug: string): boolean {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    return false;
  }
  return decoded === postPathName(slug);
}
