export type AdminTaxonomy = {
  id: number;
  slug: string;
  name: string;
};

export type AdminPostView = {
  id: number;
  publicId: string;
  slug: string;
  title: string;
  /** 文章自己的作者（笔名）；空 = 前台回落到管理员账号的默认笔名 */
  authorName?: string | null;
  content: string;
  excerpt: string | null;
  cover: string | null;
  /** 列表卡封面独立形态：image | solid | gradient | none */
  coverStyle: string;
  coverColor: string | null;
  coverColor2: string | null;
  bannerStyle: string;
  /** Banner 单独上传的图；bannerStyle=cover 时不使用 */
  bannerImage: string | null;
  bannerColor: string | null;
  bannerColor2: string | null;
  /** 列表卡片封面焦点（0–100，百分比；50 = 居中） */
  coverFocalX: number;
  coverFocalY: number;
  /** 文章详情 Banner 焦点（与卡片分开） */
  bannerFocalX: number;
  bannerFocalY: number;
  status: string;
  publishedAt: Date | string | null;
  pinned: boolean;
  recommend: boolean;
  views: number;
  hasPassword: boolean;
  category: AdminTaxonomy | null;
  tags: AdminTaxonomy[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
  /** 发布之后又被改动的时间（前台「已修改」用它，不是 updatedAt） */
  revisedAt?: Date | string | null;
  showRevisedAt?: boolean;
};
