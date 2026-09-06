const globalForInstrumentation = globalThis as typeof globalThis & {
  myblogInstrumentationPromise?: Promise<void>;
};

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (!globalForInstrumentation.myblogInstrumentationPromise) {
    globalForInstrumentation.myblogInstrumentationPromise = (async () => {
      const { logger } = await import("@/lib/utils/logger");
      const { applyPendingRestore } = await import("@/lib/backup/restore");

      try {
        const { purgeExpiredPlainBackups } = await import("@/lib/backup/plain");
        await purgeExpiredPlainBackups();
      } catch (error) {
        logger.warn("清理过期非加密备份失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        await applyPendingRestore();
      } catch (error) {
        logger.error("预约恢复失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const [{ initializeApplication }, { registerScheduler }] =
        await Promise.all([
          import("@/lib/bootstrap"),
          import("@/lib/scheduler"),
        ]);

      try {
        await initializeApplication();
      } catch (error) {
        logger.error("应用初始化失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        registerScheduler();
      } catch (error) {
        logger.error("定时任务调度器注册失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }

  await globalForInstrumentation.myblogInstrumentationPromise;
}
