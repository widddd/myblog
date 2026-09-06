import { createHash } from "node:crypto";
import { cp, readFile, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { isNodeNotFoundError } from "@/lib/backup/errors";
import { extractUpdateArchive } from "@/lib/update/extract";
import { resolveUpdatePath } from "@/lib/update/files";
import { overlayUpdateFiles } from "@/lib/update/overlay";
import {
  cancelPendingUpdate,
  isPendingUpdateDue,
  readPendingUpdate,
  writeUpdateState,
  type UpdateApplyState,
} from "@/lib/update/pending";
import { logger } from "@/lib/utils/logger";

export type ApplyMode = "dev" | "start";

export type ApplyOptions = {
  cwd?: string;
  mode?: ApplyMode;
  now?: number;
  skipInstall?: boolean;
  skipMigrate?: boolean;
  skipBuild?: boolean;
};

async function hashFile(filePath: string): Promise<string | null> {
  try {
    const data = await readFile(filePath);
    return createHash("sha256").update(data).digest("hex");
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function resolvePnpm(): { command: string; prefix: string[]; shell: boolean } {
  const execPath = process.env.npm_execpath;
  if (execPath && execPath.toLowerCase().includes("pnpm")) {
    return { command: process.execPath, prefix: [execPath], shell: false };
  }
  if (process.platform === "win32") {
    return { command: "pnpm.cmd", prefix: [], shell: true };
  }
  return { command: "pnpm", prefix: [], shell: false };
}

function runLogged(
  command: string,
  args: string[],
  cwd: string,
  options: { shell?: boolean; extraEnv?: NodeJS.ProcessEnv } = {},
): { ok: boolean; output: string } {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...options.extraEnv },
    encoding: "utf8",
    windowsHide: true,
    shell: options.shell ?? false,
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.error) {
    return { ok: false, output: result.error.message };
  }
  if (result.status !== 0) {
    return { ok: false, output: output || `exit ${result.status}` };
  }
  return { ok: true, output };
}

export async function applyPendingUpdate(
  options: ApplyOptions = {},
): Promise<UpdateApplyState> {
  const cwd = options.cwd ?? process.cwd();
  const mode = options.mode ?? "dev";
  const pending = await readPendingUpdate();
  if (!pending || !isPendingUpdateDue(pending, options.now)) {
    return { status: "skipped" };
  }

  const name = pending.name;
  logger.info("开始应用程序更新", { name, mode });

  let extractedDir: string | undefined;
  try {
    const archivePath = resolveUpdatePath(name);
    const prevPkg = await hashFile(path.join(cwd, "package.json"));
    const prevLock = await hashFile(path.join(cwd, "pnpm-lock.yaml"));

    const extracted = await extractUpdateArchive(archivePath);
    extractedDir = extracted.stagingDir;
    const overlay = await overlayUpdateFiles(extracted.stagingDir, extracted.files, cwd);

    const nextPkg = await hashFile(path.join(cwd, "package.json"));
    const nextLock = await hashFile(path.join(cwd, "pnpm-lock.yaml"));
    let installed = false;
    if (
      !options.skipInstall &&
      (prevPkg !== nextPkg || prevLock !== nextLock)
    ) {
      logger.info("依赖有变化，开始 pnpm install");
      const pnpm = resolvePnpm();
      const install = runLogged(
        pnpm.command,
        [...pnpm.prefix, "install", "--frozen-lockfile"],
        cwd,
        { shell: pnpm.shell },
      );
      if (!install.ok) {
        throw new Error(`安装依赖失败：${install.output.slice(0, 2000)}`);
      }
      installed = true;
    }

    let migrated = false;
    if (!options.skipMigrate) {
      const prismaCli = path.join(cwd, "node_modules", "prisma", "build", "index.js");
      const migrate = runLogged(process.execPath, [prismaCli, "migrate", "deploy"], cwd);
      if (!migrate.ok) {
        throw new Error(`数据库迁移失败：${migrate.output.slice(0, 2000)}`);
      }
      migrated = true;
    }

    let built = false;
    if (mode === "start" && !options.skipBuild) {
      const nextDir = path.join(cwd, ".next");
      const backupDir = path.join(cwd, ".next.bak");
      try {
        await rm(backupDir, { recursive: true, force: true });
        try {
          await stat(nextDir);
          await cp(nextDir, backupDir, { recursive: true, force: true });
        } catch (error) {
          if (!isNodeNotFoundError(error)) {
            throw error;
          }
        }
      } catch (error) {
        logger.warn("备份旧构建产物失败，仍尝试构建", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
      const build = runLogged(process.execPath, [nextBin, "build"], cwd, {
        extraEnv: {
          NODE_ENV: "production",
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=768"]
            .filter(Boolean)
            .join(" "),
        },
      });
      if (!build.ok) {
        try {
          await stat(backupDir);
          await rm(nextDir, { recursive: true, force: true });
          await cp(backupDir, nextDir, { recursive: true, force: true });
        } catch {
          // keep broken .next if no backup
        }
        throw new Error(`生产构建失败：${build.output.slice(0, 2000)}`);
      }
      await rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
      built = true;
    }

    await cancelPendingUpdate();
    const state: UpdateApplyState = {
      status: "ok",
      name,
      appliedAt: new Date().toISOString(),
      copied: overlay.copied,
      removed: overlay.removed,
      installed,
      migrated,
      built,
    };
    await writeUpdateState(state);
    logger.info("程序更新已完成", {
      name,
      copied: overlay.copied,
      removed: overlay.removed,
      installed,
      migrated,
      built,
    });
    return state;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("程序更新失败", { name, error: message });
    const state: UpdateApplyState = {
      status: "failed",
      name,
      appliedAt: new Date().toISOString(),
      error: message,
    };
    await writeUpdateState(state);
    return state;
  } finally {
    if (extractedDir) {
      await rm(extractedDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
