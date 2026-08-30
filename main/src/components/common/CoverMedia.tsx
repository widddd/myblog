import type { CSSProperties } from "react";

type CoverMediaProps = {
  src: string | null;
  title: string;
  alt?: string;
};

export function CoverMedia({ src, title, alt }: CoverMediaProps) {
  if (src) {
    return (
      <div className="cover-media">
        {/* Cover URLs may be local StorageDriver or remote OSS; keep native img until the host policy is fixed. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt ?? title} src={src} />
      </div>
    );
  }

  let hash = 0;
  for (const char of title) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;

  const style = {
    "--cover-a": `hsl(${hue} 58% 46%)`,
    "--cover-b": `hsl(${(hue + 46) % 360} 52% 32%)`,
  } as CSSProperties;

  return (
    <div className="cover-media">
      <div className="cover-fallback" style={style} />
    </div>
  );
}
