import sharp, { type Metadata } from "sharp";

export const MAX_INPUT_PIXELS = 40_000_000;

const MIN_EDGE = 320;
const MAX_ATTEMPTS = 24;

const globalForSharp = globalThis as typeof globalThis & {
  myblogSharpQueue?: Promise<void>;
  myblogSharpConfigured?: boolean;
};

if (!globalForSharp.myblogSharpConfigured) {
  sharp.cache({ memory: 32, files: 0, items: 50 });
  sharp.concurrency(1);
  globalForSharp.myblogSharpConfigured = true;
}

export async function withSharpLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalForSharp.myblogSharpQueue ?? Promise.resolve();
  let release: () => void = () => {};
  globalForSharp.myblogSharpQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

export class ImageCompressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageCompressError";
  }
}

export function orientedDimensions(metadata: Metadata) {
  const swap = metadata.orientation ? metadata.orientation >= 5 : false;
  return {
    width: swap ? (metadata.height ?? null) : (metadata.width ?? null),
    height: swap ? (metadata.width ?? null) : (metadata.height ?? null),
  };
}

function encodeForMime(
  input: sharp.Sharp,
  mime: string,
  quality: number,
): sharp.Sharp {
  switch (mime) {
    case "image/jpeg":
      return input.jpeg({ quality, mozjpeg: true });
    case "image/webp":
      return input.webp({ quality });
    case "image/avif":
      return input.avif({ quality });
    case "image/png":
      return input.png({ compressionLevel: 9, adaptiveFiltering: true });
    case "image/gif":
      return input.gif({ effort: 4 });
    default:
      throw new ImageCompressError("不支持把该格式压缩为原格式");
  }
}

function usesQuality(mime: string) {
  return mime === "image/jpeg" || mime === "image/webp" || mime === "image/avif";
}

export async function compressImageToMaxBytes(
  buffer: Buffer,
  mime: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; width: number | null; height: number | null }> {
  if (buffer.length <= maxBytes) {
    const dimensions = await readImageDimensions(buffer, mime);
    return { buffer, ...dimensions };
  }

  return withSharpLock(async () => {
    const animated = mime === "image/gif";
    const base = sharp(buffer, {
      animated,
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      pages: animated ? -1 : 1,
    });
    const metadata = await base.metadata();
    const start = orientedDimensions(metadata);
    const startEdge = Math.max(start.width ?? MIN_EDGE, start.height ?? MIN_EDGE);
    let quality = 86;
    let edge = startEdge;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const pipeline = sharp(buffer, {
        animated,
        failOn: "error",
        limitInputPixels: MAX_INPUT_PIXELS,
        pages: animated ? -1 : 1,
      }).rotate();
      const resized =
        edge < startEdge
          ? pipeline.resize({
              width: edge,
              height: edge,
              fit: "inside",
              withoutEnlargement: true,
            })
          : pipeline;
      const output = await encodeForMime(resized, mime, quality).toBuffer({
        resolveWithObject: true,
      });
      if (output.data.length <= maxBytes) {
        return {
          buffer: output.data,
          width: output.info.width,
          height: output.info.height,
        };
      }
      if (usesQuality(mime) && quality > 48) {
        quality -= 8;
        continue;
      }
      if (edge > MIN_EDGE) {
        edge = Math.max(MIN_EDGE, Math.round(edge * 0.82));
        continue;
      }
      if (usesQuality(mime) && quality > 36) {
        quality = 36;
        continue;
      }
      break;
    }

    throw new ImageCompressError("无法将图片压缩到 10 MB 以下，请换一张图再试");
  });
}

export async function readImageDimensions(
  buffer: Buffer,
  mime = "image/jpeg",
) {
  return withSharpLock(async () => {
    const metadata = await sharp(buffer, {
      animated: mime === "image/gif",
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    return orientedDimensions(metadata);
  });
}
