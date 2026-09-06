import { CosDriver } from "./cos";
import { LocalDriver } from "./local";
import type { StorageDriver, StorageDriverName } from "./types";

export function normalizeDriverName(name?: string | null): StorageDriverName {
  const selected = (name ?? "local").trim();
  if (selected === "oss" || selected === "cos") {
    return "cos";
  }
  if (selected !== "local") {
    throw new Error(`不支持的存储驱动：${selected}`);
  }
  return "local";
}

const drivers: Record<StorageDriverName, StorageDriver> = {
  local: new LocalDriver(),
  cos: new CosDriver(),
};

export function getDriver(name?: string | null): StorageDriver {
  return drivers[normalizeDriverName(name)];
}

export * from "./cos-config";
export * from "./media-keys";
export * from "./public-url";
export * from "./types";
