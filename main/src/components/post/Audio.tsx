import { isSafeMediaUrl, mediaSourceHost } from "@/lib/media/url";

type AudioProps = {
  src?: string;
  title?: string;
  controls?: boolean;
  loop?: boolean;
  preload?: "none" | "metadata" | "auto";
};

export function Audio({
  src,
  title,
  controls = true,
  loop = false,
  preload = "metadata",
}: AudioProps) {
  const safeSrc = src && isSafeMediaUrl(src) ? src : undefined;
  if (!safeSrc) {
    return null;
  }

  const host = mediaSourceHost(safeSrc);

  return (
    <figure className="post-audio-wrap">
      <audio
        className="post-audio"
        controls={controls}
        loop={loop}
        preload={preload}
        src={safeSrc}
        title={title}
      />
      {host ? <figcaption className="post-video-mark">外链 · {host}</figcaption> : null}
    </figure>
  );
}
