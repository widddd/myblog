import { z } from "zod";

import {
  MOMENT_VISIBILITY_DAYS_MAX,
  MOMENT_VISIBILITY_GROUP_NAME_MAX,
} from "@/lib/moments/visibility";

export const momentVisibilityGroupWriteSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "组名不能为空")
    .max(MOMENT_VISIBILITY_GROUP_NAME_MAX, `组名最多 ${MOMENT_VISIBILITY_GROUP_NAME_MAX} 字`),
  days: z
    .number()
    .int("天数必须是整数")
    .min(1, "天数至少 1 天")
    .max(MOMENT_VISIBILITY_DAYS_MAX, `天数最多 ${MOMENT_VISIBILITY_DAYS_MAX} 天`),
});

export const momentVisibilityGroupPatchSchema =
  momentVisibilityGroupWriteSchema.partial();

export type MomentVisibilityGroupInput = z.infer<
  typeof momentVisibilityGroupWriteSchema
>;
