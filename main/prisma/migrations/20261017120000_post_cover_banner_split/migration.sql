-- 封面与 Banner 解耦：封面自己的形态/颜色，Banner 可单独上传图片。
ALTER TABLE "Post" ADD COLUMN "coverStyle" TEXT NOT NULL DEFAULT 'image';
ALTER TABLE "Post" ADD COLUMN "coverColor" TEXT;
ALTER TABLE "Post" ADD COLUMN "coverColor2" TEXT;
ALTER TABLE "Post" ADD COLUMN "bannerImage" TEXT;

-- 历史数据保持原样：旧版 bannerStyle 同时控制卡片与详情顶图，
-- 这里把它的形态与颜色复制到封面字段；bannerImage 预填原封面，方便切换“单独图片”时不必重传。
UPDATE "Post"
SET
  "coverStyle" = CASE
    WHEN "bannerStyle" IN ('solid', 'gradient') THEN "bannerStyle"
    WHEN "cover" IS NULL OR "cover" = '' THEN 'none'
    ELSE 'image'
  END,
  "coverColor" = CASE
    WHEN "bannerStyle" IN ('solid', 'gradient') THEN "bannerColor"
    ELSE NULL
  END,
  "coverColor2" = CASE
    WHEN "bannerStyle" = 'gradient' THEN "bannerColor2"
    ELSE NULL
  END,
  "bannerImage" = "cover";
