"use client";

import Image from "next/image";
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
        <Image
          alt={alt ?? title}
          fill
          sizes="(max-width: 768px) 100vw, 720px"
          src={src}
        />
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
