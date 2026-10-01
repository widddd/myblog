/**
 * Halo 备份 → 本站内容的**纯转换层**（无 Prisma、无 Next）：
 *
 * - 读 `decode_backup.py` 产出的 `decoded/` 目录（`articles/`、`moments/`、`upload/`）
 * - 把 Halo 的正文 HTML 转成本站的 MDX（段落 / 标题 / 列表 / 引用 / 图片 / 链接）
 * - 把 `/upload/xxx.jpg` 这类引用交给调用方换成站内媒体地址（见 `convertHaloHtmlToMdx` 的 `resolveImage`）
 *
 * 写库与落盘在 `scripts/import-halo.ts`，这里只做「怎么读、怎么转」。
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type HaloArticleKind = "Post" | "SinglePage";

export type HaloArticle = {
  /** 正文文件名（decoded/articles/<name>.html） */
  contentFile: string;
  kind: HaloArticleKind;
  title: string;
  slug: string;
  deleted: boolean;
  published: boolean;
  publishedAt: Date | null;
  createdAt: Date | null;
  excerpt: string | null;
  /** 封面引用（/upload/…），没有则为 null */
  coverRef: string | null;
  categories: string[];
  tags: string[];
  /** 正文里出现过的图片引用（含封面），按出现顺序去重 */
  imageRefs: string[];
  html: string;
  warnings: string[];
};

export type HaloMoment = {
  index: number;
  name: string;
  createdAt: Date | null;
  /** 纯文本正文（段落之间空行），对应本站 Moment.content */
  content: string;
  contentHtml: string;
  /** 媒体与正文里的图片引用，按 Halo 里的展示顺序去重 */
  imageRefs: string[];
};

export type HaloBundle = {
  dir: string;
  uploadDir: string;
  articles: HaloArticle[];
  moments: HaloMoment[];
  warnings: string[];
};

export type ConvertOptions = {
  /** 原正文里显式写了 `text-indent: 2em` 的段落，转换时补两个全角空格（默认关，交给站点样式） */
  keepIndent?: boolean;
};

/** 把 `/upload/%E5%BE%AE...jpg` 或 `/upload/照片.jpg` 归一成文件名；不是 `upload/` 引用则返回 null。 */
export function uploadRefToFileName(ref: string): string | null {
  const trimmed = (ref ?? "").trim();
  if (!trimmed.includes("upload/")) {
    return null;
  }
  const withoutQuery = trimmed.split("?")[0]!.split("#")[0]!;
  const name = withoutQuery.split("/").filter(Boolean).pop() ?? "";
  if (!name) {
    return null;
  }
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export function parseHaloDate(value: string | null | undefined): Date | null {
  const text = (value ?? "").trim();
  if (!text) {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// HTML → 节点树（只认 Halo 正文里会出现的那批标签，未知标签按"透明"处理）
// ---------------------------------------------------------------------------

type HNode =
  | { type: "text"; value: string }
  | { type: "element"; tag: string; attrs: Record<string, string>; children: HNode[] };

type HElement = Extract<HNode, { type: "element" }>;

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/** 会被当作行内处理的标签；其余标签在块级渲染时按"整块"看待 */
const INLINE_TAGS = new Set([
  "a",
  "b",
  "code",
  "del",
  "em",
  "i",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "tt",
  "u",
  "var",
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: '"',
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
        return whole;
      }
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function findTagEnd(input: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < input.length; i += 1) {
    const char = input[i]!;
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") {
      return i;
    }
  }
  return -1;
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1]!.toLowerCase();
    const raw = match[2] ?? "";
    const value = raw ? raw.replace(/^["']|["']$/g, "") : "";
    attrs[name] = decodeHtmlEntities(value);
  }
  return attrs;
}

export function parseHaloHtml(input: string): HNode[] {
  const root: HElement = { type: "element", tag: "#root", attrs: {}, children: [] };
  const stack: HElement[] = [root];
  let index = 0;

  const push = (node: HNode) => {
    stack[stack.length - 1]!.children.push(node);
  };

  while (index < input.length) {
    const nextTag = input.indexOf("<", index);
    if (nextTag < 0) {
      push({ type: "text", value: decodeHtmlEntities(input.slice(index)) });
      break;
    }
    if (nextTag > index) {
      push({ type: "text", value: decodeHtmlEntities(input.slice(index, nextTag)) });
    }

    if (input.startsWith("<!--", nextTag)) {
      const commentEnd = input.indexOf("-->", nextTag + 4);
      index = commentEnd < 0 ? input.length : commentEnd + 3;
      continue;
    }

    const tagEnd = findTagEnd(input, nextTag);
    if (tagEnd < 0) {
      push({ type: "text", value: decodeHtmlEntities(input.slice(nextTag)) });
      break;
    }

    const raw = input.slice(nextTag + 1, tagEnd);
    index = tagEnd + 1;

    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim().toLowerCase();
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth]!.tag === name) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }

    const selfClosing = raw.endsWith("/");
    const body = (selfClosing ? raw.slice(0, -1) : raw).trim();
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(body);
    if (!nameMatch) {
      // 例如正文里的 "<3"：当普通文本吐回去，别当成标签
      push({ type: "text", value: `<${raw}>` });
      continue;
    }

    const tag = nameMatch[0]!.toLowerCase();
    const element: HElement = {
      type: "element",
      tag,
      attrs: parseAttributes(body.slice(nameMatch[0]!.length)),
      children: [],
    };
    push(element);
    if (!selfClosing && !VOID_TAGS.has(tag)) {
      stack.push(element);
    }
  }

  return root.children;
}

function attr(node: HElement, name: string): string {
  return node.attrs[name] ?? "";
}

function indentHinted(node: HElement): boolean {
  if (/text-indent\s*:\s*2em/i.test(attr(node, "style"))) {
    return true;
  }
  return node.children.some((child) => child.type === "element" && indentHinted(child));
}

// ---------------------------------------------------------------------------
// 节点树 → Markdown / MDX
// ---------------------------------------------------------------------------

function escapeText(value: string): string {
  // MDX 里 `<` 会被当成 JSX、`{` `}` 会被当成表达式，必须转义；
  // `&` 也要转义，否则正文里的 `&amp;` 会被二次解析（原文的实体在解析阶段已经还原成字符）。
  return value.replace(/[&<>{}]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "{":
        return "\\{";
      default:
        return "\\}";
    }
  });
}

function inlineText(nodes: HNode[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      out += node.value;
      continue;
    }
    if (node.tag === "br") {
      out += "\n";
      continue;
    }
    out += inlineText(node.children);
  }
  return out;
}

function markdownLink(href: string, label: string): string {
  const safeHref = href.trim();
  const safeLabel = label.replace(/[[\]]/g, "");
  if (!safeLabel) {
    return "";
  }
  const ok =
    (safeHref.startsWith("/") && !safeHref.startsWith("//")) ||
    /^https:\/\//i.test(safeHref);
  return ok ? `[${safeLabel}](${safeHref})` : safeLabel;
}

function codeFence(value: string): string {
  return `\`${value.replace(/`/g, "")}\``;
}

function renderInline(
  nodes: HNode[],
  resolveImage: (ref: string) => string | null,
): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      out += escapeText(node.value);
      continue;
    }

    switch (node.tag) {
      case "br":
        out += "<br />";
        break;
      case "strong":
      case "b": {
        const inner = renderInline(node.children, resolveImage).trim();
        out += inner ? `**${inner}**` : "";
        break;
      }
      case "em":
      case "i": {
        const inner = renderInline(node.children, resolveImage).trim();
        out += inner ? `*${inner}*` : "";
        break;
      }
      case "code":
        out += codeFence(inlineText(node.children));
        break;
      case "a": {
        const href = attr(node, "href");
        out += markdownLink(href, renderInline(node.children, resolveImage));
        break;
      }
      case "img": {
        const src = attr(node, "src");
        const resolved = src ? resolveImage(src) : null;
        out += resolved ? `![${attr(node, "alt").replace(/[[\]]/g, "")}](${resolved})` : "";
        break;
      }
      default:
        if (INLINE_TAGS.has(node.tag)) {
          out += renderInline(node.children, resolveImage);
          break;
        }
        // 块级标签出现在行内位置：按块处理再压成一行
        out += renderBlocks(node.children, resolveImage, {}).replace(/\n+/g, " ");
    }
  }
  return out;
}

function renderList(
  node: HElement,
  resolveImage: (ref: string) => string | null,
  ordered: boolean,
): string {
  const lines: string[] = [];
  const items = node.children.filter(
    (child): child is HElement => child.type === "element" && child.tag === "li",
  );
  items.forEach((item, itemIndex) => {
    const nested = item.children.filter(
      (child): child is HElement =>
        child.type === "element" && (child.tag === "ul" || child.tag === "ol"),
    );
    const own = item.children.filter((child) => !nested.includes(child as HElement));
    const marker = ordered ? `${itemIndex + 1}. ` : "- ";
    const text = renderInline(own, resolveImage).replace(/\n+/g, " ").trim();
    lines.push(`${marker}${text}`.trimEnd());
    for (const sub of nested) {
      const block = renderList(sub, resolveImage, sub.tag === "ol");
      lines.push(
        ...block
          .split("\n")
          .filter(Boolean)
          .map((line) => `  ${line}`),
      );
    }
  });
  return lines.join("\n");
}

function renderTable(
  node: HElement,
  resolveImage: (ref: string) => string | null,
): string {
  const rows = node.children.filter(
    (child): child is HElement => child.type === "element" && child.tag === "tr",
  );
  if (rows.length === 0) {
    return "";
  }
  const cellLines = rows.map((row) => {
    const cells = row.children
      .filter(
        (child): child is HElement =>
          child.type === "element" && (child.tag === "th" || child.tag === "td"),
      )
      .map((cell) => renderInline(cell.children, resolveImage).replace(/\n+/g, " ").trim());
    return `| ${cells.join(" | ")} |`;
  });
  const columns = Math.max(
    ...rows.map(
      (row) =>
        row.children.filter(
          (child) => child.type === "element" && (child.tag === "th" || child.tag === "td"),
        ).length,
    ),
  );
  const separator = `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`;
  return [cellLines[0]!, separator, ...cellLines.slice(1)].join("\n");
}

function renderPre(node: HElement): string {
  const code = node.children.find(
    (child): child is HElement => child.type === "element" && child.tag === "code",
  );
  const language = code ? /language-([a-z0-9#+-]+)/i.exec(attr(code, "class"))?.[1] ?? "" : "";
  const value = inlineText(code ? code.children : node.children).replace(/\n+$/, "");
  return `\`\`\`${language}\n${value}\n\`\`\``;
}

function renderBlocks(
  nodes: HNode[],
  resolveImage: (ref: string) => string | null,
  options: ConvertOptions,
): string {
  const blocks: string[] = [];

  for (const node of nodes) {
    if (node.type === "text") {
      const text = node.value.replace(/[ \t]+/g, " ").trim();
      if (text) {
        blocks.push(escapeText(text));
      }
      continue;
    }

    const heading = /^h([1-6])$/.exec(node.tag);
    if (heading) {
      const inner = renderInline(node.children, resolveImage).replace(/\n+/g, " ").trim();
      if (inner) {
        blocks.push(`${"#".repeat(Number(heading[1]))} ${inner}`);
      }
      continue;
    }

    switch (node.tag) {
      case "p": {
        const inner = renderInline(node.children, resolveImage).trim();
        if (inner) {
          const indent = options.keepIndent && indentHinted(node) ? "　　" : "";
          blocks.push(`${indent}${inner}`);
        }
        break;
      }
      case "ul":
        blocks.push(renderList(node, resolveImage, false));
        break;
      case "ol":
        blocks.push(renderList(node, resolveImage, true));
        break;
      case "blockquote": {
        const inner = renderBlocks(node.children, resolveImage, options);
        if (inner) {
          blocks.push(
            inner
              .split("\n")
              .map((line) => (line ? `> ${line}` : ">"))
              .join("\n"),
          );
        }
        break;
      }
      case "pre":
        blocks.push(renderPre(node));
        break;
      case "hr":
        blocks.push("---");
        break;
      case "table":
        blocks.push(renderTable(node, resolveImage));
        break;
      case "img": {
        const inner = renderInline([node], resolveImage).trim();
        if (inner) {
          blocks.push(inner);
        }
        break;
      }
      case "br":
        break;
      case "figcaption": {
        const inner = renderInline(node.children, resolveImage).trim();
        if (inner) {
          blocks.push(inner);
        }
        break;
      }
      default: {
        if (INLINE_TAGS.has(node.tag)) {
          // 例如 `<span>…</span>` 直接挂在根上：按一行的段落处理
          const inner = renderInline([node], resolveImage).trim();
          if (inner) {
            blocks.push(inner);
          }
          break;
        }
        const inner = renderBlocks(node.children, resolveImage, options);
        if (inner) {
          blocks.push(inner);
        }
      }
    }
  }

  return blocks
    .map((block) => block.replace(/[ \t]+$/gm, ""))
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
}

/**
 * Halo 正文 HTML → 本站 MDX。
 * `resolveImage` 把 `/upload/xxx.jpg` 换成站内媒体地址；返回 null 的图片会被丢掉（调用方负责报警告）。
 */
export function convertHaloHtmlToMdx(
  html: string,
  resolveImage: (ref: string) => string | null,
  options: ConvertOptions = {},
): string {
  // 注意：**不要**在这里 trim 整篇 —— `--keep-indent` 时段首是两个全角空格，
  // 而 JS 的 trim() 会把 U+3000 一起吃掉，开头那一段的缩进会莫名消失。
  return renderBlocks(parseHaloHtml(html), resolveImage, options);
}

/** Halo 正文 HTML → 纯文本（瞬间正文用）。段落之间空一行，`<br>` 换行。 */
export function haloHtmlToText(html: string): string {
  const blocks: string[] = [];

  const walk = (nodes: HNode[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        const text = node.value.replace(/\s+/g, " ");
        if (text.trim()) {
          blocks.push(text.trim());
        }
        continue;
      }
      if (node.tag === "br") {
        blocks.push("\n");
        continue;
      }
      if (INLINE_TAGS.has(node.tag)) {
        walk(node.children);
        continue;
      }
      if (node.tag === "li") {
        blocks.push(`· ${inlineText(node.children).trim()}`);
        continue;
      }
      walk(node.children);
    }
  };

  walk(parseHaloHtml(html));

  return blocks
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

// ---------------------------------------------------------------------------
// 读 decoded/ 目录
// ---------------------------------------------------------------------------

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function listFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .sort();
}

type ArticleMeta = {
  kind?: string;
  title?: string;
  slug?: string;
  publish?: boolean;
  deleted?: boolean;
  publishTime?: string;
  creationTime?: string;
  excerpt?: string;
  categories?: string[];
  tags?: string[];
  cover?: string;
  contentFile?: string;
};

type MomentMeta = {
  index?: number;
  name?: string;
  content?: string;
  releaseTime?: string;
  media?: Array<{ url?: string }>;
  imageRefs?: string[];
  contentFile?: string;
};

type Manifest = {
  entries?: Array<{ ref?: string; normalized?: string; usedBy?: string[] }>;
};

/**
 * `decoded/articles/<x>.html` 有正文的多个修订被拼在一起的情况
 * （Halo 的行级 patch 是"整篇插入"时，导出会一行一版，最新一版在最前）。
 * 单行直接用；多行取第一行，并把候选写进 warnings 让人复核。
 */
function pickArticleHtml(file: string): { html: string; warnings: string[] } {
  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    return { html: lines[0]?.trim() ?? "", warnings: [] };
  }
  return {
    html: lines[0]!.trim(),
    warnings: [
      `${path.basename(file)} 里有 ${lines.length} 版正文（长度 ${lines.map((line) => line.length).join(" / ")}），已取第一行（最新一版）；如需换用其它版本，手工改这个文件的正文后重跑`,
    ],
  };
}

export function loadHaloBundle(dir: string): HaloBundle {
  const resolved = path.resolve(dir);
  const articlesDir = path.join(resolved, "articles");
  const momentsDir = path.join(resolved, "moments");
  const uploadDir = path.join(resolved, "upload");
  const warnings: string[] = [];

  const manifestPath = path.join(resolved, "images", "manifest.json");
  try {
    const manifest = readJson<Manifest>(manifestPath);
    if (!manifest.entries || manifest.entries.length === 0) {
      warnings.push("images/manifest.json 里没有被引用的图片，正文里的图片可能对不上 upload/ 目录");
    }
  } catch {
    warnings.push(`读不到 ${manifestPath}，只按正文里的 /upload/ 引用找图片`);
  }

  const articles: HaloArticle[] = [];
  for (const file of listFiles(articlesDir, ".meta.json")) {
    const meta = readJson<ArticleMeta>(path.join(articlesDir, file));
    const contentFile = meta.contentFile ?? file.replace(/\.meta\.json$/, ".html");
    const contentPath = path.join(articlesDir, contentFile);
    const { html, warnings: htmlWarnings } = pickArticleHtml(contentPath);
    const kind: HaloArticleKind = meta.kind === "SinglePage" ? "SinglePage" : "Post";
    const contentImageRefs = collectUploadRefs(html);
    const coverRef = meta.cover?.trim() ? meta.cover.trim() : null;
    const imageRefs = [...new Set([...(coverRef ? [coverRef] : []), ...contentImageRefs])];
    const categories = (meta.categories ?? []).filter((item) => item.trim().length > 0);

    articles.push({
      contentFile,
      kind,
      title: meta.title?.trim() || meta.slug || contentFile,
      slug: (meta.slug ?? "").trim() || contentFile.replace(/\.html$/, ""),
      deleted: meta.deleted === true,
      published: meta.publish === true,
      publishedAt: parseHaloDate(meta.publishTime),
      createdAt: parseHaloDate(meta.creationTime),
      excerpt: meta.excerpt?.trim() ? meta.excerpt.trim() : null,
      coverRef,
      categories,
      tags: (meta.tags ?? []).filter((item) => item.trim().length > 0),
      imageRefs,
      html,
      warnings: htmlWarnings,
    });
  }

  const moments: HaloMoment[] = [];
  for (const file of listFiles(momentsDir, ".meta.json")) {
    const meta = readJson<MomentMeta>(path.join(momentsDir, file));
    const contentFile = meta.contentFile ?? file.replace(/\.meta\.json$/, ".html");
    const contentHtml = readFileSync(path.join(momentsDir, contentFile), "utf8").trim();
    const mediaRefs = (meta.media ?? [])
      .map((item) => item.url?.trim() ?? "")
      .filter(Boolean);
    const imageRefs = [
      ...new Set([...mediaRefs, ...(meta.imageRefs ?? []).filter(Boolean), ...collectUploadRefs(contentHtml)]),
    ];
    const text =
      haloHtmlToText(contentHtml) || haloHtmlToText(meta.content ?? "");

    moments.push({
      index: meta.index ?? moments.length + 1,
      name: meta.name ?? contentFile,
      createdAt: parseHaloDate(meta.releaseTime),
      content: text,
      contentHtml,
      imageRefs,
    });
  }

  return { dir: resolved, uploadDir, articles, moments, warnings };
}

/** 正文里出现过的 `/upload/…` 引用（按出现顺序去重）。 */
export function collectUploadRefs(html: string): string[] {
  const refs = new Set<string>();
  for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1] ?? "";
    if (value.includes("upload/")) {
      refs.add(value);
    }
  }
  return [...refs];
}
