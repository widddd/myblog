export const DATA_CLEAR_WAIT_MS = 15_000;

export const DATA_CLEAR_TARGETS = ["data", "admin"] as const;

export type DataClearTarget = (typeof DATA_CLEAR_TARGETS)[number];

export const DATA_CLEAR_TARGET_LABELS: Record<DataClearTarget, string> = {
  data: "删除数据",
  admin: "删除管理员账号",
};

export function normalizeDataClearTargets(
  targets: readonly DataClearTarget[],
): DataClearTarget[] {
  const selected = new Set(targets);
  return DATA_CLEAR_TARGETS.filter((target) => selected.has(target));
}

export function dataClearConfirmation(
  targets: readonly DataClearTarget[],
): string {
  const normalized = normalizeDataClearTargets(targets);
  if (normalized.length === 2) {
    return "删除数据和管理员账号";
  }
  return normalized[0] ? DATA_CLEAR_TARGET_LABELS[normalized[0]] : "";
}
