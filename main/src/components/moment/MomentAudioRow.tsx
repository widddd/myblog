"use client";

import { PauseIcon, PlayIcon, TrashIcon } from "@radix-ui/react-icons";
import { useMemo, useRef, useState } from "react";

import { momentClock } from "@/lib/moments/compose-rules";
import { peaksFor } from "@/lib/moments/peaks";
import { cn } from "@/lib/utils/cn";

/** 播放行/录音列表要渲染的最小形状（瞬间媒体项、发布区草稿、媒体库条目都能喂进来）。 */
export type MomentAudioItem = {
  key: string;
  src: string;
  /** 秒 */
  duration?: number;
  /** 峰值；缺了就按 key 生成确定性图案（见 lib/moments/peaks.ts） */
  peaks?: unknown;
};

/**
 * 条状波形：**只负责画**，进度高亮由 `progress`（0–1）决定。
 *
 * 峰值一律走 `peaksFor()` —— 有真峰值用真的，没有就用按媒体 key 生成的确定性图案，
 * 所以服务端渲染与浏览器 hydration 拿到的是同一串数字（见 docs/moment-audio-spec.md §2.6）。
 */
export function MomentWaveform({
  peaks,
  progress = 0,
  compact = false,
}: {
  peaks: number[];
  progress?: number;
  compact?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("moment-audio__wave", compact && "is-compact")}
    >
      {peaks.map((value, index) => (
        <i
          data-played={Math.round(progress * peaks.length) > index ? "true" : undefined}
          key={index}
          style={{ height: `${Math.max(8, value)}%` }}
        />
      ))}
    </span>
  );
}

/**
 * 一条语音的播放行：▶/⏸ + 波形（播到哪亮到哪）+ 时长。
 *
 * 与图片/视频**分开展示**（不占九宫格、不进灯箱）。浏览器不支持这个音频格式时
 * （典型：iOS Safari 放不了 Chrome 录的 WebM/Opus）不假装能播，直接给一条下载链接。
 */
export function MomentAudioRow({
  item,
  index = 0,
  disabled = false,
  onRemove,
  className,
}: {
  item: MomentAudioItem;
  index?: number;
  disabled?: boolean;
  /** 发布区的草稿列表才有删除按钮（前台只读） */
  onRemove?: () => void;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [failed, setFailed] = useState(false);
  const peaks = useMemo(
    () => peaksFor({ key: item.key, peaks: item.peaks }),
    [item.key, item.peaks],
  );
  const durationMs = (item.duration ?? 0) * 1000;
  const progress =
    playing && durationMs > 0 ? Math.min(1, elapsedMs / durationMs) : 0;

  function toggle() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      void audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }

  return (
    <div className={cn("moment-audio", className)} data-index={index}>
      <button
        aria-label={playing ? "暂停语音" : "播放语音"}
        className="moment-audio__play"
        disabled={failed}
        onClick={toggle}
        type="button"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <MomentWaveform peaks={peaks} progress={progress} />
      <span className="moment-audio__time">
        {momentClock(playing ? elapsedMs : durationMs)}
      </span>
      {failed ? (
        <a className="moment-audio__download" href={item.src}>
          下载
        </a>
      ) : null}
      {onRemove ? (
        <button
          aria-label="删除这条语音"
          className="moment-audio__remove"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          <TrashIcon />
        </button>
      ) : null}
      <audio
        hidden
        onEnded={() => {
          setPlaying(false);
          setElapsedMs(0);
        }}
        onError={() => {
          setPlaying(false);
          setFailed(true);
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => {
          setElapsedMs(Math.round(event.currentTarget.currentTime * 1000));
        }}
        preload="metadata"
        ref={audioRef}
        src={item.src}
      />
    </div>
  );
}

/**
 * 不可点的语音小标（首页瞬间卡用）。
 *
 * 首页那张卡整体是一个 `<Link>`：里面再塞一个能播的 `<audio>` 会变成"链接里套控件"，
 * 点哪都可能跳走。所以那里只画"波形 + 时长"一眼能看懂的东西，点整卡进瞬间页再播。
 */
export function MomentVoiceChip({ items }: { items: MomentAudioItem[] }) {
  const first = items[0];
  if (!first) {
    return null;
  }
  const peaks = peaksFor({ key: first.key, peaks: first.peaks });
  const seconds = items.reduce((total, item) => total + (item.duration ?? 0), 0);
  return (
    <div className="home-moment__voice">
      <span className="home-moment__voice-icon">🎙</span>
      <MomentWaveform compact peaks={peaks.slice(0, 24)} />
      <span className="home-moment__voice-time">
        {momentClock(seconds * 1000)}
        {items.length > 1 ? ` · ${items.length} 条` : ""}
      </span>
    </div>
  );
}
