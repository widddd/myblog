import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { DATABASE_PATH } from "@/lib/db-path";

export { DATABASE_PATH, resolveDatabasePath } from "@/lib/db-path";

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

/** 进程退出前松开 Prisma 连接，避免 Windows 上 blog.db 仍被占用 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  delete globalForPrisma.prisma;
}
