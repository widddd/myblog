"use client";

import { Lightbox } from "@/components/common/Lightbox";
import type { PublicMomentImage } from "@/lib/moments/types";

type MomentGridProps = {
  images: PublicMomentImage[];
  alt: string;
};

export function MomentGrid({ images, alt }: MomentGridProps) {
  if (images.length === 0) {
    return null;
  }

  const count = Math.min(9, images.length);
  const shown = images.slice(0, count);
  const columns = count === 1 ? 1 : count === 2 ? 2 : 3;

  return (
    <Lightbox>
      <div
        className="moment-grid"
        data-count={count}
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {shown.map((image, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${alt} ${index + 1}`}
            data-lightbox-src={image.src}
            key={`${image.key}-${index}`}
            src={image.thumbSrc}
            tabIndex={0}
          />
        ))}
      </div>
    </Lightbox>
  );
}
