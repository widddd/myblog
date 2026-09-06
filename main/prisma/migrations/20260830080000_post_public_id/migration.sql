-- AlterTable
ALTER TABLE "Post" ADD COLUMN "publicId" TEXT NOT NULL DEFAULT '';

-- Backfill unique 8-char hex (subset of base62) for existing rows
UPDATE "Post"
SET "publicId" = lower(hex(randomblob(4)))
WHERE "publicId" = '';

-- CreateIndex
CREATE UNIQUE INDEX "Post_publicId_key" ON "Post"("publicId");
