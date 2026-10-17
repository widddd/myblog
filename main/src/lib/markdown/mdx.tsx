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
import { ImageGroupView } from "@/components/post/ImageGroupView";
import { Video } from "@/components/post/Video";
import { albumHref } from "@/lib/albums/path";
import { prisma } from "@/lib/db";
import { loadCosSettings, localUploadUrl, publicMediaUrl } from "@/lib/storage";
import { parseVariants } from "@/lib/upload/handle";
import { collectMediaHashes } from "@/lib/uploads/hashes";

import { rehypeImageGroups } from "./image-group";
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
  albums: Map<string, { href: string; title: string }>,
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
    // 图属于某个**启用中**的相册时，灯箱右下角会出现「查看相册」；没有相册就没有这个按钮。
    // 数据来自服务端这一次 Upload 查询（零额外请求），且只由本组件在 sanitize 之后注入 ——
    // 正文源码里手写的同名属性会被 sanitize 剥掉。
    const album = hash ? albums.get(hash) : undefined;

    return (
      <img
        alt={typeof alt === "string" ? alt : ""}
        data-lightbox-album={album?.href}
        data-lightbox-album-title={album?.title}
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
  albums: Map<string, { href: string; title: string }>;
}> {
  const unique = collectMediaHashes(source);
  const originals = new Map<string, string>();
  const thumbs = new Map<string, string>();
  const keys = new Map<string, string>();
  const albums = new Map<string, { href: string; title: string }>();
  if (unique.length === 0) {
    return { originals, thumbs, keys, albums };
  }

  await loadCosSettings();
  const rows = await prisma.upload.findMany({
    where: { hash: { in: unique } },
    select: {
      hash: true,
      key: true,
      variants: true,
      driver: true,
      mime: true,
      // 相册归属顺带带出来（灯箱的「查看相册」用它，见 docs/albums-spec.md §3.8）
      album: { select: { slug: true, title: true, enabled: true } },
    },
  });
  for (const row of rows) {
    keys.set(row.hash, row.key);
    if (row.album?.enabled) {
      albums.set(row.hash, {
        href: albumHref(row.album.slug),
        title: row.album.title,
      });
    }
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
  return { originals, thumbs, keys, albums };
}

async function compilePostMdx(source: string) {
  const toc: TocItem[] = [];
  const { originals, thumbs, keys, albums } = await loadMediaUrls(source);
  const { content } = await compileMDX({
    source,
    components: {
      img: createMdxImage(originals, thumbs, keys, albums),
      video: Video,
      audio: Audio,
      // 折叠组：`rehypeImageGroups` 转出来的元素（**大写标签名**才走组件分支，
      // 小写标签会被 MDX 当成"显式 JSX 的 HTML 标签"跳过映射，见 image-group.ts 文件头）。
      // `details` 是兜底：万一有人手写 <details class="post-image-group">，也交给同一个组件。
      ImageGroup: ImageGroupView,
      details: ImageGroupView,
    },
    options: {
      blockJS: true,
      blockDangerousJS: true,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          // 折叠组必须在 sanitize **之前**把 <ImageGroup> 变成真元素：
          // 认不出的节点类型会被 rehype-sanitize 整棵丢掉（正文里静默消失，无报错）。
          rehypeImageGroups,
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
