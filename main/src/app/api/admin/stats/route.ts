import { requireAdmin } from "@/lib/auth/guard";
import { handleAdminError, jsonData } from "@/lib/admin/http";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const [published, draft, scheduled, moments, pendingComments] =
      await Promise.all([
        prisma.post.count({ where: { status: "published" } }),
        prisma.post.count({ where: { status: "draft" } }),
        prisma.post.count({ where: { status: "scheduled" } }),
        prisma.moment.count(),
        prisma.comment.count({ where: { status: "pending" } }),
      ]);

    return jsonData({
      posts: { published, draft, scheduled },
      moments,
      pendingComments,
    });
  } catch (error) {
    return handleAdminError(error, "读取统计失败");
  }
}
