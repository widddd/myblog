export type PostTaxonomy = {
  slug: string;
  name: string;
};

export type PostCardModel = {
  slug: string;
  title: string;
  excerpt: string | null;
  cover: string | null;
  bannerStyle: string;
  bannerColor: string | null;
  bannerColor2: string | null;
  locked: boolean;
  pinned: boolean;
  recommend: boolean;
  views: number;
  publishedAt: Date | null;
  category: PostTaxonomy | null;
  tags: PostTaxonomy[];
};

export type PostDetailModel = PostCardModel & {
  id: number;
  wordCount: number;
};

export type TaxonomyItem = PostTaxonomy & {
  count: number;
};
