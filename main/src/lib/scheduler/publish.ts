import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/utils/logger";

export async function scanScheduledPosts(): Promise<number> {
  const now = new Date();
  const due = await prisma.post.findMany({
    where: {
      status: "scheduled",
      publishedAt: { lte: now },
    },
    select: { id: true, slug: true },
  });

  if (due.length === 0) {
    return 0;
  }

  await prisma.post.updateMany({
    where: { id: { in: due.map((post) => post.id) } },
    data: { status: "published" },
  });

  try {
    revalidatePublicContent();
    for (const post of due) {
      revalidatePublicContent(post.slug);
    }
  } catch (error) {
    logger.warn("定时发布后刷新缓存失败", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info("定时发布：已上线文章", { count: due.length });
  return due.length;
}
