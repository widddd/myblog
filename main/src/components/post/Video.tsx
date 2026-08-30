import { isSafeMediaUrl, mediaSourceHost } from "@/lib/media/url";

type VideoProps = {
  src?: string;
  poster?: string;
  title?: string;
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  preload?: "none" | "metadata" | "auto";
  width?: number;
  height?: number;
};

function safePoster(value: string | undefined): string | undefined {
  if (!value || !isSafeMediaUrl(value)) {
    return undefined;
  }
  return value;
}

export function Video({
  src,
  poster,
  title,
  controls = true,
  loop = false,
  muted = false,
  playsInline = true,
  preload = "metadata",
  width,
  height,
}: VideoProps) {
  const safeSrc = src && isSafeMediaUrl(src) ? src : undefined;
  if (!safeSrc) {
    return null;
  }

  const host = mediaSourceHost(safeSrc);

  return (
    <figure className="post-video-wrap">
      <video
        className="post-video"
        controls={controls}
        height={height}
        loop={loop}
        muted={muted}
        playsInline={playsInline}
        poster={safePoster(poster)}
        preload={preload}
        src={safeSrc}
        title={title}
        width={width}
      />
      {host ? <figcaption className="post-video-mark">外链 · {host}</figcaption> : null}
    </figure>
  );
}
