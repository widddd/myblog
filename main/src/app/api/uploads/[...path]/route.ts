import { NextResponse } from "next/server";

import {
  contentTypeFromStorageKey,
  getDriver,
  InvalidStorageKeyError,
  InvalidStorageRangeError,
  isImmutableStorageKey,
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

async function resolveStoredObject(key: string) {
  const originalAlias = /^images\/([a-f0-9]{64})-original$/.exec(key);
  if (!originalAlias) {
    return {
      driver: getDriver("local"),
      key,
      mime: contentTypeFromStorageKey(key),
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
    const stored = await resolveStoredObject(requestedKey);
    const metadata = await stored.driver.stat(stored.key);
    if (!metadata) {
      throw new StorageObjectNotFoundError();
    }

    const range = parseRange(request.headers.get("range"), metadata.size);
    const object = headOnly ? null : await stored.driver.get(stored.key, range);
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
