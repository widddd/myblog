/** Escape `\`, `%`, `_` so they are literal in SQLite LIKE (ESCAPE char(92)). */
export function escapeLike(input: string): string {
  return input.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export function likePattern(keyword: string): string {
  return `%${escapeLike(keyword)}%`;
}
