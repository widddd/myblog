import path from "node:path";

export function resolveDatabasePath(): string {
  const configuredPath = process.env.DATABASE_PATH?.trim();
  if (configuredPath) {
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), configuredPath);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl?.startsWith("file:")) {
    const urlPath = databaseUrl.slice("file:".length);
    return path.isAbsolute(urlPath)
      ? path.normalize(urlPath)
      : path.resolve(
          /* turbopackIgnore: true */ process.cwd(),
          "prisma",
          urlPath,
        );
  }

  return path.resolve(process.cwd(), "data", "blog.db");
}

export const DATABASE_PATH = resolveDatabasePath();
