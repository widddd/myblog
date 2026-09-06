import { z } from "zod";

import { IMAGE_HASH_PATTERN } from "@/lib/upload/limits";

export const finalizeUploadSchema = z.object({
  hash: z
    .string()
    .regex(IMAGE_HASH_PATTERN, "无效的文件哈希"),
  step: z.enum(["derivatives", "replicate"]),
});
