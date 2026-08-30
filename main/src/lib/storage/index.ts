import { LocalDriver } from "./local";
import { OssDriver } from "./oss";
import type { StorageDriver, StorageDriverName } from "./types";

const drivers: Record<StorageDriverName, StorageDriver> = {
  local: new LocalDriver(),
  oss: new OssDriver(),
};

export function getDriver(name?: string): StorageDriver {
  const selected = (name ?? "local").trim();
  if (selected !== "local" && selected !== "oss") {
    throw new Error(`不支持的存储驱动：${selected}`);
  }
  return drivers[selected];
}

export * from "./types";
