/* eslint-disable @next/next/no-img-element */

import type { ComponentPropsWithoutRef } from "react";
import { cache } from "react";
import rehypeShiki from "@shikijs/rehype";
import { compileMDX } from "next-mdx-remote/rsc";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { Audio } from "@/components/post/Audio";
import { Video } from "@/components/post/Video";
import { prisma } from "@/lib/db";
import { loadCosSettings, localUploadUrl, publicMediaUrl } from "@/lib/storage";
import { parseVariants } from "@/lib/upload/handle";
import { collectMediaHashes } from "@/lib/uploads/hashes";

import { rehypeAllowVideo, sanitizeSchema } from "./sanitize";
import { createTocCollector, type TocItem } from "./toc";

export type { TocItem } from "./toc";

const ANY_HASH = /([a-f0-9]{64})/;

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

function createMdxImage(
  originals: Map<string, string>,
  thumbs: Map<string, string>,
  keys: Map<string, string>,
) {
  return function MdxImage({
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

    const hash = ANY_HASH.exec(safeSrc)?.[1];
    const displaySrc = (hash && thumbs.get(hash)) || safeSrc;
    const originalSrc = (hash && originals.get(hash)) || displaySrc;
    const storageKey = hash ? keys.get(hash) : undefined;

    return (
      <img
        alt={typeof alt === "string" ? alt : ""}
        data-lightbox-key={storageKey}
        data-lightbox-src={originalSrc}
        data-lightbox-thumb={displaySrc}
        decoding="async"
        height={numericDimension(height)}
        loading="lazy"
        role="button"
        src={displaySrc}
        tabIndex={0}
        title={typeof title === "string" ? title : undefined}
        width={numericDimension(width)}
      />
    );
  };
}

async function loadMediaUrls(source: string): Promise<{
  originals: Map<string, string>;
  thumbs: Map<string, string>;
  keys: Map<string, string>;
}> {
  const unique = collectMediaHashes(source);
  const originals = new Map<string, string>();
  const thumbs = new Map<string, string>();
  const keys = new Map<string, string>();
  if (unique.length === 0) {
    return { originals, thumbs, keys };
  }

  await loadCosSettings();
  const rows = await prisma.upload.findMany({
    where: { hash: { in: unique } },
    select: { hash: true, key: true, variants: true, driver: true, mime: true },
  });
  for (const row of rows) {
    keys.set(row.hash, row.key);
    const variants = parseVariants(row.variants);
    const pending = row.mime.startsWith("image/")
      ? !variants.thumb
      : row.driver !== "cos" && row.driver !== "oss";
    const originalHref = pending
      ? localUploadUrl(row.key)
      : (() => {
          try {
            return publicMediaUrl(row.key);
          } catch {
            return localUploadUrl(row.key);
          }
        })();
    originals.set(row.hash, originalHref);
    const thumbKey = variants.thumb?.key;
    if (thumbKey) {
      try {
        thumbs.set(
          row.hash,
          pending ? localUploadUrl(thumbKey) : publicMediaUrl(thumbKey),
        );
      } catch {
        thumbs.set(row.hash, localUploadUrl(thumbKey));
      }
    }
  }
  return { originals, thumbs, keys };
}

async function compilePostMdx(source: string) {
  const toc: TocItem[] = [];
  const { originals, thumbs, keys } = await loadMediaUrls(source);
  const { content } = await compileMDX({
    source,
    components: {
      img: createMdxImage(originals, thumbs, keys),
      video: Video,
      audio: Audio,
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
