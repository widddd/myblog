import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

function resolveDatabasePath(): string {
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

function createPrismaClient() {
  mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

  const sqlite = new Database(DATABASE_PATH);
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("busy_timeout = 5000");
  } finally {
    sqlite.close();
  }

  const adapter = new PrismaBetterSQLite3({
    url: DATABASE_PATH,
    timeout: 5_000,
  });

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** 导出底层 better-sqlite3 句柄（备份系统 .backup() 专用，其他代码禁止使用） */
export function getSqliteHandle(): Database.Database {
  // Prisma adapter does not expose its handle. A second WAL connection is safe for backups.
  const db = new Database(DATABASE_PATH);
  db.pragma("busy_timeout = 5000");
  return db;
}
