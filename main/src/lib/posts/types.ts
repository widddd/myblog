export type PostTaxonomy = {
  slug: string;
  name: string;
};

export type PostCardModel = {
  publicId: string;
  slug: string;
  title: string;
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
  /** 列表卡片封面焦点（百分比） */
  coverFocalX: number;
  coverFocalY: number;
  /** 详情 Banner 封面焦点（百分比） */
  bannerFocalX: number;
  bannerFocalY: number;
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
  /** 作者（笔名）：文章自己填的，否则是管理员账号上的默认笔名；都没有为空串 */
  authorName: string;
  /** 发布之后又被改动的时间；为空表示没改过（或改回草稿前的旧记录） */
  revisedAt: Date | null;
  /** 文章页是否显示「已修改」，编辑页设置栏可关 */
  showRevisedAt: boolean;
};

export type TaxonomyItem = PostTaxonomy & {
  count: number;
};
