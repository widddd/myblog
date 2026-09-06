import { z } from "zod";

import { isManagedUpdateFileName } from "@/lib/update/filename";

export const updateApplyPostSchema = z.object({
  name: z.string().refine(isManagedUpdateFileName, "更新包文件名不合法"),
  confirm: z.literal(true),
});

export const updateApplyPutSchema = z.union([
  z.object({ restartNow: z.literal(true) }),
  z.object({
    restartAt: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), "重启时间不合法"),
  }),
]);
