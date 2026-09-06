type ImageLoaderProps = {
  src: string;
  width: number;
  quality?: number;
};

/**
 * Pass-through loader: thumbs/COS/Bing URLs are already final.
 * Do not append `w=` — Tencent COS may treat query params as image-process ops.
 * next.config sets `images.unoptimized` so Next does not build a fake srcset.
 */
export default function imageLoader({ src }: ImageLoaderProps): string {
  return src;
}
