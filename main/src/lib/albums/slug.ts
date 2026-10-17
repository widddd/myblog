/**
 * 相册地址名（slug）的归一与去重。纯函数，配 slug.test.ts。
 *
 * 与静态页面地址（`lib/pages/directories.ts`）的区别，**是刻意**的：
 * 静态页面的目录是 `/{dir}/{slug}`，目录段要跟顶层路由抢名字，所以必须 ASCII；
 * 相册恒在 `/albums/` 下（`/albums/{slug}`），与顶层路由不可能撞，所以**允许中文**
 * ——和文章地址一个口径（中文标题走 `slugify()` 的中文兜底，URL 里百分号编码）。
 */

import { STATIC_PAGE_SEGMENT_MAX } from "@/lib/pages/directories";
import { slugify } from "@/lib/utils/slugify";

/** 与静态页单段地址同一个长度上限（同一份常量，不另立一套）。 */
export const ALBUM_SLUG_MAX = STATIC_PAGE_SEGMENT_MAX;

export const ALBUM_TITLE_MAX = 60;
export const ALBUM_DESCRIPTION_MAX = 200;
export const ALBUM_SORT_MAX = 9999;

/** 一个相册最多放多少张图（后台批量归册的接口上限）。 */
export const ALBUM_ASSIGN_MAX = 500;

/** 标题里挑不出可用地址名时的兜底（会被去重成 album-2、album-3…）。 */
export const ALBUM_SLUG_FALLBACK = "album";

/**
 * 合法地址名：字母 / 数字 / 汉字等各类字母开头，之后可带 `-` 与 `_`，
 * **结尾必须是字母或数字**（与静态页的 `STATIC_PAGE_SEGMENT_PATTERN` 同口径，地址不会长成 `xxx-`）。
 * 不收空格、斜杠、`.`、`%`、`?`、`#` 这些会破坏路径或需要转义的字符；
 * 因为首字符必须是字母或数字，`..` 这类穿越写法也过不了。
 */
export const ALBUM_SLUG_PATTERN =
  /^[\p{Letter}\p{Number}](?:[\p{Letter}\p{Number}_-]*[\p{Letter}\p{Number}])?$/u;

export function isValidAlbumSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= ALBUM_SLUG_MAX &&
    ALBUM_SLUG_PATTERN.test(value)
  );
}

/** 标题 → 地址名。挑不出合法值时返回空串，由调用方决定兜底（表单里也允许手填）。 */
export function albumSlugFromTitle(title: string): string {
  const candidate = slugify(title).slice(0, ALBUM_SLUG_MAX).replace(/-+$/, "");
  return isValidAlbumSlug(candidate) ? candidate : "";
}

/**
 * 撞名时依次加 `-2`、`-3`…（到 999 为止）。
 * 加后缀时**先把根截短**，否则根已经是 60 字时后缀会被长度上限吃掉、永远撞名。
 */
export function uniqueAlbumSlug(base: string, taken: readonly string[]): string {
  const root = isValidAlbumSlug(base) ? base : ALBUM_SLUG_FALLBACK;
  const used = new Set(taken);
  if (!used.has(root)) {
    return root;
  }
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${root.slice(0, ALBUM_SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `${root.slice(0, ALBUM_SLUG_MAX - 4).replace(/-+$/, "")}-999`;
}

/** 表单里手填的地址名归一：去空白、去掉首尾连字符。空串表示"没填"，由调用方从标题生成。 */
export function normalizeAlbumSlugInput(raw: string): string {
  return raw.trim().replace(/^-+|-+$/g, "");
}
