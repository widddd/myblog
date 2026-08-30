const VIDEO_URL = /\.(mp4|webm)(?:[?#].*)?$/i;

function isSafeMediaUrl(value: string): boolean {
  if (value.startsWith("/api/uploads/")) {
    return true;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function readAttr(attrs: string, name: string): string | undefined {
  const match = attrs.match(
    new RegExp(
      `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    ),
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value?.trim() || undefined;
}

function videoJsx(
  src: string,
  extra?: { poster?: string; title?: string },
): string {
  const parts = [`src="${src}"`];
  if (extra?.poster && isSafeMediaUrl(extra.poster)) {
    parts.push(`poster="${extra.poster}"`);
  }
  if (extra?.title) {
    parts.push(`title="${extra.title.replace(/"/g, "")}"`);
  }
  return `\n\n<Video ${parts.join(" ")} />\n\n`;
}

/**
 * Normalize stored post markdown so the editor and renderer share one video form.
 * HTML `<video>` and markdown images that point at mp4/webm become `<Video />`.
 * Existing `<Video>` JSX is left intact (the matcher is case-sensitive).
 */
export function normalizePostContent(source: string): string {
  let text = source.replace(
    /<video\b([^>]*?)(?:\/>|>([\s\S]*?)<\/video>)/g,
    (full, attrs: string) => {
      const src = readAttr(attrs, "src");
      if (!src || !isSafeMediaUrl(src)) {
        return full;
      }
      return videoJsx(src, {
        poster: readAttr(attrs, "poster"),
        title: readAttr(attrs, "title"),
      });
    },
  );

  text = text.replace(
    /!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (full, alt: string, url: string, title?: string) => {
      const src = url.trim();
      if (!VIDEO_URL.test(src) || !isSafeMediaUrl(src)) {
        return full;
      }
      return videoJsx(src, { title: title || alt });
    },
  );

  return text.replace(/\n{3,}/g, "\n\n");
}
