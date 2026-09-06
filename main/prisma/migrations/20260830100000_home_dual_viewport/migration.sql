-- AlterTable: dual-viewport geometry on HomePlacement
ALTER TABLE "HomePlacement" ADD COLUMN "hPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HomePlacement" ADD COLUMN "mobileCol" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HomePlacement" ADD COLUMN "mobileColSpan" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "HomePlacement" ADD COLUMN "mobileRow" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HomePlacement" ADD COLUMN "mobileHPct" INTEGER NOT NULL DEFAULT 0;

UPDATE "HomePlacement"
SET
  "hPct" = 100,
  "mobileCol" = 1,
  "mobileColSpan" = 12,
  "mobileRow" = 1,
  "mobileHPct" = 70
WHERE "moduleId" IN (SELECT "id" FROM "HomeModule" WHERE "builtinKey" = 'banner');

UPDATE "HomePlacement"
SET
  "hPct" = 37,
  "mobileCol" = 1,
  "mobileColSpan" = 12,
  "mobileRow" = 2,
  "mobileHPct" = 32
WHERE "moduleId" IN (SELECT "id" FROM "HomeModule" WHERE "builtinKey" = 'welcome');

UPDATE "HomePlacement"
SET
  "hPct" = 37,
  "mobileCol" = 1,
  "mobileColSpan" = 12,
  "mobileRow" = 3,
  "mobileHPct" = 36
WHERE "moduleId" IN (
  SELECT "id" FROM "HomeModule" WHERE "builtinKey" IN ('moments', 'recommend')
);

UPDATE "HomePlacement"
SET
  "hPct" = 0,
  "mobileCol" = 1,
  "mobileColSpan" = 12,
  "mobileRow" = 4,
  "mobileHPct" = 0
WHERE "moduleId" IN (SELECT "id" FROM "HomeModule" WHERE "builtinKey" = 'posts');

UPDATE "HomePlacement"
SET
  "hPct" = 0,
  "mobileCol" = 1,
  "mobileColSpan" = 12,
  "mobileRow" = 5,
  "mobileHPct" = 0
WHERE "moduleId" IN (SELECT "id" FROM "HomeModule" WHERE "builtinKey" = 'announcement');

UPDATE "HomePlacement"
SET
  "hPct" = 0,
  "mobileCol" = 1,
  "mobileColSpan" = 12,
  "mobileRow" = 6,
  "mobileHPct" = 0
WHERE "moduleId" IN (SELECT "id" FROM "HomeModule" WHERE "builtinKey" = 'site');

UPDATE "HomePlacement"
SET
  "hPct" = 0,
  "mobileCol" = 1,
  "mobileColSpan" = 12,
  "mobileRow" = 7,
  "mobileHPct" = 0
WHERE "moduleId" IN (SELECT "id" FROM "HomeModule" WHERE "builtinKey" = 'categories');

UPDATE "HomePlacement"
SET
  "hPct" = 0,
  "mobileCol" = 1,
  "mobileColSpan" = 12,
  "mobileRow" = 8,
  "mobileHPct" = 0
WHERE "moduleId" IN (SELECT "id" FROM "HomeModule" WHERE "builtinKey" = 'tags');

UPDATE "HomePlacement"
SET
  "hPct" = 0,
  "mobileCol" = 1,
  "mobileColSpan" = 12,
  "mobileRow" = 9,
  "mobileHPct" = 0
WHERE "moduleId" IN (SELECT "id" FROM "HomeModule" WHERE "builtinKey" = 'recent');
