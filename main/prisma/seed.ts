import { initializeApplication } from "../src/lib/bootstrap";
import { hashPassword } from "../src/lib/auth/password";
import { prisma } from "../src/lib/db";
import { getSetting, setSetting } from "../src/lib/settings";
import { logger } from "../src/lib/utils/logger";

const DEMO_LOCK_PASSWORD = "demo-lock";

const CATEGORIES = [
  { slug: "notes", name: "随笔" },
  { slug: "tech", name: "技术" },
  { slug: "life", name: "生活" },
] as const;

const TAGS = [
  { slug: "nextjs", name: "Next.js" },
  { slug: "design", name: "设计" },
  { slug: "diary", name: "日记" },
  { slug: "sqlite", name: "SQLite" },
  { slug: "heo", name: "Heo" },
] as const;

type SeedPost = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  status: "draft" | "scheduled" | "published";
  pinned?: boolean;
  recommend?: boolean;
  password?: string;
  publishedAt: Date;
  category: (typeof CATEGORIES)[number]["slug"];
  tags: Array<(typeof TAGS)[number]["slug"]>;
  views: number;
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function daysLater(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

const POSTS: SeedPost[] = [
  {
    slug: "welcome",
    title: "欢迎来到 MyBlog",
    excerpt: "这是站点的第一篇文章：记录思考，也记录生活。",
    content: `# 欢迎来到 MyBlog

这是演示数据里的开篇文章。正文将在 MDX sanitize 管线接入后渲染。

- 圆角卡片
- 毛玻璃导航
- 深浅双主题

<Video src="/api/uploads/welcome.mp4" />
`,
    status: "published",
    pinned: true,
    recommend: true,
    publishedAt: daysAgo(1),
    category: "notes",
    tags: ["heo", "diary"],
    views: 128,
  },
  {
    slug: "glass-and-color",
    title: "玻璃拟态与 Heo 色彩",
    excerpt: "浅色主色 #425AEF，深色主色 #ffc848。卡片 12px 圆角、细边框、轻阴影。",
    content: `# 玻璃拟态与 Heo 色彩

Heo 的标志不是把整页做成透明，而是：导航 saturate(180%) blur(20px)，卡片实底加细边框，封面 hover 时 scale(1.1)。

深浅主题用不同色相，不要把深色主色误做成浅色蓝的变体。
`,
    status: "published",
    recommend: true,
    publishedAt: daysAgo(3),
    category: "tech",
    tags: ["design", "heo"],
    views: 86,
  },
  {
    slug: "windows-next-16",
    title: "在 Windows 上跑 Next 16",
    excerpt: "路径用 node:path，存储 key 用 posix，原生依赖必须有 Windows prebuilt。",
    content: `# 在 Windows 上跑 Next 16

开发机是 Win11。不要写 \`split('\\\\')\`，不要假设 tar 在 PATH 里。
`,
    status: "published",
    publishedAt: daysAgo(6),
    category: "tech",
    tags: ["nextjs"],
    views: 54,
  },
  {
    slug: "autumn-note",
    title: "一篇写给秋天的短记",
    excerpt: "风把阳台的绿萝吹得侧过去，像在认真听什么。",
    content: `# 一篇写给秋天的短记

风把阳台的绿萝吹得侧过去。晚饭后走路回家，路灯把影子拉得很长。
`,
    status: "published",
    publishedAt: daysAgo(9),
    category: "life",
    tags: ["diary"],
    views: 41,
  },
  {
    slug: "sqlite-single-writer",
    title: "SQLite 单写者笔记",
    excerpt: "pm2 只允许 fork 单实例。备份只用 better-sqlite3 的 .backup()。",
    content: `# SQLite 单写者笔记

cluster 多进程写同一 db 会损坏数据。备份禁止直接拷文件。
`,
    status: "published",
    publishedAt: daysAgo(12),
    category: "tech",
    tags: ["sqlite", "nextjs"],
    views: 73,
  },
  {
    slug: "cards-and-radius",
    title: "卡片、圆角与细边框",
    excerpt: "hover 时边框变主色，封面放大。动效以 CSS transition 为主。",
    content: `# 卡片、圆角与细边框

不要引入重量级动画库。slide-in 错峰入场即可。
`,
    status: "published",
    publishedAt: daysAgo(18),
    category: "notes",
    tags: ["design", "heo"],
    views: 35,
  },
  {
    slug: "locked-garden",
    title: "上锁的园子",
    excerpt: "这段摘要不应出现在前台任何投影里。",
    content: `# 上锁的园子

这是密码文章正文，未解锁前任何接口与页面都不得返回这段文字。

密码（仅演示环境）：\`${DEMO_LOCK_PASSWORD}\`
`,
    status: "published",
    password: DEMO_LOCK_PASSWORD,
    publishedAt: daysAgo(4),
    category: "notes",
    tags: ["diary"],
    views: 19,
  },
  {
    slug: "scheduled-preview",
    title: "定时发布的预告",
    excerpt: "这篇文章还没到点，前台不应可见。",
    content: `# 定时发布的预告

scheduler 接入后才会把状态翻成 published。即便 scheduler 未跑，前台查询也必须带 publishedAt<=now。
`,
    status: "scheduled",
    publishedAt: daysLater(30),
    category: "tech",
    tags: ["nextjs"],
    views: 0,
  },
  {
    slug: "unfinished-draft",
    title: "还没写完的草稿",
    excerpt: "草稿只存在后台。",
    content: `# 还没写完的草稿

前台 404。
`,
    status: "draft",
    publishedAt: daysAgo(2),
    category: "life",
    tags: ["diary"],
    views: 0,
  },
  {
    slug: "sanitize-probe",
    title: "渲染安全探针",
    excerpt: "用于验收 rehype-sanitize：脚本与事件属性必须被剥掉，Video 标签可以存活。",
    content: `# 渲染安全探针

<script>alert(1)</script>

[bad](javascript:alert(1))

<img src="x" onerror="alert(1)" />

<Video src="https://example.com/demo.mp4" onerror="alert(1)" />
`,
    status: "published",
    publishedAt: daysAgo(21),
    category: "tech",
    tags: ["nextjs"],
    views: 12,
  },
];

async function seedTaxonomy() {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name },
    });
  }

  for (const tag of TAGS) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      create: tag,
      update: { name: tag.name },
    });
  }
}

async function seedPosts() {
  if ((await prisma.post.count()) > 0) {
    logger.info("已有文章，跳过演示文章 seed");
    return;
  }

  const categories = Object.fromEntries(
    (await prisma.category.findMany()).map((item) => [item.slug, item.id]),
  );
  const tags = Object.fromEntries(
    (await prisma.tag.findMany()).map((item) => [item.slug, item.id]),
  );

  for (const post of POSTS) {
    const passwordHash = post.password
      ? await hashPassword(post.password)
      : null;

    const created = await prisma.post.create({
      data: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        status: post.status,
        pinned: post.pinned ?? false,
        recommend: post.recommend ?? false,
        passwordHash,
        publishedAt: post.publishedAt,
        views: post.views,
        categoryId: categories[post.category],
      },
    });

    await prisma.postTag.createMany({
      data: post.tags.map((tagSlug) => ({
        postId: created.id,
        tagId: tags[tagSlug],
      })),
    });
  }

  logger.info("演示文章已写入", { count: POSTS.length });
}

async function seedMoments() {
  if ((await prisma.moment.count()) > 0) {
    return;
  }

  await prisma.moment.createMany({
    data: [
      {
        content: "把导航做成毛玻璃之后，首页的天空终于透过来了。",
        images: "[]",
        createdAt: daysAgo(2),
      },
      {
        content: "今晚只写骨架，难的部分留给下一班。",
        images: "[]",
        createdAt: daysAgo(1),
      },
    ],
  });
}

async function seedAnnouncement() {
  const announcement = await getSetting<string>("announcement");
  if (announcement) {
    return;
  }

  await setSetting(
    "announcement",
    "欢迎来到 MyBlog。前台骨架已接入，正文渲染、上传与密码解锁仍待完成。",
  );
}

async function main() {
  await initializeApplication();
  await seedTaxonomy();
  await seedPosts();
  await seedMoments();
  await seedAnnouncement();
  logger.info("Prisma seed 完成");
}

main()
  .catch((error) => {
    logger.error("Prisma seed 失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
