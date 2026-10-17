-- CreateTable
CREATE TABLE "Album" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverId" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Album_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "Upload" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Album_slug_key" ON "Album"("slug");

-- AlterTable
-- 外键必须内联在 ADD COLUMN 上：SQLite 不支持 ALTER TABLE ... ADD CONSTRAINT，
-- 而 prisma migrate dev 的影子库走「空库 → 应用 migrations」，只能认建列时内联的 REFERENCES。
-- 语义：删相册只把图片解除归属（回到「未分类」），不连带删媒体文件。
ALTER TABLE "Upload" ADD COLUMN "albumId" INTEGER REFERENCES "Album" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Upload_albumId_idx" ON "Upload"("albumId");
