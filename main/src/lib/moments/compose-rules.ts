/**
 * 发瞬间的跨字段规则（**唯一判定点**，纯函数、无依赖，client 可引用）。
 *
 * 站点侧有两处要用同一条规则：
 *  - POST 的 zod schema（`lib/validation/post.ts` 的 `momentWriteSchema`）
 *  - PATCH 合并「入参 + 现有行」之后（`lib/moments/admin.ts` 的 `updateAdminMoment`）
 * 发布区前端也要在点「发布」之前用同一句话拦一次（`MomentCompose`）。
 * 拆到这个没有 zod / prisma 的文件里，是为了让 client 组件拿文案与规则，
 * 而不把整条校验链拖进浏览器包。
 *
 * 媒体分三类（见 docs/moment-audio-spec.md）：
 *  - 图片：九宫格，数量吃「图片 + 视频 ≤ 9」；
 *  - 视频：≤ 1 个、≤ 30 分钟（docs/moment-video-spec.md）；
 *  - 语音：≤ 5 条、单条 ≤ 5 分钟，**不占**图片/视频那 9 个名额，展示上单独成区。
 */

/** 一条瞬间最多几个视频（用户决策 2026-10-11，见 docs/moment-video-spec.md）。 */
export const MOMENT_MAX_VIDEOS = 1;

/**
 * **视频时长硬上限 30 分钟**（用户决策 2026-10-11，与 Android 侧 `CompressPolicy.MAX_DURATION_MS` 同口径）。
 *
 * 这是一条产品规则，不是压缩策略：半小时以上的视频一律不许发 —— 客户端拦在选择阶段，
 * 服务端在「声明了 duration」的路径上兜底（瞬间发布的媒体项带 duration；浏览器直传媒体库的文件
 * 没有服务端时长探测，站点不装 ffmpeg，那条路只由 App 相册视图拦）。
 */
export const MOMENT_MAX_VIDEO_MS = 30 * 60 * 1000;
export const MOMENT_MAX_VIDEO_MINUTES = MOMENT_MAX_VIDEO_MS / 60_000;

/** 一条瞬间最多几条语音（用户决策，见 docs/moment-audio-spec.md）。 */
export const MOMENT_MAX_AUDIOS = 5;

/** **单条**语音的时长上限 5 分钟（不是"合计 5 分钟"，与 Android 侧 `VoiceRecorderPolicy.MAX_DURATION_MS` 同口径）。 */
export const MOMENT_MAX_AUDIO_MS = 5 * 60 * 1000;
export const MOMENT_MAX_AUDIO_MINUTES = MOMENT_MAX_AUDIO_MS / 60_000;

/** 图片 + 视频的条数上限（语音不占这个名额）。 */
export const MOMENT_MAX_MEDIA_ITEMS = 9;

/** `Moment.images` JSON 数组的硬上限：非音频 9 条 + 语音 5 条（zod 与前端共用）。 */
export const MOMENT_MAX_MEDIA_TOTAL = MOMENT_MAX_MEDIA_ITEMS + MOMENT_MAX_AUDIOS;

export const MOMENT_EMPTY_ERROR = "写点什么，或者选一张图片 / 视频 / 录音吧";
export const MOMENT_VIDEO_LIMIT_ERROR = `一条瞬间最多 ${MOMENT_MAX_VIDEOS} 个视频`;
export const MOMENT_VIDEO_TOO_LONG_ERROR = `视频不能超过 ${MOMENT_MAX_VIDEO_MINUTES} 分钟，请先剪短`;
export const MOMENT_MEDIA_LIMIT_ERROR = `一条瞬间最多 ${MOMENT_MAX_MEDIA_ITEMS} 个图片 / 视频`;
export const MOMENT_AUDIO_LIMIT_ERROR = `一条瞬间最多 ${MOMENT_MAX_AUDIOS} 条语音`;
export const MOMENT_AUDIO_TOO_LONG_ERROR = `语音不能超过 ${MOMENT_MAX_AUDIO_MINUTES} 分钟`;

/** 规则只需要这三个字段，宽一点的入参也收（Prisma 行、上传结果都能直接喂进来）。 */
export type MomentRuleMedia = {
  kind?: "image" | "video" | "audio" | undefined;
  duration?: number | undefined;
};

/** 会进九宫格的媒体（图片 / 视频）—— 语音单独成区，不进格子。 */
export type MomentVisualKind = "image" | "video";

/** `m:ss` / `h:mm:ss`（与 App 侧 `CompressPolicy.clockOf()` 同一套写法）。 */
export function momentClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** 这条瞬间里有几个视频（发布区算「还能不能再选一个」用）。 */
export function countMomentVideos(images: Array<{ kind?: "image" | "video" | "audio" }>): number {
  return images.filter((image) => image.kind === "video").length;
}

/** 这条瞬间里有几条语音（发布区算「还能不能继续录」用）。 */
export function countMomentAudios(images: Array<{ kind?: "image" | "video" | "audio" }>): number {
  return images.filter((image) => image.kind === "audio").length;
}

/**
 * 媒体分区：**展示分区的唯一入口**（图片/视频进九宫格，语音进独立播放行）。
 * 保持原有相对顺序，只做划分，不改内容。
 *
 * 返回类型按 kind 收窄（`visual` 只可能是 image/video）——这样九宫格那侧（`SortableImageGrid`
 * 只认 image/video）不用再自己判一次。收窄由这里的划分保证，不是猜的。
 */
export function splitMomentMedia<T extends { kind?: "image" | "video" | "audio" }>(
  media: T[],
): {
  visual: Array<T & { kind?: MomentVisualKind }>;
  audios: Array<T & { kind: "audio" }>;
} {
  const visual: Array<T & { kind?: MomentVisualKind }> = [];
  const audios: Array<T & { kind: "audio" }> = [];
  for (const item of media) {
    if (item.kind === "audio") {
      audios.push(item as T & { kind: "audio" });
    } else {
      visual.push(item as T & { kind?: MomentVisualKind });
    }
  }
  return { visual, audios };
}

export function momentContentError(input: {
  content: string;
  images?: MomentRuleMedia[];
}): string | null {
  const images = input.images ?? [];
  const visual = images.filter((image) => image.kind !== "audio");
  const audios = images.filter((image) => image.kind === "audio");

  if (!input.content.trim() && images.length === 0) {
    return MOMENT_EMPTY_ERROR;
  }
  if (visual.length > MOMENT_MAX_MEDIA_ITEMS) {
    return MOMENT_MEDIA_LIMIT_ERROR;
  }
  if (countMomentVideos(images) > MOMENT_MAX_VIDEOS) {
    return MOMENT_VIDEO_LIMIT_ERROR;
  }
  if (visual.some((image) => image.kind === "video" && (image.duration ?? 0) > MOMENT_MAX_VIDEO_MS)) {
    return MOMENT_VIDEO_TOO_LONG_ERROR;
  }
  if (audios.length > MOMENT_MAX_AUDIOS) {
    return MOMENT_AUDIO_LIMIT_ERROR;
  }
  if (audios.some((audio) => (audio.duration ?? 0) > MOMENT_MAX_AUDIO_MS)) {
    return MOMENT_AUDIO_TOO_LONG_ERROR;
  }
  return null;
}
