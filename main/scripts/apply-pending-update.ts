import { applyPendingUpdate } from "../src/lib/update/apply";
import { logger } from "../src/lib/utils/logger";

async function main(): Promise<void> {
  const mode = process.argv[2] === "start" ? "start" : "dev";
  const result = await applyPendingUpdate({ mode });
  if (result.status === "failed") {
    logger.error("预约更新未完成", { error: result.error, name: result.name });
    process.exit(1);
  }
  if (result.status === "ok") {
    logger.info("预约更新已写入当前程序", { name: result.name });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
