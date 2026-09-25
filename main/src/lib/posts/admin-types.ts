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
  bannerStyle: string;
  bannerColor: string | null;
  bannerColor2: string | null;
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
