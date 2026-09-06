import path from "node:path";

import { stageAndQueueUpdate } from "../src/lib/update/import";
import { applyPendingUpdate } from "../src/lib/update/apply";
import { logger } from "../src/lib/utils/logger";

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function readOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index >= 0) {
    return argv[index + 1];
  }
  const prefixed = argv.find((item) => item.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(`${name}=`.length) : undefined;
}

function printUsage(): void {
  console.error(
    "用法：\n  pnpm apply-update --file ./myblog-update-xxx.tar.gz\n  pnpm apply-update --pending [--start]",
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const file = readOption(argv, "--file");
  if (file) {
    const sourcePath = path.resolve(process.cwd(), file);
    const staged = await stageAndQueueUpdate(sourcePath);
    logger.info("已预约程序更新，站点仍在跑；重启后才会覆盖程序文件", {
      name: staged.name,
      label: staged.label,
    });
    console.log(`已预约「${staged.name}」。请执行：pm2 restart myblog`);
    return;
  }

  if (!hasFlag(argv, "--pending")) {
    printUsage();
    process.exit(1);
  }

  const mode = hasFlag(argv, "--start") ? "start" : "dev";
  const result = await applyPendingUpdate({
    mode,
    cwd: path.resolve(process.cwd()),
  });
  if (result.status === "skipped") {
    logger.info("没有到期的预约更新");
    return;
  }
  if (result.status === "failed") {
    logger.error("应用更新失败", { error: result.error });
    process.exit(1);
  }
  logger.info("更新已完成", { name: result.name });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
