import { createWriteStream } from "node:fs";
import { PassThrough, Readable } from "node:stream";

import COS from "cos-nodejs-sdk-v5";

import {
  objectPublicUrl,
  peekCosSettings,
  requireCosSettings,
  type CosSettings,
} from "./cos-config";
import {
  InvalidStorageRangeError,
  StorageObjectNotFoundError,
  normalizeStorageKey,
  type StorageByteRange,
  type StorageDriver,
  type StorageObject,
  type StorageObjectStat,
} from "./types";

export { CosNotConfiguredError } from "./cos-config";

function createClient(config: CosSettings) {
  return new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
    FileParallelLimit: 1,
    Timeout: 120_000,
  });
}

function invoke<T>(
  run: (callback: (error: COS.CosError, data: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    run((error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const status = "statusCode" in error ? Number(error.statusCode) : 0;
  const code = "code" in error ? String(error.code) : "";
  return status === 404 || code === "NoSuchKey" || code === "NoSuchBucket";
}

function asCosError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(fallback);
}

export class CosDriver implements StorageDriver {
  readonly name = "cos" as const;

  async put(key: string, data: Uint8Array, options?: { publicRead?: boolean }) {
    const normalized = normalizeStorageKey(key);
    const config = await requireCosSettings();
    const client = createClient(config);
    await invoke((callback) =>
      client.putObject(
        {
          Bucket: config.bucket,
          Region: config.region,
          Key: normalized,
          Body: Buffer.from(data),
          ACL: options?.publicRead === false ? undefined : "public-read",
        },
        callback,
      ),
    );
  }

  async putFile(
    key: string,
    filePath: string,
    options?: { publicRead?: boolean },
  ) {
    const normalized = normalizeStorageKey(key);
    const config = await requireCosSettings();
    const client = createClient(config);
    await invoke((callback) =>
      client.uploadFile(
        {
          Bucket: config.bucket,
          Region: config.region,
          Key: normalized,
          FilePath: filePath,
          Headers: options?.publicRead
            ? { "x-cos-acl": "public-read" }
            : undefined,
        },
        callback,
      ),
    );
  }

  async get(key: string, range?: StorageByteRange): Promise<StorageObject> {
    const normalized = normalizeStorageKey(key);
    const metadata = await this.stat(normalized);
    if (!metadata) {
      throw new StorageObjectNotFoundError();
    }

    const selectedRange = range ?? null;
    if (
      selectedRange &&
      (selectedRange.start < 0 ||
        selectedRange.end < selectedRange.start ||
        selectedRange.end >= metadata.size)
    ) {
      throw new InvalidStorageRangeError(metadata.size);
    }

    const config = await requireCosSettings();
    const client = createClient(config);
    try {
      const result = await invoke<COS.GetObjectResult>((callback) =>
        client.getObject(
          {
            Bucket: config.bucket,
            Region: config.region,
            Key: normalized,
            Headers: selectedRange
              ? { Range: `bytes=${selectedRange.start}-${selectedRange.end}` }
              : undefined,
          },
          callback,
        ),
      );
      const body = Buffer.isBuffer(result.Body)
        ? result.Body
        : Buffer.from(String(result.Body ?? ""));
      return {
        ...metadata,
        body: Readable.toWeb(Readable.from(body)) as ReadableStream<Uint8Array>,
        contentLength: selectedRange
          ? selectedRange.end - selectedRange.start + 1
          : metadata.size,
        range: selectedRange,
      };
    } catch (error) {
      if (isNotFound(error)) {
        throw new StorageObjectNotFoundError();
      }
      throw asCosError(error, "读取 COS 对象失败");
    }
  }

  async getToFile(key: string, destPath: string): Promise<void> {
    const normalized = normalizeStorageKey(key);
    const config = await requireCosSettings();
    const client = createClient(config);
    try {
      await invoke((callback) =>
        client.getObject(
          {
            Bucket: config.bucket,
            Region: config.region,
            Key: normalized,
            Output: createWriteStream(destPath),
          },
          callback,
        ),
      );
    } catch (error) {
      if (isNotFound(error)) {
        throw new StorageObjectNotFoundError();
      }
      throw asCosError(error, "下载 COS 对象失败");
    }
  }

  getUrl(key: string): string {
    const config = peekCosSettings();
    if (!config) {
      throw new Error("腾讯云 COS 尚未配置");
    }
    return objectPublicUrl(config.publicBaseUrl, key);
  }

  async delete(key: string): Promise<void> {
    const normalized = normalizeStorageKey(key);
    const config = await requireCosSettings();
    const client = createClient(config);
    try {
      await invoke((callback) =>
        client.deleteObject(
          {
            Bucket: config.bucket,
            Region: config.region,
            Key: normalized,
          },
          callback,
        ),
      );
    } catch (error) {
      if (isNotFound(error)) {
        return;
      }
      throw asCosError(error, "删除 COS 对象失败");
    }
  }

  async stat(key: string): Promise<StorageObjectStat | null> {
    const normalized = normalizeStorageKey(key);
    const config = await requireCosSettings();
    const client = createClient(config);
    try {
      const result = await invoke<COS.HeadObjectResult>((callback) =>
        client.headObject(
          {
            Bucket: config.bucket,
            Region: config.region,
            Key: normalized,
          },
          callback,
        ),
      );
      const size = Number(result.headers?.["content-length"] ?? 0);
      const lastModified = result.headers?.["last-modified"]
        ? new Date(String(result.headers["last-modified"]))
        : new Date();
      return { size, lastModified };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw asCosError(error, "读取 COS 对象信息失败");
    }
  }

  async listKeys(prefix?: string): Promise<string[]> {
    const config = await requireCosSettings();
    const client = createClient(config);
    const keys: string[] = [];
    let marker: string | undefined;

    do {
      const result = await invoke<COS.GetBucketResult>((callback) =>
        client.getBucket(
          {
            Bucket: config.bucket,
            Region: config.region,
            Prefix: prefix ?? "",
            Marker: marker,
            MaxKeys: 1000,
          },
          callback,
        ),
      );
      for (const item of result.Contents ?? []) {
        if (!item.Key || item.Key.endsWith("/")) {
          continue;
        }
        try {
          keys.push(normalizeStorageKey(item.Key));
        } catch {
          // Skip unexpected keys rather than abort a listing.
        }
      }
      const truncated = result.IsTruncated as boolean | string | undefined;
      marker =
        truncated === true || truncated === "true"
          ? result.NextMarker
          : undefined;
    } while (marker);

    return keys;
  }

  openReadStream(key: string): Readable {
    const pass = new PassThrough();
    void this.get(normalizeStorageKey(key))
      .then((object) => {
        Readable.fromWeb(object.body as never).pipe(pass);
      })
      .catch((error) => {
        pass.destroy(asCosError(error, "读取 COS 对象失败"));
      });
    return pass;
  }
}

export async function testCosConnection(): Promise<{ ok: true; count: number }> {
  const config = await requireCosSettings();
  const client = createClient(config);
  const result = await invoke<COS.GetBucketResult>((callback) =>
    client.getBucket(
      {
        Bucket: config.bucket,
        Region: config.region,
        Prefix: "backups/",
        MaxKeys: 1,
      },
      callback,
    ),
  );
  return { ok: true, count: result.Contents?.length ?? 0 };
}
