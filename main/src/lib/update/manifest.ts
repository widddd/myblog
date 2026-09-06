import { APP_CHANNEL, APP_RELEASE_LABEL, APP_VERSION } from "@/lib/release";
import { UpdateError } from "@/lib/update/errors";

export const UPDATE_KIND = "app-update";
export const UPDATE_SCHEMA = 1;

export type UpdateManifest = {
  kind: typeof UPDATE_KIND;
  schema: number;
  channel: string | null;
  version: string | null;
  label: string;
  createdAt: string;
  files?: number;
};

export function currentUpdateManifest(
  extra: { createdAt?: string; files?: number } = {},
): UpdateManifest {
  return {
    kind: UPDATE_KIND,
    schema: UPDATE_SCHEMA,
    channel: APP_CHANNEL,
    version: APP_VERSION,
    label: APP_RELEASE_LABEL,
    createdAt: extra.createdAt ?? new Date().toISOString(),
    files: extra.files,
  };
}

export function parseUpdateManifest(raw: string): UpdateManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UpdateError("INVALID_ARCHIVE", "更新包 meta.json 不是合法 JSON", 400);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new UpdateError("INVALID_ARCHIVE", "更新包 meta.json 格式不对", 400);
  }
  const body = parsed as Record<string, unknown>;
  if (body.kind !== UPDATE_KIND) {
    throw new UpdateError(
      "INVALID_ARCHIVE",
      "这不是博客程序更新包（缺少 app-update 标记）",
      400,
    );
  }
  const schema = typeof body.schema === "number" ? body.schema : Number(body.schema);
  if (!Number.isInteger(schema) || schema < 1) {
    throw new UpdateError("INVALID_ARCHIVE", "更新包 schema 不合法", 400);
  }
  if (schema > UPDATE_SCHEMA) {
    throw new UpdateError(
      "UNSUPPORTED",
      `这份更新包格式更新（schema ${schema}），当前程序无法导入`,
      400,
    );
  }
  const channel =
    typeof body.channel === "string" && body.channel.trim()
      ? body.channel.trim()
      : null;
  const version =
    typeof body.version === "string" && body.version.trim()
      ? body.version.trim()
      : null;
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim()
      : "未知版本";
  const createdAt =
    typeof body.createdAt === "string" && !Number.isNaN(Date.parse(body.createdAt))
      ? body.createdAt
      : new Date(0).toISOString();
  const files = typeof body.files === "number" && Number.isFinite(body.files)
    ? body.files
    : undefined;
  return {
    kind: UPDATE_KIND,
    schema,
    channel,
    version,
    label,
    createdAt,
    files,
  };
}
