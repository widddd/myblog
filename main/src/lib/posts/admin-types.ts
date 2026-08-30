export type AdminTaxonomy = {
  id: number;
  slug: string;
  name: string;
};

export type AdminPostView = {
  id: number;
  slug: string;
  title: string;
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
};
