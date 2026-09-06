import { requireAdmin } from "@/lib/auth/guard";
import { isBackupRunning } from "@/lib/backup/backup";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { getSetting } from "@/lib/settings";
import { UpdateError } from "@/lib/update/errors";
import {
  importGithubUpdateRelease,
  listGithubUpdateReleases,
  parseGithubRepo,
  readConfiguredGithubRepo,
} from "@/lib/update/github";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    await requireAdmin();
    const configured = (await getSetting<string>("updateGithubRepo")) ?? "";
    const parsed = parseGithubRepo(configured);
    if (!parsed) {
      return jsonData({
        repo: configured,
        configured: false,
        releases: [],
      });
    }
    const repo = await readConfiguredGithubRepo();
    const releases = await listGithubUpdateReleases(repo.owner, repo.repo);
    return jsonData({
      repo: `${repo.owner}/${repo.repo}`,
      configured: true,
      releases,
    });
  } catch (error) {
    return handleAdminError(error, "检查 GitHub 更新失败");
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    if (isBackupRunning()) {
      throw new AdminHttpError("BACKUP_BUSY", "已有备份任务在进行", 409);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const tag =
      body && typeof body === "object" && "tag" in body
        ? String((body as { tag?: unknown }).tag ?? "")
        : "";
    if (!tag.trim()) {
      throw new UpdateError("VALIDATION_ERROR", "请选择一个版本", 400);
    }
    const imported = await importGithubUpdateRelease(tag);
    return jsonData(imported);
  } catch (error) {
    return handleAdminError(error, "从 GitHub 导入更新包失败");
  }
}
