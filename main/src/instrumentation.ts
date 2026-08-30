const globalForInstrumentation = globalThis as typeof globalThis & {
  myblogInstrumentationPromise?: Promise<void>;
};

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (!globalForInstrumentation.myblogInstrumentationPromise) {
    globalForInstrumentation.myblogInstrumentationPromise = (async () => {
      const [{ initializeApplication }, { registerScheduler }, { logger }] =
        await Promise.all([
          import("@/lib/bootstrap"),
          import("@/lib/scheduler"),
          import("@/lib/utils/logger"),
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
