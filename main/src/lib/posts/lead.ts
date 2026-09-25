/**
 * 卡片「文章开头一小段」：MDX 正文开头截成一行纯文本。
 *
 * 只在文章**没有手写摘要**（`Post.excerpt` 为空）时兜底，给「无封面细条卡」用。
 * 输出只进文本节点，不经任何 HTML/MDX 渲染，所以这里做的是展示用降噪，
 * 不是安全消毒——消毒仍然只走 `lib/markdown/sanitize.ts`（红线 4）。
 */

/** 一行导语的字符预算：够宽屏铺满一行，又不至于把整段正文带进列表接口 */
export const LEAD_MAX_CHARS = 96;

const FRONTMATTER = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/;
const FENCED_CODE = /^[ \t]*(?:```|~~~)[^\n]*\r?\n[\s\S]*?^[ \t]*(?:```|~~~)[^\n]*\r?$/gm;
const ESM_LINE = /^[ \t]*(?:import|export)\b.*$/gm;
const INLINE_CODE = /`[^`\n]*`/g;
const IMAGE = /!\[[^\]]*]\([^)]*\)/g;
const LINK = /\[([^\]]*)]\([^)]*\)/g;
const HTML_TAG = /<[^>\n]*>/g;
const LINE_MARKER = /^[ \t]*(?:#{1,6}|>|[-*+]|\d+[.)])[ \t]+/gm;
const EMPHASIS = /(\*\*|__|\*|_|~~|==)/g;
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm;

/**
 * 正文开头 → 单行纯文本。全是标记、没有可读文字时返回 null。
 */
export function leadFromContent(source: string): string | null {
  if (!source) {
    return null;
  }

  const text = source
    .replace(FRONTMATTER, "")
    .replace(FENCED_CODE, " ")
    .replace(ESM_LINE, "")
    .replace(INLINE_CODE, "")
    .replace(IMAGE, "")
    .replace(LINK, "$1")
    .replace(HTML_TAG, "")
    .replace(TABLE_SEPARATOR, " ")
    .replace(LINE_MARKER, "")
    .replace(EMPHASIS, "")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  // 按码点截断，避免把代理对（emoji）切成半个字符
  const points = Array.from(text);

  return points.length > LEAD_MAX_CHARS
    ? points.slice(0, LEAD_MAX_CHARS).join("")
    : text;
}
