-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "mustChangeCredentials" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "BackupSecret" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "algo" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
