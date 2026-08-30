type LogContext = Record<string, boolean | number | string | null | undefined>;

function write(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  context?: LogContext,
) {
  if (level === "debug" && process.env.NODE_ENV === "production") {
    return;
  }

  const suffix = context ? ` ${JSON.stringify(context)}` : "";
  const line = `[myblog] ${message}${suffix}`;

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  if (level === "debug") {
    console.debug(line);
    return;
  }

  console.info(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) =>
    write("debug", message, context),
  info: (message: string, context?: LogContext) =>
    write("info", message, context),
  warn: (message: string, context?: LogContext) =>
    write("warn", message, context),
  error: (message: string, context?: LogContext) =>
    write("error", message, context),
};
