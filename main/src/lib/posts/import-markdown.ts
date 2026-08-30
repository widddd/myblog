export const MAX_MARKDOWN_IMPORT_BYTES = 1_048_576;

export type MarkdownImport = {
  content: string;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseMarkdownImport(raw: string, fileName?: string): MarkdownImport {
  const text = raw.replace(/^\uFEFF/, "");
  const match = text.match(FRONTMATTER);
  let body = text;
  let title: string | null = null;
  let slug: string | null = null;
  let excerpt: string | null = null;

  if (match) {
    body = text.slice(match[0].length);
    for (const line of match[1].split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator < 1) {
        continue;
      }
      const key = line.slice(0, separator).trim().toLowerCase();
      const value = unquote(line.slice(separator + 1));
      if (!value) {
        continue;
      }
      if (key === "title") {
        title = value;
      } else if (key === "slug") {
        slug = value;
      } else if (key === "excerpt" || key === "description" || key === "summary") {
        excerpt = value;
      }
    }
  }

  if (!title && fileName) {
    const fromName = fileName.replace(/\.(mdx|md)$/i, "").trim();
    title = fromName || null;
  }

  return {
    content: body.replace(/^\uFEFF/, "").replace(/^\r?\n/, ""),
    title,
    slug,
    excerpt,
  };
}
