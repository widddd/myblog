/* eslint-disable @next/next/no-img-element */

import type { ComponentPropsWithoutRef } from "react";
import { cache } from "react";
import rehypeShiki from "@shikijs/rehype";
import { compileMDX } from "next-mdx-remote/rsc";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { Video } from "@/components/post/Video";

import { rehypeAllowVideo, sanitizeSchema } from "./sanitize";
import { createTocCollector, type TocItem } from "./toc";

export type { TocItem } from "./toc";

const LOCAL_IMAGE_VARIANT =
  /^\/api\/uploads\/images\/([a-f0-9]{64})-(?:thumb|content)\.webp$/;

function safeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (value.startsWith("/api/uploads/")) {
    return value;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function numericDimension(value: string | number | undefined) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 10000
    ? number
    : undefined;
}

function MdxImage({
  src,
  alt,
  title,
  width,
  height,
}: ComponentPropsWithoutRef<"img">) {
  const safeSrc = safeImageUrl(src);
  if (!safeSrc) {
    return null;
  }

  const localMatch = LOCAL_IMAGE_VARIANT.exec(safeSrc);
  const originalSrc = localMatch
    ? `/api/uploads/images/${localMatch[1]}-original`
    : safeSrc;

  // The wrapper handles click/keyboard events through delegation.
  return (
    <img
      alt={typeof alt === "string" ? alt : ""}
      data-lightbox-src={originalSrc}
      decoding="async"
      height={numericDimension(height)}
      loading="lazy"
      role="button"
      src={safeSrc}
      tabIndex={0}
      title={typeof title === "string" ? title : undefined}
      width={numericDimension(width)}
    />
  );
}

async function compilePostMdx(source: string) {
  const toc: TocItem[] = [];
  const { content } = await compileMDX({
    source,
    components: {
      img: MdxImage,
      video: Video,
    },
    options: {
      blockJS: true,
      blockDangerousJS: true,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeAllowVideo,
          [rehypeSanitize, sanitizeSchema],
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: "wrap" }],
          createTocCollector(toc),
          [
            rehypeShiki,
            {
              themes: {
                light: "github-light",
                dark: "github-dark",
              },
              langs: [
                "text",
                "bash",
                "css",
                "html",
                "javascript",
                "json",
                "jsx",
                "markdown",
                "tsx",
                "typescript",
              ],
              defaultLanguage: "text",
              fallbackLanguage: "text",
            },
          ],
        ],
      },
    },
  });

  return { content, toc };
}

const compileCached = cache(compilePostMdx);

export async function renderMdx(source: string) {
  return (await compileCached(source)).content;
}

export async function extractToc(source: string): Promise<TocItem[]> {
  return [...(await compileCached(source)).toc];
}
