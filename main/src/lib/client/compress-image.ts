import { IMAGE_ORIGINAL_MAX_BYTES } from "@/lib/upload/limits";

const MIN_EDGE = 320;

function canvasMime(file: File): string | null {
  const mime = file.type.toLowerCase();
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") {
    return mime;
  }
  if (mime === "image/avif" && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    return canvas.toDataURL("image/avif").startsWith("data:image/avif")
      ? "image/avif"
      : null;
  }
  return null;
}

function usesQuality(mime: string) {
  return mime === "image/jpeg" || mime === "image/webp" || mime === "image/avif";
}

function encodeCanvas(
  bitmap: ImageBitmap,
  mime: string,
  scale: number,
  quality: number,
): Promise<Blob> {
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("无法压缩图片"));
  }
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("无法压缩图片"));
        }
      },
      mime,
      usesQuality(mime) ? quality : undefined,
    );
  });
}

export async function compressImageFile(
  file: File,
  maxBytes = IMAGE_ORIGINAL_MAX_BYTES,
  onProgress?: (percent: number) => void,
): Promise<File> {
  if (file.size <= maxBytes) {
    return file;
  }

  const mime = canvasMime(file);
  if (!mime) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    let quality = 0.9;
    let scale = 1;
    const maxAttempts = 18;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      onProgress?.(Math.min(96, Math.round(((attempt + 1) / maxAttempts) * 100)));
      const blob = await encodeCanvas(bitmap, mime, scale, quality);
      if (blob.size <= maxBytes) {
        onProgress?.(100);
        return new File([blob], file.name, { type: mime, lastModified: Date.now() });
      }
      if (usesQuality(mime) && quality > 0.48) {
        quality -= 0.08;
        continue;
      }
      const nextScale = scale * 0.82;
      const nextEdge = Math.min(bitmap.width, bitmap.height) * nextScale;
      if (nextEdge >= MIN_EDGE) {
        scale = nextScale;
        continue;
      }
      if (usesQuality(mime) && quality > 0.36) {
        quality = 0.36;
        continue;
      }
      break;
    }
  } finally {
    bitmap.close();
  }

  return file;
}
