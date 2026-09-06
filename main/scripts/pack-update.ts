import path from "node:path";

import { packAppFromGitRef, packCurrentApp, packCurrentAppTo } from "../src/lib/update/pack";
import { logger } from "../src/lib/utils/logger";

function parseFlag(argv: string[], name: string): string | undefined {
  const long = `--${name}`;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === long || argv[i] === `-${name[0]}`) {
      return argv[i + 1];
    }
    if (argv[i]?.startsWith(`${long}=`)) {
      return argv[i].slice(`${long}=`.length);
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const out = parseFlag(argv, "out");
  const gitRef = parseFlag(argv, "git");

  if (gitRef) {
    if (out) {
      const dest = path.resolve(process.cwd(), out);
      const packed = await packAppFromGitRef(gitRef, dest);
      logger.info("已从 git 打包程序更新包", {
        ref: gitRef,
        path: dest,
        files: packed.fileCount,
        size: packed.size,
      });
      return;
    }
    const packed = await packAppFromGitRef(gitRef);
    logger.info("已从 git 打包程序更新包", {
      ref: gitRef,
      name: "name" in packed ? packed.name : undefined,
      files: packed.fileCount,
      size: packed.size,
    });
    return;
  }

  if (out) {
    const dest = path.resolve(process.cwd(), out);
    const packed = await packCurrentAppTo(dest);
    logger.info("已打包程序更新包", {
      path: dest,
      files: packed.fileCount,
      size: packed.size,
    });
    return;
  }
  const packed = await packCurrentApp();
  logger.info("已打包程序更新包", {
    name: packed.name,
    files: packed.fileCount,
    size: packed.size,
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
