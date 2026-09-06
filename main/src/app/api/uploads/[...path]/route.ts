import { NextResponse } from "next/server";

import {
  contentTypeFromStorageKey,
  getDriver,
  CosNotConfiguredError,
  InvalidStorageKeyError,
  InvalidStorageRangeError,
  isImmutableStorageKey,
  isThumb2Key,
  loadCosSettings,
  normalizeDriverName,
  normalizeStorageKey,
  StorageObjectNotFoundError,
  type StorageByteRange,
} from "@/lib/storage";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type UploadRouteContext = {
  params: Promise<{ path: string[] }>;
};

function error(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ code, message }, { status, headers });
}

function parseRange(value: string | null, size: number): StorageByteRange | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size < 1) {
    throw new InvalidStorageRangeError(size);
  }

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) {
      throw new InvalidStorageRangeError(size);
    }
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    throw new InvalidStorageRangeError(size);
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function cosPublicUrl(key: string): string | null {
  try {
    return getDriver("cos").getUrl(key);
  } catch {
    return null;
  }
}

async function resolveStoredObject(key: string) {
  if (key.startsWith("media/")) {
    const redirectUrl = cosPublicUrl(key);
    if (!redirectUrl) {
      throw new CosNotConfiguredError();
    }
    return {
      driver: getDriver("cos"),
      key,
      mime: contentTypeFromStorageKey(key),
      redirectUrl,
    };
  }

  const originalAlias = /^images\/([a-f0-9]{64})-original(?:\.[a-z0-9]+)?$/.exec(
    key,
  );
  if (!originalAlias) {
    return {
      driver: getDriver("local"),
      key,
      mime: contentTypeFromStorageKey(key),
      redirectUrl: null,
    };
  }

  const upload = await prisma.upload.findUnique({
    where: { hash: originalAlias[1] },
    select: { driver: true, key: true, mime: true },
  });
  if (!upload || !upload.mime.startsWith("image/")) {
    throw new StorageObjectNotFoundError();
  }
  return {
    driver: getDriver(upload.driver),
    key: upload.key,
    mime: upload.mime,
    redirectUrl:
      normalizeDriverName(upload.driver) === "cos"
        ? cosPublicUrl(upload.key)
        : null,
  };
}

async function serve(
  request: Request,
  context: UploadRouteContext,
  headOnly: boolean,
) {
  try {
    const { path: segments } = await context.params;
    const requestedKey = normalizeStorageKey(segments.join("/"));
    const proxy = new URL(request.url).searchParams.get("proxy") === "1";
    await loadCosSettings();
    const stored = await resolveStoredObject(requestedKey);
    if (stored.redirectUrl && !proxy) {
      return Response.redirect(stored.redirectUrl, 302);
    }
    let driver = stored.driver;
    let metadata = await driver.stat(stored.key);
    if (!metadata && !isThumb2Key(stored.key)) {
      const fallbackName = driver.name === "local" ? "cos" : "local";
      try {
        const fallback = getDriver(fallbackName);
        const alt = await fallback.stat(stored.key);
        if (alt) {
          driver = fallback;
          metadata = alt;
        }
      } catch {
        // keep the original miss
      }
    }
    if (!metadata) {
      throw new StorageObjectNotFoundError();
    }

    const range = parseRange(request.headers.get("range"), metadata.size);
    const object = headOnly ? null : await driver.get(stored.key, range);
    const contentLength = range
      ? range.end - range.start + 1
      : metadata.size;
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": isImmutableStorageKey(requestedKey)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      "Content-Length": String(contentLength),
      "Content-Type": stored.mime,
      "Last-Modified": metadata.lastModified.toUTCString(),
    });

    if (range) {
      headers.set(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${metadata.size}`,
      );
    }

    return new Response(headOnly ? null : object?.body, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (caught) {
    if (caught instanceof CosNotConfiguredError) {
      return error(503, "COS_NOT_CONFIGURED", caught.message);
    }
    if (caught instanceof InvalidStorageKeyError) {
      return error(400, "INVALID_STORAGE_PATH", caught.message);
    }
    if (caught instanceof StorageObjectNotFoundError) {
      return error(404, "UPLOAD_NOT_FOUND", caught.message);
    }
    if (caught instanceof InvalidStorageRangeError) {
      return error(416, "INVALID_RANGE", caught.message, {
        "Content-Range": `bytes */${caught.size}`,
      });
    }
    return error(500, "INTERNAL_ERROR", "读取文件失败");
  }
}

export function GET(request: Request, context: UploadRouteContext) {
  return serve(request, context, false);
}

export function HEAD(request: Request, context: UploadRouteContext) {
  return serve(request, context, true);
}
