"use client";

import { useState } from "react";

import { Lightbox } from "@/components/common/Lightbox";
import type { PublicMomentImage } from "@/lib/moments/types";
import { cn } from "@/lib/utils/cn";

type MomentGridProps = {
  images: PublicMomentImage[];
  alt: string;
};

function columnCount(count: number): number {
  if (count <= 1) {
    return 1;
  }
  if (count === 2 || count === 4) {
    return 2;
  }
  return 3;
}

function ratioStyle(image: PublicMomentImage) {
  if (!image.width || !image.height) {
    return undefined;
  }
  return {
    ["--moment-w" as string]: String(image.width),
    ["--moment-h" as string]: String(image.height),
  };
}

export function MomentGrid({ images, alt }: MomentGridProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{
    src: string;
    thumb: string;
    key: string;
    width?: number;
    height?: number;
  } | null>(null);

  if (images.length === 0) {
    return null;
  }

  const count = Math.min(9, images.length);
  const shown = images.slice(0, count);
  const columns = columnCount(count);

  function activate(index: number) {
    const image = shown[index];
    if (!image) {
      return;
    }
    if (count === 1) {
      setLightbox({
        src: image.src,
        thumb: image.thumbSrc,
        key: image.key,
        width: image.width,
        height: image.height,
      });
      return;
    }
    if (expanded === index) {
      setLightbox({
        src: image.src,
        thumb: image.thumbSrc,
        key: image.key,
        width: image.width,
        height: image.height,
      });
      return;
    }
    setExpanded(index);
  }

  return (
    <Lightbox
      onClose={() => setLightbox(null)}
      openAlt={alt}
      openHeight={lightbox?.height}
      openKey={lightbox?.key}
      openSrc={lightbox?.src ?? null}
      openThumb={lightbox?.thumb}
      openWidth={lightbox?.width}
    >
      <div
        className={cn("moment-grid", expanded !== null && "is-expanded")}
        data-cols={columns}
        data-count={count}
        style={{ ["--moment-cols" as string]: String(columns) }}
      >
        {shown.map((image, index) => (
          <button
            className={cn(
              "moment-grid__cell",
              expanded === index && "is-expanded",
            )}
            key={`${image.key}-${index}`}
            onClick={() => activate(index)}
            style={ratioStyle(image)}
            type="button"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`${alt} ${index + 1}`} src={image.thumbSrc} />
          </button>
        ))}
      </div>
    </Lightbox>
  );
}
