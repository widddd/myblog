import { z } from "zod";

import {
  DATA_CLEAR_TARGETS,
  dataClearConfirmation,
  normalizeDataClearTargets,
} from "@/lib/data-clear/contract";

const operationId = z.string().regex(/^[a-f0-9]{64}$/, "清理令牌不合法");

export const dataClearPostSchema = z
  .object({
    targets: z
      .array(z.enum(DATA_CLEAR_TARGETS))
      .min(1, "至少选择一个清理范围")
      .max(2, "清理范围不合法")
      .refine((targets) => new Set(targets).size === targets.length, "清理范围不能重复"),
    confirmation: z.string().max(64),
    acknowledged: z.literal(true),
  })
  .transform((value) => ({
    ...value,
    targets: normalizeDataClearTargets(value.targets),
  }))
  .refine(
    (value) => value.confirmation === dataClearConfirmation(value.targets),
    {
      message: "确认短语不正确",
      path: ["confirmation"],
    },
  );

export const dataClearExecuteSchema = z.object({
  operationId,
});

export const dataClearCancelSchema = z.object({
  operationId,
});
