-- CreateTable
CREATE TABLE "MomentVisibilityGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "MomentVisibilityGroup_name_key" ON "MomentVisibilityGroup"("name");

-- AlterTable
-- 外键必须内联在 ADD COLUMN 上：SQLite 不支持 ALTER TABLE ... ADD CONSTRAINT，
-- 而 prisma migrate dev 的影子库走「空库 → 应用 migrations」，只能认建列时内联的 REFERENCES。
-- 语义：删除可见范围组时把瞬间的可见范围置空 = 回落到全局可见期，而不是连带删瞬间。
-- 这条 SET NULL 同时是公开查询的前提：孤儿 visibilityGroupId 不可能存在，
-- 所以 where 条件里不需要（也不能写，见 lib/moments/visibility.ts 的说明）notIn 兜底。
ALTER TABLE "Moment" ADD COLUMN "visibilityGroupId" INTEGER REFERENCES "MomentVisibilityGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Moment_visibilityGroupId_idx" ON "Moment"("visibilityGroupId");
