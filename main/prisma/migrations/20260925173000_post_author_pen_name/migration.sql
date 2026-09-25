-- AlterTable
ALTER TABLE "Post" ADD COLUMN "authorName" TEXT;

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "penName" TEXT;

-- CreateTable
CREATE TABLE "PenName" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "PenName_name_key" ON "PenName"("name");
