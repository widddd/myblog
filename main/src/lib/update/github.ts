import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { getSetting } from "@/lib/settings";
import { UpdateError } from "@/lib/update/errors";
import { MAX_UPDATE_PACKAGE_BYTES } from "@/lib/update/files";
import { stageImportedUpdate } from "@/lib/update/import";

export type GithubUpdateRelease = {
  tag: string;
  name: string;
  publishedAt: string | null;
  prerelease: boolean;
  asset: {
    name: string;
    size: number;
    url: string;
  };
};

const GITHUB_API = "https://api.github.com";
const ASSET_NAME = /^myblog-update-.+\.tar\.gz$/i;

export function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const compact = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (compact?.[1] && compact[2]) {
    return { owner: compact[1], repo: compact[2].replace(/\.git$/i, "") };
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      return null;
    }
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/i, "").split("/");
    if (parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] };
    }
  } catch {
    return null;
  }
  return null;
}

export function isGithubUpdateAssetName(name: string): boolean {
  return ASSET_NAME.test(name) && !name.includes("/") && !name.includes("\\");
}

export async function readConfiguredGithubRepo(): Promise<{ owner: string; repo: string }> {
  const raw = (await getSetting<string>("updateGithubRepo")) ?? "";
  const parsed = parseGithubRepo(raw);
  if (!parsed) {
    throw new UpdateError(
      "VALIDATION_ERROR",
      "请先在设置里填写 GitHub 仓库，例如 owner/repo 或 https://github.com/owner/repo",
      400,
    );
  }
  return parsed;
}

async function githubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "myblog",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (response.status === 404) {
    throw new UpdateError("NOT_FOUND", "找不到该 GitHub 仓库或它不是公开库", 404);
  }
  if (response.status === 403 || response.status === 429) {
    throw new UpdateError(
      "RATE_LIMITED",
      "GitHub 接口限流，请稍后再点检查更新",
      429,
    );
  }
  if (!response.ok) {
    throw new UpdateError(
      "GITHUB_ERROR",
      `GitHub 返回 ${response.status}`,
      502,
    );
  }
  return (await response.json()) as T;
}

type GithubAssetJson = {
  name?: string;
  browser_download_url?: string;
  size?: number;
};

type GithubReleaseJson = {
  tag_name?: string;
  name?: string | null;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubAssetJson[];
};

function pickAsset(assets: GithubAssetJson[] | undefined): GithubUpdateRelease["asset"] | null {
  for (const asset of assets ?? []) {
    const name = asset.name?.trim() ?? "";
    const url = asset.browser_download_url?.trim() ?? "";
    if (!isGithubUpdateAssetName(name) || !url) {
      continue;
    }
    const size = Number(asset.size ?? 0);
    return { name, size: Number.isFinite(size) ? size : 0, url };
  }
  return null;
}

export async function listGithubUpdateReleases(
  owner: string,
  repo: string,
): Promise<GithubUpdateRelease[]> {
  const payload = await githubJson<GithubReleaseJson[]>(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=30`,
  );
  if (!Array.isArray(payload)) {
    throw new UpdateError("GITHUB_ERROR", "GitHub 返回的发行列表无法解析", 502);
  }
  const releases: GithubUpdateRelease[] = [];
  for (const item of payload) {
    if (item.draft || !item.tag_name) {
      continue;
    }
    const asset = pickAsset(item.assets);
    if (!asset) {
      continue;
    }
    releases.push({
      tag: item.tag_name,
      name: (item.name || item.tag_name).trim(),
      publishedAt: item.published_at ?? null,
      prerelease: Boolean(item.prerelease),
      asset,
    });
  }
  return releases;
}

export async function importGithubUpdateRelease(tag: string): Promise<{
  name: string;
  label?: string;
  fileCount?: number;
  size: number;
}> {
  const trimmed = tag.trim();
  if (!trimmed) {
    throw new UpdateError("VALIDATION_ERROR", "请选择一个版本", 400);
  }
  const repo = await readConfiguredGithubRepo();
  const releases = await listGithubUpdateReleases(repo.owner, repo.repo);
  const release = releases.find((item) => item.tag === trimmed);
  if (!release) {
    throw new UpdateError(
      "NOT_FOUND",
      "该版本没有匹配的 myblog-update-*.tar.gz 资产",
      404,
    );
  }
  if (release.asset.size > MAX_UPDATE_PACKAGE_BYTES) {
    throw new UpdateError(
      "VALIDATION_ERROR",
      `更新包不能超过 ${Math.floor(MAX_UPDATE_PACKAGE_BYTES / (1024 * 1024))} MB`,
      400,
    );
  }

  const tempPath = path.join(os.tmpdir(), `myblog-update-gh-${randomUUID()}.tar.gz`);
  try {
    const response = await fetch(release.asset.url, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "myblog",
      },
      redirect: "follow",
    });
    if (!response.ok || !response.body) {
      throw new UpdateError("GITHUB_ERROR", "下载 GitHub 更新包失败", 502);
    }
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tempPath));
    return await stageImportedUpdate(tempPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
