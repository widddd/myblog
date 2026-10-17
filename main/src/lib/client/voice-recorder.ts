/**
 * 网页端录音的纯逻辑（**不 import React、不在模块顶层碰 window**，可以直接单测）。
 *
 * 只有两件事需要在这里收口：① MediaRecorder 到底能吃哪种 mime（浏览器各写各的）；
 * ② 出错时给用户一句人话（`NotAllowedError` 这种名字不是给站长看的）。
 * 真正的录音、波形、计时在 `components/admin/VoiceRecorderPanel.tsx` 里。
 *
 * 见 docs/moment-audio-spec.md §2.4。
 */

import { MOMENT_MAX_AUDIO_MS } from "@/lib/moments/compose-rules";

/** 单条语音时长上限（与瞬间规则同一个常量，别在这里另写一个 300000）。 */
export const VOICE_MAX_MS = MOMENT_MAX_AUDIO_MS;

/** 目标码率：128 kbps（产品口径就是"128k"；浏览器不一定完全照做，实际值随 mime 走）。 */
export const VOICE_BITS_PER_SECOND = 128_000;

/**
 * 实时波形的**采样间隔**：100ms 一根。
 *
 * 与 `VOICE_LIVE_SLOTS` 一起定死"一格 = 一格时间"：卡片上永远画 `VOICE_LIVE_SLOTS` 个槽位，
 * 录满 10 秒之前只填左边那几个槽（从左往右长），之后整条往左滚 —— 永远显示**过去 10 秒**。
 * 见 docs/moment-audio-spec.md §2.4 与用户口径（P-189 的姊妹条）。
 */
export const VOICE_SAMPLE_MS = 100;

/** 实时波形的时间窗口：10 秒（用户口径：一行只显示十秒钟） */
export const VOICE_LIVE_WINDOW_MS = 10_000;

/** 实时波形的槽位数 = 10 秒 ÷ 100ms */
export const VOICE_LIVE_SLOTS = VOICE_LIVE_WINDOW_MS / VOICE_SAMPLE_MS;

/**
 * 实时波形：第 `slot` 个槽位（0 = 最左，`slots - 1` = 最右）显示窗口里的第几根。
 *
 * 用户口径（别自己改方向）：**从最左边开始向右生长**；录满 10 秒后每来一根，
 * 整条波形向左滚动一格，最新的一根始终在最右边，屏幕上永远显示过去 10 秒。
 * 因为 `pushLiveBar()` 已经把数组裁成"0 = 最旧、末尾 = 最新"，槽位与下标同向。
 *
 * 与 Android `VoiceRecorderPolicy.liveSlot()` 同一套算式（两边各有单测钉住方向）。
 */
export function liveSampleIndexFor(slot: number, slots: number = VOICE_LIVE_SLOTS): number {
  return Math.min(Math.max(0, Math.floor(slot)), Math.max(0, slots - 1));
}

/**
 * MediaRecorder 的 mimeType 候选，**按优先级**：
 * WebM/Opus（Chrome/Firefox）→ Ogg/Opus（老 Firefox）→ MP4/AAC（Safari）。
 * 全都探测不到时返回 null，交给浏览器自己挑（`new MediaRecorder(stream)`）。
 */
export const VOICE_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
] as const;

/** 挑一个浏览器支持的 mimeType；`supported` 由调用方给（`MediaRecorder.isTypeSupported`）。 */
export function pickVoiceMime(
  supported: (mime: string) => boolean,
): string | null {
  for (const candidate of VOICE_MIME_CANDIDATES) {
    try {
      if (supported(candidate)) {
        return candidate;
      }
    } catch {
      // isTypeSupported 理论上不抛，真抛了就当它不支持
    }
  }
  return null;
}

/** `audio/webm;codecs=opus` → `audio/webm`（带参数的 mime 不能直接进媒体库） */
export function baseMime(mime: string | null | undefined): string {
  const value = (mime ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return value.startsWith("audio/") ? value : "";
}

/** 录音文件的扩展名：与 `lib/storage/media-keys.ts` 的音频白名单对齐。 */
export function voiceExtension(mime: string | null | undefined): string {
  const base = baseMime(mime);
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/m4a") {
    return "m4a";
  }
  if (base === "audio/ogg" || base === "audio/opus") {
    return "ogg";
  }
  return "webm";
}

/** 录音文件名（服务端要能对上扩展名白名单：weba/webm、m4a/mp4、ogg…）。 */
export function voiceFileName(
  mime: string | null | undefined,
  now: number,
): string {
  const stamp = new Date(now)
    .toISOString()
    .replace(/[:T]/g, "-")
    .slice(0, 19);
  return `voice-${stamp}.${voiceExtension(mime)}`;
}

/** MediaRecorder 报出来的实际 mimeType → 存进瞬间 JSON 的 `mime`（未知就按 webm）。 */
export function voiceMimeForStore(mime: string | null | undefined): string {
  return baseMime(mime) || "audio/webm";
}

/** 麦克风失败 → 一句人话（站长看不懂 `NotAllowedError`）。 */
export function microphoneErrorMessage(error: unknown): string {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "没拿到麦克风权限：请检查浏览器地址栏的权限设置（站点也要走 HTTPS）";
    case "NotFoundError":
    case "OverconstrainedError":
      return "这台设备上没有可用的麦克风";
    case "NotReadableError":
      return "麦克风被别的程序占用了，先关掉它再试一次";
    case "NotSupportedError":
      return "这个浏览器不支持网页录音，请换 Chrome / Firefox / Safari 的新版本";
    default:
      return "录音启动失败，请重试一次；还不行就换个浏览器";
  }
}
