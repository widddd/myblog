export type SearchHit = {
  slug: string;
  title: string;
  excerpt: string | null;
  locked: boolean;
  publishedAt: Date | string | null;
};
