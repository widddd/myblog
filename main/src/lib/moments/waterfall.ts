export type WaterfallImage = {
  src: string;
  width: number;
  height: number;
  portrait: boolean;
  fallback?: string;
};

export type WaterfallRow =
  | { kind: "landscape"; items: [WaterfallImage] }
  | { kind: "pair"; items: [WaterfallImage, WaterfallImage] }
  | { kind: "portrait"; items: [WaterfallImage] };

export function isPortrait(width?: number, height?: number): boolean {
  if (!width || !height) {
    return false;
  }
  return height > width;
}

export function toWaterfallImage(image: {
  src: string;
  width?: number;
  height?: number;
  fallback?: string;
}): WaterfallImage {
  const width = image.width && image.width > 0 ? image.width : 4;
  const height = image.height && image.height > 0 ? image.height : 3;
  return {
    src: image.src,
    width,
    height,
    portrait: isPortrait(width, height),
    fallback: image.fallback,
  };
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = copy[index];
    const other = copy[swap];
    if (current === undefined || other === undefined) {
      continue;
    }
    copy[index] = other;
    copy[swap] = current;
  }
  return copy;
}

export function layoutWaterfall(images: WaterfallImage[]): WaterfallRow[] {
  if (images.length === 0) {
    return [];
  }

  const allPortrait = images.every((image) => image.portrait);
  const allLandscape = images.every((image) => !image.portrait);

  if (allLandscape) {
    return images.map((image) => ({ kind: "landscape" as const, items: [image] }));
  }

  if (allPortrait) {
    const rows: WaterfallRow[] = [];
    for (let index = 0; index < images.length; index += 2) {
      const first = images[index];
      const second = images[index + 1];
      if (first && second) {
        rows.push({ kind: "pair", items: [first, second] });
      } else if (first) {
        rows.push({ kind: "portrait", items: [first] });
      }
    }
    return rows;
  }

  const rows: WaterfallRow[] = [];
  let pending: WaterfallImage | null = null;
  for (const image of images) {
    if (!image.portrait) {
      if (pending) {
        rows.push({ kind: "portrait", items: [pending] });
        pending = null;
      }
      rows.push({ kind: "landscape", items: [image] });
      continue;
    }
    if (pending) {
      rows.push({ kind: "pair", items: [pending, image] });
      pending = null;
    } else {
      pending = image;
    }
  }
  if (pending) {
    rows.push({ kind: "portrait", items: [pending] });
  }
  return rows;
}

export function estimateRowHeight(
  row: WaterfallRow,
  colWidth: number,
  gap: number,
): number {
  if (row.kind === "landscape") {
    const image = row.items[0];
    return colWidth * (image.height / image.width);
  }
  const cellWidth = Math.max(1, (colWidth - gap) / 2);
  return Math.max(
    ...row.items.map((image) => cellWidth * (image.height / image.width)),
  );
}

export function estimateStackHeight(
  rows: WaterfallRow[],
  colWidth: number,
  gap: number,
): number {
  return rows.reduce(
    (sum, row) => sum + estimateRowHeight(row, colWidth, gap) + gap,
    0,
  );
}

/** Keep adding (and looping) until the stack covers targetHeight. */
export function fillToHeight(
  images: WaterfallImage[],
  targetHeight: number,
  colWidth: number,
  gap = 6,
): WaterfallImage[] {
  if (images.length === 0 || targetHeight <= 0) {
    return [];
  }
  const picked: WaterfallImage[] = [];
  const cap = images.length * 8;
  for (let index = 0; index < cap; index += 1) {
    const image = images[index % images.length];
    if (!image) {
      break;
    }
    picked.push(image);
    if (
      estimateStackHeight(layoutWaterfall(picked), colWidth, gap) >= targetHeight
    ) {
      break;
    }
  }
  return picked;
}
