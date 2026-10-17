/**
 * 相册地址的唯一口径：`/albums/{slug}`。
 * 无 prisma、无 react，client / 服务端 / 测试都能引（与 lib/posts/path.ts 同一角色）。
 */

export const ALBUMS_PATH = "/albums";

export function albumHref(slug: string): string {
  return `${ALBUMS_PATH}/${slug}`;
}
