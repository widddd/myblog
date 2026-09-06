import { UpdateError } from "./errors";

const DENIED_PREFIXES = [
  "data/",
  "node_modules/",
  ".next/",
  ".git/",
  "coverage/",
] as const;

const DENIED_ROOTS = new Set([
  "data",
  "node_modules",
  ".next",
  ".git",
  "coverage",
]);

const SKIP_NAMES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
]);

export const NEVER_OVERLAY_ROOTS = new Set([
  "data",
  "node_modules",
  ".next",
  ".git",
]);

export function toPosixPath(name: string): string | null {
  if (!name || name.includes("\\") || name.includes("\0")) {
    return null;
  }
  const posix = name.replace(/\\/g, "/").replace(/^\.\//, "");
  if (posix.startsWith("/") || posix.split("/").some((part) => part === "..")) {
    return null;
  }
  return posix;
}

function hasDeniedPrefix(posix: string): boolean {
  const root = posix.split("/")[0] ?? posix;
  if (DENIED_ROOTS.has(root)) {
    return true;
  }
  if (posix === ".env" || posix.startsWith(".env.")) {
    return true;
  }
  return DENIED_PREFIXES.some(
    (prefix) => posix === prefix.slice(0, -1) || posix.startsWith(prefix),
  );
}

export function isSkippedPackName(posix: string): boolean {
  const base = posix.split("/").pop()?.toLowerCase() ?? "";
  if (SKIP_NAMES.has(base)) {
    return true;
  }
  if (base.endsWith(".tsbuildinfo") || base.endsWith(".log")) {
    return true;
  }
  return base.endsWith(".test.ts") || base.endsWith(".test.tsx");
}

export function isAllowedUpdatePath(posix: string): boolean {
  if (!posix || hasDeniedPrefix(posix) || isSkippedPackName(posix)) {
    return false;
  }
  return true;
}

export function shouldTraversePackDir(posix: string): boolean {
  if (!posix) {
    return true;
  }
  if (hasDeniedPrefix(posix) || isSkippedPackName(posix)) {
    return false;
  }
  return true;
}

export function classifyUpdateEntry(name: string): string | null {
  const posix = toPosixPath(name);
  if (!posix || posix.endsWith("/")) {
    return null;
  }
  if (!isAllowedUpdatePath(posix)) {
    return null;
  }
  return posix;
}

export function assertRequiredUpdateFiles(files: readonly string[]): void {
  if (files.length < 1) {
    throw new UpdateError("INVALID_ARCHIVE", "更新包没有程序文件", 400);
  }
  if (!files.includes("package.json")) {
    throw new UpdateError("INVALID_ARCHIVE", "更新包缺少 package.json", 400);
  }
  if (!files.some((name) => name === "src" || name.startsWith("src/"))) {
    throw new UpdateError("INVALID_ARCHIVE", "更新包缺少 src/ 程序文件", 400);
  }
}

/** Top-level directories present in the package; overlay deletes files missing from the archive. */
export function overlayRootsFromFiles(files: readonly string[]): string[] {
  const roots = new Set<string>();
  for (const name of files) {
    if (name === "meta.json") {
      continue;
    }
    const slash = name.indexOf("/");
    if (slash <= 0) {
      continue;
    }
    const root = name.slice(0, slash);
    if (!root || NEVER_OVERLAY_ROOTS.has(root) || root.startsWith(".env")) {
      continue;
    }
    roots.add(root);
  }
  return [...roots];
}
