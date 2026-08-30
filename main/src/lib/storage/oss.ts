import type { Readable } from "node:stream";

import type { StorageDriver, StorageObject, StorageObjectStat } from "./types";

function notConfigured(): never {
  throw new Error("腾讯云 OSS 尚未配置");
}

export class OssDriver implements StorageDriver {
  readonly name = "oss" as const;

  async put(): Promise<void> {
    notConfigured();
  }

  async get(): Promise<StorageObject> {
    return notConfigured();
  }

  getUrl(): string {
    return notConfigured();
  }

  async delete(): Promise<void> {
    notConfigured();
  }

  async stat(): Promise<StorageObjectStat | null> {
    return notConfigured();
  }

  async listKeys(): Promise<string[]> {
    return notConfigured();
  }

  openReadStream(): Readable {
    return notConfigured();
  }
}
