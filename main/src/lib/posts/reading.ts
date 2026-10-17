/**
 * 正文字数与预计阅读时长（纯函数，无依赖，可单测）。
 *
 * 口径（用户钦定）：
 * - 中日韩汉字：**一个字算一个**（标点、空格、换行都不算）；
 * - 英文/数字：**一个词算一个**（`Next.js 16` = 2 个：`Next` + `js` + `16` → 3 个，见下）；
 * - 标点、空白、换行一律不计。
 */

/** 汉字 + 假名 + 韩文音节（这些"一个字 = 一个词"） */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
/** 拉丁单词 / 数字（含内部连字符与撇号：`don't`、`my-blog` 算一个） */
const LATIN_WORD = /[0-9A-Za-z\u00c0-\u024f]+(?:['’\-][0-9A-Za-z\u00c0-\u024f]+)*/g;

/** 中文阅读速度：400 字/分钟；英文按 200 词/分钟折算成同一个"计数单位"。 */
const CHARS_PER_MINUTE = 400;

export type ReadingStats = {
  /** 汉字字数 + 英文词数 */
  count: number;
  /** 预计阅读时长（分钟，向上取整，最少 1） */
  minutes: number;
};

export function countWords(source: string): number {
  if (!source) {
    return 0;
  }
  const cjk = source.match(CJK)?.length ?? 0;
  const latin = source.match(LATIN_WORD)?.length ?? 0;
  return cjk + latin;
}

export function readingMinutes(count: number): number {
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(count / CHARS_PER_MINUTE));
}

/** 一次算完：正文（Markdown 原文）→ 字数 + 阅读时长。 */
export function readingStats(source: string): ReadingStats {
  const count = countWords(source);
  return { count, minutes: readingMinutes(count) };
}
