/** 瞬间媒体（图片 / 视频 / 语音）的类型标记；缺省一律按图片处理（旧数据零改动）。 */
export type MomentMediaKind = "image" | "video" | "audio";

/**
 * 一条瞬间里的一项媒体。
 *
 * 2026-10 起支持视频：`kind` 缺省 = 图片（旧行 JSON 里没有这个字段），
 * 视频带 `mime`/`duration`，**没有 `thumb`**（站点不装 ffmpeg，不生成视频封面，
 * 见 docs/moment-video-spec.md）。字段加在 JSON 里，不改表结构、不需要迁移。
 *
 * 本轮再加**语音**（`kind: "audio"`，见 docs/moment-audio-spec.md）：
 * 音频同样是 `mime` + `duration` 组合，外加可选的 `peaks` 波形峰值。
 */
export type MomentImage = {
  key: string;
  /** 一级缩略图（只有图片有） */
  thumb?: string;
  width?: number;
  height?: number;
  kind?: MomentMediaKind;
  /** 视频 / 音频真实 mime（video/mp4、video/webm、audio/webm、audio/mp4…）；图片不写 */
  mime?: string;
  /** 视频 / 音频时长（秒；发布端探测不到就不写） */
  duration?: number;
  /**
   * 语音波形峰值（每项 0–100，最多 `MOMENT_PEAK_BUCKETS` 个）。
   *
   * **尽力而为**：网页录音时从 AnalyserNode 实时采集，所以是真实波形；
   * App 原生录音与「从媒体库选语音」拿不到采样，这个字段就缺失，
   * 渲染端用 `lib/moments/peaks.ts` 的确定性图案兜底（见 docs/moment-audio-spec.md §2.6）。
   */
  peaks?: number[];
};

/**
 * 这一项是图片、视频还是语音 —— **唯一判定点**。
 *
 * 缺 `kind` 当图片，所以旧数据（以及任何没写 kind 的调用方）行为与改造前完全一致；
 * 渲染端不要各写一份 `kind === "video" ? … : …` 的反面判断。
 */
export function momentMediaKind(media: { kind?: MomentMediaKind }): MomentMediaKind {
  if (media.kind === "audio") {
    return "audio";
  }
  return media.kind === "video" ? "video" : "image";
}

export type PublicMomentImage = MomentImage & {
  src: string;
  /** 视频 / 音频没有一级缩略图：只有图片才有 */
  thumbSrc?: string;
};

export type PublicMoment = {
  id: number;
  content: string;
  images: PublicMomentImage[];
  createdAt: Date | string;
  likeCount: number;
  liked: boolean;
};

export type HomeMomentImage = {
  key: string;
  src: string;
  thumbSrc?: string;
  thumb2Src?: string;
  width?: number;
  height?: number;
  kind?: MomentMediaKind;
  mime?: string;
  duration?: number;
  peaks?: number[];
};

export type HomeMoment = {
  id: number;
  content: string;
  images: HomeMomentImage[];
  /** 首页文章流里的瞬间卡要显示相对时间（瞬间模块本身不用，多带一个字段无副作用） */
  createdAt: Date | string;
};
