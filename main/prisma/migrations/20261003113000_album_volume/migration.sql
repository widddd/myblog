-- CreateTable
CREATE TABLE "AlbumVolume" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "albumId" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlbumVolume_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AlbumVolume_albumId_sort_idx" ON "AlbumVolume"("albumId", "sort");

-- AlterTable
-- 外键必须内联在 ADD COLUMN 上（同 20261003090000_album 的说明）：SQLite 不支持 ADD CONSTRAINT，
-- 而 prisma 的影子库走「空库 → 应用 migrations」，只能认建列时内联的 REFERENCES。
-- 语义：删卷只把照片解绑（回到本相册的「未分类」），照片本体与相册归属都不动。
ALTER TABLE "Upload" ADD COLUMN "volumeId" INTEGER REFERENCES "AlbumVolume" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Upload_volumeId_idx" ON "Upload"("volumeId");
