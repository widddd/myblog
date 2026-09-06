-- CreateTable
CREATE TABLE "HomeModule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'builtin',
    "builtinKey" TEXT,
    "html" TEXT NOT NULL DEFAULT '',
    "css" TEXT NOT NULL DEFAULT '',
    "js" TEXT NOT NULL DEFAULT '',
    "blocks" TEXT NOT NULL DEFAULT '[]',
    "config" TEXT NOT NULL DEFAULT '{}',
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HomePlacement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "moduleId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "col" INTEGER NOT NULL DEFAULT 1,
    "colSpan" INTEGER NOT NULL DEFAULT 12,
    "row" INTEGER NOT NULL DEFAULT 1,
    "rowSpan" INTEGER NOT NULL DEFAULT 1,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "HomePlacement_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "HomeModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HomeModule_slug_key" ON "HomeModule"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "HomePlacement_moduleId_key" ON "HomePlacement"("moduleId");

-- CreateIndex
CREATE INDEX "HomePlacement_row_col_idx" ON "HomePlacement"("row", "col");
