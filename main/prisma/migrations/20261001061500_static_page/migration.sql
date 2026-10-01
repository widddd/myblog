-- CreateTable
CREATE TABLE "StaticPage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "html" TEXT NOT NULL DEFAULT '',
    "css" TEXT NOT NULL DEFAULT '',
    "js" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "StaticPage_slug_key" ON "StaticPage"("slug");

-- 注意：`prisma migrate dev` 在本机上曾为这次改动额外生成一段 `Post` 表重建
-- （DROP TABLE "Post" → 复制 → 改名）。那段是 Prisma 对「列顺序」的规范化churn，
-- 不是本功能需要的；而 `DROP TABLE` 会顺着 PostTag 的 ON DELETE CASCADE 把关联行删掉
-- （实测 PostTag 17 行 → 0 行）。这里只保留必需的那一条 DDL。
-- 详见 docs/pitfalls.md 的 P-105。
