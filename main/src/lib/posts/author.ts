/** 作者名长度上限：`validation/post.ts` 的 authorName 与编辑器输入框共用这一个值 */
export const AUTHOR_NAME_MAX = 40;

/**
 * 文章作者：文章自己填了就用自己的，否则回落到管理员账号上的默认笔名；
 * 两边都没有就返回空串（前台不渲染作者那一项）。
 *
 * 纯函数、不 import prisma —— client（编辑器）与服务端（查询投影）都能引用。
 */
export function resolveAuthorName(
  postAuthor: string | null | undefined,
  defaultAuthor: string | null | undefined,
): string {
  const own = postAuthor?.trim();
  if (own) {
    return own.slice(0, AUTHOR_NAME_MAX);
  }
  const fallback = defaultAuthor?.trim();
  return fallback ? fallback.slice(0, AUTHOR_NAME_MAX) : "";
}

/** 写入前的归一：空白当"没填"处理（用默认笔名），并裁到长度上限 */
export function normalizeAuthorName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, AUTHOR_NAME_MAX) : null;
}
