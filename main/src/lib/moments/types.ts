export type MomentImage = {
  key: string;
  thumb?: string;
  width?: number;
  height?: number;
};

export type PublicMomentImage = MomentImage & {
  src: string;
  thumbSrc: string;
};

export type PublicMoment = {
  id: number;
  content: string;
  images: PublicMomentImage[];
  createdAt: Date | string;
  likeCount: number;
  liked: boolean;
};
