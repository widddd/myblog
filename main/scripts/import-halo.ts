/**
 * Halo 备份 → 本站导入（文章 / 瞬间 / 自定义页面 + 图片）。
 *
 * 数据来源 = `reference/encryptarticles/decode_backup.py` 产出的 `decoded/` 目录
 * （`articles/`、`moments/`、`images/manifest.json`、`upload/`）。
 *
 * 用法（在 main/ 下执行；缺省只预览，不改库不改盘）：
 *   npx tsx scripts/import-halo.ts --dir <decoded 目录>
 *   npx tsx scripts/import-halo.ts --dir <decoded 目录> --dump ./halo-dump     # 把转换结果写出来复核
 *   npx tsx scripts/import-halo.ts --dir <decoded 目录> --apply                # 真正导入
 *
 * 说明：
 * - 图片走 `lib/storage` 的 local 驱动落到 `data/uploads/images/original/{hh}/{hash}.{ext}`，
 *   并登记 `Upload` 行；缩略图走 `finalizeUpload(hash, "derivatives")`，配了 COS 再 `replicate`。
 * - 文章正文里的图片引用统一写成 `/api/uploads/<key>`（渲染时按 hash 自动换成缩略图/COS 地址）。
 * - 这里**不调用** `createAdminPost` / `createAdminMoment`：它们内部的 `revalidatePublicContent()`
 *   依赖 Next 请求上下文，在 CLI 里 `revalidatePath` 会抛
 *   `Invariant: static generation store missing`，见 docs/pitfalls.md P-114。
 *   因此导入完需要重启一次应用（公开页 60 秒缓存也跟着过期）。
 * - 幂等：图片按 hash 去重；文章按 slug、瞬间按 (createdAt, content) 判断是否已导入。
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { HaloArticle } from "../src/lib/posts/import-halo";

type Options = {
  dir: string;
  apply: boolean;
  dumpDir: string | null;
  withCos: boolean;
  includeDeleted: boolean;
  skipDrafts: boolean;
  skipPages: boolean;
  skipPosts: boolean;
  skipMoments: boolean;
  updatePosts: boolean;
  keepIndent: boolean;
};

const USAGE = `用法：npx tsx scripts/import-halo.ts --dir <decoded 目录> [选项]

选项：
  --apply             真正写库与写盘（缺省只预览，什么都不改）
  --dump <目录>       把转换后的 MDX / JSON 写到该目录，便于导入前复核
  --no-cos            只写本地，不把图片同步到 COS
  --include-deleted   连 Halo 里已删除的文章也导入（默认跳过）
  --skip-drafts       草稿不导入（默认按草稿导入）
  --skip-pages        不导入自定义页面（默认导入成后台「静态页面」）
  --skip-posts        只导瞬间
  --skip-moments      只导文章
  --update-posts      遇到同 slug 的文章时用 Halo 版本覆盖正文/封面/摘要/分类
  --keep-indent       保留原正文里 text-indent:2em 段落的缩进（默认交给站点样式）
  -h, --help          看这段说明`;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dir: "",
    apply: false,
    dumpDir: null,
    withCos: true,
    includeDeleted: false,
    skipDrafts: false,
    skipPages: false,
    skipPosts: false,
    skipMoments: false,
    updatePosts: false,
    keepIndent: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = () => {
      index += 1;
      const value = argv[index];
      if (!value) {
        throw new Error(`${arg} 需要一个值`);
      }
      return value;
    };
    switch (arg) {
      case "--dir":
        options.dir = next();
        break;
      case "--dump":
        options.dumpDir = next();
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--no-cos":
        options.withCos = false;
        break;
      case "--include-deleted":
        options.includeDeleted = true;
        break;
      case "--skip-drafts":
        options.skipDrafts = true;
        break;
      case "--skip-pages":
        options.skipPages = true;
        break;
      case "--skip-posts":
        options.skipPosts = true;
        break;
      case "--skip-moments":
        options.skipMoments = true;
        break;
      case "--update-posts":
        options.updatePosts = true;
        break;
      case "--keep-indent":
        options.keepIndent = true;
        break;
      case "-h":
      case "--help":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`不认识的参数：${arg}\n\n${USAGE}`);
    }
  }

  if (!options.dir) {
    throw new Error(`缺少 --dir\n\n${USAGE}`);
  }
  return options;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(date: Date | null): string {
  return date ? date.toISOString().replace("T", " ").slice(0, 19) + "Z" : "—";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // .env 里才有 DATABASE_URL 等；CLI 不经过 Next，得自己加载（Node ≥22 自带）
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env"));
  } catch {
    // 没有 .env 就用 data/blog.db 这个默认路径
  }

  const [
    { loadHaloBundle, convertHaloHtmlToMdx, uploadRefToFileName },
    { normalizePostContent },
    { prisma },
    { getDriver, originalMediaKey, thumbMediaKey, loadCosSettings, peekCosSettings, publicMediaUrl },
    { readImageDimensions },
    { finalizeUpload },
    { slugify },
    { allocatePublicId },
    { postHref },
    { getSetting },
  ] = await Promise.all([
    import("../src/lib/posts/import-halo"),
    import("../src/lib/posts/normalize-content"),
    import("../src/lib/db"),
    import("../src/lib/storage"),
    import("../src/lib/upload/compress"),
    import("../src/lib/uploads/finalize"),
    import("../src/lib/utils/slugify"),
    import("../src/lib/posts/public-id"),
    import("../src/lib/posts/path"),
    import("../src/lib/settings"),
  ]);
  const { fileTypeFromBuffer } = await import("file-type");

  const bundle = loadHaloBundle(options.dir);
  console.log(`读取 Halo 导出：${bundle.dir}`);
  for (const warning of bundle.warnings) {
    console.log(`  ⚠️  ${warning}`);
  }

  // ---------------------------------------------------------------- 选内容
  const skipped: string[] = [];
  const articles = bundle.articles.filter((article) => {
    if (article.deleted && !options.includeDeleted) {
      skipped.push(`文章《${article.title}》：Halo 里已删除`);
      return false;
    }
    if (article.kind === "SinglePage" && options.skipPages) {
      skipped.push(`页面《${article.title}》：--skip-pages`);
      return false;
    }
    if (article.kind === "Post" && options.skipPosts) {
      skipped.push(`文章《${article.title}》：--skip-posts`);
      return false;
    }
    if (!article.published && options.skipDrafts) {
      skipped.push(`文章《${article.title}》：草稿（--skip-drafts）`);
      return false;
    }
    if (!article.html.trim()) {
      skipped.push(`文章《${article.title}》：正文是空的（Halo 里没存过内容）`);
      return false;
    }
    return true;
  });
  const moments = options.skipMoments ? [] : bundle.moments;

  console.log(
    `  文章/页面：${articles.length} 篇导入（Post ${articles.filter((item) => item.kind === "Post").length} / 页面 ${articles.filter((item) => item.kind === "SinglePage").length}），瞬间：${moments.length} 条`,
  );
  for (const line of skipped) {
    console.log(`  ⏭  跳过 ${line}`);
  }

  // ---------------------------------------------------------------- 图片清单
  type ImagePlan = {
    refs: string[];
    fileName: string;
    sourcePath: string;
    usedBy: string[];
  };
  const plan = new Map<string, ImagePlan>();
  const missing: string[] = [];
  const refFileName = (ref: string) => uploadRefToFileName(ref);

  const registerRefs = (refs: string[], usedBy: string) => {
    for (const ref of refs) {
      const fileName = refFileName(ref);
      if (!fileName) {
        continue;
      }
      const existing = plan.get(fileName);
      if (existing) {
        existing.refs.push(ref);
        if (!existing.usedBy.includes(usedBy)) {
          existing.usedBy.push(usedBy);
        }
        continue;
      }
      const sourcePath = path.join(bundle.uploadDir, fileName);
      plan.set(fileName, { refs: [ref], fileName, sourcePath, usedBy: [usedBy] });
    }
  };

  for (const article of articles) {
    registerRefs(article.imageRefs, `文章《${article.title}》`);
  }
  for (const moment of moments) {
    registerRefs(moment.imageRefs, `瞬间 #${moment.index}`);
  }

  type PreparedImage = ImagePlan & {
    hash: string;
    key: string;
    thumb: string;
    mime: string;
    width: number | null;
    height: number | null;
    size: number;
    buffer: Buffer;
  };
  const prepared: PreparedImage[] = [];

  for (const item of plan.values()) {
    let buffer: Buffer;
    try {
      buffer = await readFile(item.sourcePath);
    } catch {
      missing.push(`${item.fileName}（被 ${item.usedBy.join("、")} 引用）`);
      continue;
    }
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !detected.mime.startsWith("image/")) {
      missing.push(`${item.fileName}（不是能识别的图片格式）`);
      continue;
    }
    const hash = createHash("sha256").update(buffer).digest("hex");
    const dimensions = await readImageDimensions(buffer, detected.mime);
    prepared.push({
      ...item,
      hash,
      key: originalMediaKey(hash, detected.mime, detected.ext),
      thumb: thumbMediaKey(hash),
      mime: detected.mime,
      width: dimensions.width,
      height: dimensions.height,
      size: buffer.length,
      buffer,
    });
  }

  console.log(`\n图片：${prepared.length} 张要导入`);
  for (const image of prepared) {
    console.log(
      `  ${image.fileName}  ${formatBytes(image.size)}  ${image.width ?? "?"}×${image.height ?? "?"}  →  ${image.key}`,
    );
    console.log(`      用于 ${image.usedBy.join("、")}`);
  }
  for (const item of missing) {
    console.log(`  ⚠️  找不到/不可用：${item}`);
  }

  const knownFiles = new Set([...prepared.map((image) => image.fileName)]);
  const allUploadNames = await readdirNames(bundle.uploadDir);
  const unused = allUploadNames.filter((name) => !knownFiles.has(name));
  if (unused.length > 0) {
    console.log(`  未导入（decoded/upload 里没人引用）：${unused.join("、")}`);
  }

  // ---------------------------------------------------------------- 转换正文
  // 封面与正文图走**两条不同的路**，这里必须先读一次 COS 配置：
  // - 正文图：渲染时 `lib/markdown/mdx.tsx` 按 hash 查 Upload，自动换成缩略图 / COS 直链 → 存 `/api/uploads/<原图 key>` 就行
  // - 封面：`components/common/CoverMedia.tsx` 把 Post.cover **原样**交给 next/image，没有任何改写
  //   → 必须像编辑器那样写「缩略图 + COS 感知」的地址（`editorImageUrl()` 的口径），
  //     否则封面会一直指回本机原图（3–5MB、还占服务器带宽）
  await loadCosSettings();

  const urlByFileName = new Map(
    prepared.map((image) => [image.fileName, `/api/uploads/${image.key}`]),
  );
  const resolveImage = (ref: string) => {
    const fileName = refFileName(ref);
    return fileName ? urlByFileName.get(fileName) ?? null : null;
  };

  const coverUrlByFileName = new Map(
    prepared.map((image) => [image.fileName, publicMediaUrl(image.thumb)]),
  );
  const resolveCover = (ref: string) => {
    const fileName = refFileName(ref);
    return fileName ? coverUrlByFileName.get(fileName) ?? null : null;
  };

  type PreparedArticle = HaloArticle & { cover: string | null; mdx: string; status: "published" | "draft" };
  const preparedArticles: PreparedArticle[] = articles.map((article) => {
    const mdx = normalizePostContent(
      convertHaloHtmlToMdx(article.html, resolveImage, { keepIndent: options.keepIndent }),
    );
    return {
      ...article,
      mdx,
      status: article.published ? "published" : "draft",
      cover: article.coverRef ? resolveCover(article.coverRef) : null,
    };
  });

  /** 自定义页面走「管理员内容面」：HTML 原样注入，这里只去掉 Halo 的百分号编码锚点 id、把图片换成站内地址 */
  const pageHtml = (article: PreparedArticle) =>
    article.html
      .replace(/\s+id\s*=\s*"%[^"]*"/gi, "")
      .replace(
        /(src|href)\s*=\s*"([^"]*upload\/[^"]*)"/gi,
        (whole, attribute: string, ref: string) => {
          const url = resolveImage(ref);
          return url ? `${attribute}="${url}"` : whole;
        },
      );

  for (const article of preparedArticles) {
    if (article.coverRef && !article.cover) {
      console.log(`  ⚠️  《${article.title}》封面引用对不上，已置空：${article.coverRef}`);
    }
    if (article.categories.length > 1) {
      console.log(
        `  ⚠️  《${article.title}》有多个分类（${article.categories.join("、")}），只取第一个`,
      );
    }
  }

  console.log(`\n文章转换预览：`);
  for (const article of preparedArticles) {
    const kind = article.kind === "SinglePage" ? "页面" : article.status === "published" ? "已发布" : "草稿";
    const images = article.imageRefs.length;
    console.log(
      `  [${kind}] 《${article.title}》 slug=${article.slug} 发布=${formatDate(article.publishedAt)} 分类=${article.categories[0] ?? "—"} 封面=${article.cover ? "有" : "—"} 图 ${images} 张 正文 ${article.mdx.length} 字`,
    );
    if (article.cover) {
      console.log(`       封面：${article.cover}`);
    }
  }

  console.log(`\n瞬间预览：`);
  for (const moment of moments) {
    const head = moment.content.replace(/\s+/g, " ").slice(0, 40);
    console.log(
      `  #${String(moment.index).padStart(2)} ${formatDate(moment.createdAt)} 图 ${moment.imageRefs.length} 张  ${head}${moment.content.length > 40 ? "…" : ""}`,
    );
  }

  // ---------------------------------------------------------------- dump
  if (options.dumpDir) {
    const outDir = path.resolve(options.dumpDir);
    await mkdir(path.join(outDir, "posts"), { recursive: true });
    await mkdir(path.join(outDir, "pages"), { recursive: true });
    for (const article of preparedArticles) {
      if (article.kind === "SinglePage") {
        await writeFile(
          path.join(outDir, "pages", `${article.slug}.html`),
          `${pageHtml(article)}\n`,
          "utf8",
        );
        continue;
      }
      await writeFile(path.join(outDir, "posts", `${article.slug}.mdx`), `${article.mdx}\n`, "utf8");
    }
    await writeFile(
      path.join(outDir, "posts.json"),
      `${JSON.stringify(
        preparedArticles.map((article) => ({
          kind: article.kind,
          title: article.title,
          slug: article.slug,
          status: article.status,
          publishedAt: article.publishedAt?.toISOString() ?? null,
          createdAt: article.createdAt?.toISOString() ?? null,
          excerpt: article.excerpt,
          cover: article.cover,
          categories: article.categories,
          mdxFile: `posts/${article.slug}.mdx`,
        })),
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      path.join(outDir, "moments.json"),
      `${JSON.stringify(
        moments.map((moment) => {
          const images = moment.imageRefs
            .map((ref) => {
              const fileName = refFileName(ref);
              const image = prepared.find((item) => item.fileName === fileName);
              return image
                ? {
                    key: image.key,
                    thumb: image.thumb,
                    width: image.width ?? undefined,
                    height: image.height ?? undefined,
                  }
                : null;
            })
            .filter(Boolean);
          return {
            index: moment.index,
            createdAt: moment.createdAt?.toISOString() ?? null,
            content: moment.content,
            images,
          };
        }),
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      path.join(outDir, "images.json"),
      `${JSON.stringify(
        prepared.map((image) => ({
          file: image.fileName,
          hash: image.hash,
          key: image.key,
          thumb: image.thumb,
          mime: image.mime,
          width: image.width,
          height: image.height,
          size: image.size,
          usedBy: image.usedBy,
        })),
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(
      `\n转换结果已写到 ${outDir}（posts/*.mdx、pages/*.html、posts.json、moments.json、images.json）`,
    );
  }

  if (!options.apply) {
    console.log(
      `\n预览结束：没有改动任何数据。确认无误后加 --apply 真正导入（会写库与 data/uploads）。`,
    );
    await prisma.$disconnect();
    return;
  }

  // ---------------------------------------------------------------- 写图片
  console.log(`\n开始导入图片…`);
  await loadCosSettings();
  const local = getDriver("local");
  const cosConfigured = Boolean(peekCosSettings()) && options.withCos;
  let imageOk = 0;
  const failedImages: string[] = [];
  for (const image of prepared) {
    try {
      const existing = await prisma.upload.findUnique({ where: { hash: image.hash } });
      if (!existing) {
        await prisma.upload.create({
          data: {
            hash: image.hash,
            driver: "local",
            key: image.key,
            mime: image.mime,
            width: image.width,
            height: image.height,
            size: image.size,
            variants: "{}",
          },
        });
      }
      await local.put(image.key, image.buffer);
      await finalizeUpload(image.hash, "derivatives");
      if (cosConfigured) {
        await finalizeUpload(image.hash, "replicate");
      }
      imageOk += 1;
    } catch (error) {
      failedImages.push(
        `${image.fileName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  console.log(
    `  图片完成 ${imageOk}/${prepared.length}${cosConfigured ? "（含同步 COS）" : "（仅本地）"}`,
  );
  for (const line of failedImages) {
    console.log(`  ⚠️  ${line}`);
  }

  // ---------------------------------------------------------------- 分类 / 标签
  const categoryIdByName = new Map<string, number>();
  for (const article of preparedArticles) {
    const name = article.categories[0];
    if (!name || categoryIdByName.has(name)) {
      continue;
    }
    const slug = slugify(name) || `category-${categoryIdByName.size + 1}`;
    const row = await prisma.category.upsert({
      where: { slug },
      create: { slug, name },
      update: {},
    });
    categoryIdByName.set(name, row.id);
  }

  const tagIdByName = new Map<string, number>();
  for (const article of preparedArticles) {
    for (const name of article.tags) {
      if (tagIdByName.has(name)) {
        continue;
      }
      const slug = slugify(name) || `tag-${tagIdByName.size + 1}`;
      const row = await prisma.tag.upsert({
        where: { slug },
        create: { slug, name },
        update: {},
      });
      tagIdByName.set(name, row.id);
    }
  }

  // ---------------------------------------------------------------- 文章
  let postCreated = 0;
  let postUpdated = 0;
  const postSkipped: string[] = [];
  const createdPostHrefs: string[] = [];
  for (const article of preparedArticles) {
    if (article.kind === "SinglePage") {
      continue;
    }
    const existing = await prisma.post.findUnique({ where: { slug: article.slug } });
    const categoryId = article.categories[0]
      ? categoryIdByName.get(article.categories[0]) ?? null
      : null;

    if (existing) {
      if (!options.updatePosts) {
        postSkipped.push(`《${article.title}》（slug 已存在）`);
        continue;
      }
      await prisma.post.update({
        where: { id: existing.id },
        data: {
          title: article.title,
          content: article.mdx,
          excerpt: article.excerpt,
          cover: article.cover,
          categoryId,
        },
      });
      postUpdated += 1;
      continue;
    }

    const created = await prisma.post.create({
      data: {
        publicId: await allocatePublicId(),
        slug: article.slug,
        title: article.title,
        content: article.mdx,
        excerpt: article.excerpt,
        cover: article.cover,
        bannerStyle: "cover",
        status: article.status,
        publishedAt: article.publishedAt,
        createdAt: article.createdAt ?? undefined,
        categoryId,
        tags: article.tags.length
          ? {
              create: article.tags
                .map((name) => tagIdByName.get(name))
                .filter((id): id is number => typeof id === "number")
                .map((tagId) => ({ tagId })),
            }
          : undefined,
      },
      select: { publicId: true, slug: true },
    });
    createdPostHrefs.push(
      `${article.title} → ${postHref(created)}${article.status === "draft" ? "（草稿，前台不可见）" : ""}`,
    );
    postCreated += 1;
  }

  // ---------------------------------------------------------------- 自定义页面
  let pageCreated = 0;
  const pageSkipped: string[] = [];
  for (const article of preparedArticles) {
    if (article.kind !== "SinglePage") {
      continue;
    }
    try {
      const existing = await prisma.staticPage.findUnique({ where: { slug: article.slug } });
      if (existing) {
        pageSkipped.push(`《${article.title}》（slug 已存在）`);
        continue;
      }
      // 静态页面是"管理员内容面"，HTML 直接注入：这里只把 Halo 的锚点 id 与图片地址换掉
      const html = pageHtml(article);
      await prisma.staticPage.create({
        data: {
          slug: article.slug,
          title: article.title,
          description: article.excerpt ?? "",
          html,
        },
      });
      pageCreated += 1;
    } catch (error) {
      pageSkipped.push(
        `《${article.title}》（${error instanceof Error ? error.message : String(error)}）`,
      );
    }
  }

  // ---------------------------------------------------------------- 瞬间
  let momentCreated = 0;
  let momentSkipped = 0;
  for (const moment of moments) {
    const images = moment.imageRefs
      .map((ref) => {
        const fileName = refFileName(ref);
        const image = prepared.find((item) => item.fileName === fileName);
        return image
          ? {
              key: image.key,
              thumb: image.thumb,
              width: image.width ?? undefined,
              height: image.height ?? undefined,
            }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const createdAt = moment.createdAt ?? new Date();
    const existing = await prisma.moment.findFirst({
      where: { createdAt, content: moment.content },
      select: { id: true },
    });
    if (existing) {
      momentSkipped += 1;
      continue;
    }
    await prisma.moment.create({
      data: {
        content: moment.content,
        images: JSON.stringify(images),
        createdAt,
      },
    });
    momentCreated += 1;
  }

  // ---------------------------------------------------------------- 收尾
  const momentVisibleDays = await getSetting<number>("momentVisibleDays");
  console.log(`\n导入结果：`);
  console.log(`  图片：${imageOk} 张（失败 ${failedImages.length}）`);
  console.log(`  文章：新建 ${postCreated}、覆盖 ${postUpdated}、跳过 ${postSkipped.length}`);
  for (const line of postSkipped) {
    console.log(`    ⏭  ${line}`);
  }
  console.log(`  页面：新建 ${pageCreated}、跳过 ${pageSkipped.length}`);
  for (const line of pageSkipped) {
    console.log(`    ⏭  ${line}`);
  }
  console.log(`  瞬间：新建 ${momentCreated}、已存在 ${momentSkipped}`);
  if (createdPostHrefs.length > 0) {
    console.log(`\n新建文章的前台地址：`);
    for (const line of createdPostHrefs) {
      console.log(`  ${line}`);
    }
  }
  console.log(`\n还要做两件事：`);
  console.log(`  1. 重启应用（pm2 restart myblog）：导入是直接写库，公开页的 60 秒缓存要等下一次请求才刷新`);
  console.log(
    `  2. 瞬间全局可见期当前是 ${momentVisibleDays === 0 ? "永久（0）" : `${momentVisibleDays} 天`}` +
      (momentVisibleDays === 0
        ? "，导入的历史瞬间都看得到"
        : "，2025 年的历史瞬间会被判为已过期 → 后台设置里改成永久"),
  );

  await prisma.$disconnect();
}

async function readdirNames(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return [];
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
