export type SearchHit = {
  publicId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  locked: boolean;
  publishedAt: Date | string | null;
};
