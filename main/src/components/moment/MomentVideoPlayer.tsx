"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { momentClock } from "@/lib/moments/compose-rules";
import { cn } from "@/lib/utils/cn";

type MomentVideoSource = {
  key: string;
  src: string;
  width?: number;
  height?: number;
  duration?: number;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function initialPortrait(video: MomentVideoSource): boolean {
  return Boolean(
    video.width &&
      video.height &&
      Number.isFinite(video.width) &&
      Number.isFinite(video.height) &&
      video.height > video.width,
  );
}

/**
 * 瞬间视频的**首帧预览 + 自绘播放器**。
 *
 * 产品口径：
 *  - 首页 / 瞬间页的瓦片不能是纯黑块：用 `<video preload="metadata">` 拉首帧，
 *    加载出来前先铺渐变占位，避免闪黑；
 *  - 点击瓦片打开独立播放层，**不用浏览器原生 controls**；
 *  - 控件只保留播放/暂停、进度、音量；移动端每个可点目标至少 44×44px；
 *  - 手机竖屏视频自动铺满当前视口；另提供全屏按钮，浏览器拒绝 Fullscreen API
 *    时退化为「浮层铺满视口」，横屏仍沿用居中的卡片布局。
 *
 * 首帧预览只是“预览”，不做 canvas 截帧（视频可能直连 COS，跨域取帧会污染画布）。
 * 让浏览器把视频 seek 到 0.1s 并显示当前帧是最稳、也最省流量的做法。
 */
export function MomentVideoPlayer({
  alt,
  className,
  style,
  video,
}: {
  alt: string;
  className?: string;
  style?: CSSProperties;
  video: MomentVideoSource;
}) {
  const [open, setOpen] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(video.duration ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [portrait, setPortrait] = useState(() => initialPortrait(video));
  const [fullscreen, setFullscreen] = useState(false);
  /**
   * 浏览器没有 Fullscreen API（或调用被拒）时的兜底：把浮层铺满当前视口。
   * 竖屏视频在手机档本来就会走满视口布局，这个状态主要保障横屏/桌面也能全屏查看。
   */
  const [expanded, setExpanded] = useState(false);
  const playerRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const doc = document as FullscreenDocument;
    const sync = () => {
      const element = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setFullscreen(element === overlayRef.current);
      if (element === overlayRef.current) {
        setExpanded(false);
      }
    };
    doc.addEventListener("fullscreenchange", sync);
    doc.addEventListener("webkitfullscreenchange", sync);
    return () => {
      doc.removeEventListener("fullscreenchange", sync);
      doc.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const node = playerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void closePlayer();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    if (node) {
      node.volume = volume;
      node.muted = muted;
      void node.play().catch(() => {
        // 自动播放被拦截也不报错：用户点中间的大按钮即可。
      });
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      node?.pause();
    };
    // volume / muted 在打开瞬间读一次即可；播放中由原生事件回写 state。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const previewSrc = `${video.src}${video.src.includes("#") ? "" : "#t=0.1"}`;
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  function togglePlayback() {
    const node = playerRef.current;
    if (!node) {
      return;
    }
    if (node.paused) {
      void node.play().catch(() => undefined);
    } else {
      node.pause();
    }
  }

  function seekTo(value: number) {
    const node = playerRef.current;
    if (!node) {
      return;
    }
    node.currentTime = value;
    setCurrentTime(value);
  }

  function changeVolume(value: number) {
    const node = playerRef.current;
    const next = Math.min(1, Math.max(0, value));
    setVolume(next);
    setMuted(next === 0);
    if (node) {
      node.volume = next;
      node.muted = next === 0;
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (playerRef.current) {
      playerRef.current.muted = nextMuted;
    }
  }

  function syncPortraitFromVideo(node: HTMLVideoElement) {
    if (node.videoWidth > 0 && node.videoHeight > 0) {
      setPortrait(node.videoHeight > node.videoWidth);
    }
  }

  async function exitFullscreen() {
    const doc = document as FullscreenDocument;
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else {
          await doc.webkitExitFullscreen?.();
        }
      }
    } catch {
      // 浏览器可能已经自行退出全屏；不影响关闭播放层。
    }
    setExpanded(false);
  }

  async function closePlayer() {
    await exitFullscreen();
    setOpen(false);
  }

  async function toggleFullscreen() {
    if (fullscreen) {
      await exitFullscreen();
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    const node = overlayRef.current as FullscreenElement | null;
    if (!node) {
      return;
    }
    try {
      if (node.requestFullscreen) {
        await node.requestFullscreen();
        return;
      }
      if (node.webkitRequestFullscreen) {
        await node.webkitRequestFullscreen();
        return;
      }
    } catch {
      // 用户手势、权限或浏览器实现拒绝时，退回“铺满当前视口”的 CSS 全屏。
    }
    setExpanded(true);
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      void closePlayer();
    }
  }

  return (
    <>
      <button
        aria-label={`播放视频：${alt}`}
        className={cn("moment-video-preview", className)}
        data-portrait={portrait ? "true" : "false"}
        data-ready={previewReady ? "true" : "false"}
        onClick={() => setOpen(true)}
        style={style}
        type="button"
      >
        <video
          aria-hidden="true"
          className="moment-video-preview__media"
          muted
          onLoadedData={() => setPreviewReady(true)}
          onLoadedMetadata={(event) => {
            const node = event.currentTarget;
            syncPortraitFromVideo(node);
            const target = Number.isFinite(node.duration)
              ? Math.min(0.1, Math.max(0, node.duration / 2))
              : 0.1;
            try {
              node.currentTime = target;
            } catch {
              // 某些浏览器在 metadata 阶段不允许 seek；loadeddata 仍会给出首帧。
            }
          }}
          onSeeked={() => setPreviewReady(true)}
          playsInline
          preload="metadata"
          src={previewSrc}
          tabIndex={-1}
        />
        <span aria-hidden="true" className="moment-video-preview__shade" />
        <span aria-hidden="true" className="moment-video-preview__play">
          ▶
        </span>
        {video.duration ? (
          <span className="moment-video-preview__duration">
            {momentClock(video.duration * 1000)}
          </span>
        ) : null}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-label={`视频播放器：${alt}`}
              aria-modal="true"
              className="moment-video-player"
              data-expanded={expanded ? "true" : "false"}
              data-fullscreen={fullscreen ? "true" : "false"}
              data-portrait={portrait ? "true" : "false"}
              onClick={closeOnBackdrop}
              ref={overlayRef}
              role="dialog"
            >
              <div className="moment-video-player__panel">
                <div className="moment-video-player__top">
                  <span className="moment-video-player__title">{alt}</span>
                  <button
                    aria-label={fullscreen || expanded ? "退出全屏" : "全屏"}
                    className="moment-video-player__icon-btn moment-video-player__fullscreen"
                    onClick={() => void toggleFullscreen()}
                    title={fullscreen || expanded ? "退出全屏" : "全屏"}
                    type="button"
                  >
                    {fullscreen || expanded ? "退出全屏" : "全屏"}
                  </button>
                  <button
                    aria-label="关闭视频播放器"
                    className="moment-video-player__icon-btn"
                    onClick={() => void closePlayer()}
                    type="button"
                  >
                    ×
                  </button>
                </div>

                <div className="moment-video-player__stage">
                  <video
                    className="moment-video-player__video"
                    onClick={togglePlayback}
                    onDurationChange={(event) => {
                      const value = event.currentTarget.duration;
                      if (Number.isFinite(value) && value > 0) {
                        setDuration(value);
                      }
                    }}
                    onEnded={(event) => {
                      setPlaying(false);
                      event.currentTarget.currentTime = 0;
                      setCurrentTime(0);
                    }}
                    onLoadedMetadata={(event) => {
                      const node = event.currentTarget;
                      const value = node.duration;
                      if (Number.isFinite(value) && value > 0) {
                        setDuration(value);
                      }
                      syncPortraitFromVideo(node);
                      node.volume = volume;
                      node.muted = muted;
                    }}
                    onPause={() => setPlaying(false)}
                    onPlay={() => setPlaying(true)}
                    onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                    onVolumeChange={(event) => {
                      setVolume(event.currentTarget.volume);
                      setMuted(event.currentTarget.muted || event.currentTarget.volume === 0);
                    }}
                    playsInline
                    preload="metadata"
                    ref={playerRef}
                    src={video.src}
                  />
                  {playing ? null : (
                    <button
                      aria-label="播放视频"
                      className="moment-video-player__center-btn"
                      onClick={togglePlayback}
                      type="button"
                    >
                      <span aria-hidden="true">▶</span>
                    </button>
                  )}
                </div>

                <div className="moment-video-player__controls">
                  <button
                    aria-label={playing ? "暂停" : "播放"}
                    className="moment-video-player__icon-btn"
                    onClick={togglePlayback}
                    type="button"
                  >
                    <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
                  </button>
                  <span className="moment-video-player__time">
                    {momentClock(currentTime * 1000)}
                  </span>
                  <input
                    aria-label="视频播放进度"
                    className="moment-video-player__range"
                    max={duration || 0}
                    min={0}
                    onChange={(event) => seekTo(Number(event.target.value))}
                    step={0.1}
                    style={{ ["--video-progress" as string]: `${progress}%` }}
                    type="range"
                    value={Math.min(currentTime, duration || 0)}
                  />
                  <span className="moment-video-player__time">
                    {momentClock((duration || 0) * 1000)}
                  </span>
                </div>

                <div className="moment-video-player__extra">
                  <button
                    aria-label={muted ? "取消静音" : "静音"}
                    className="moment-video-player__icon-btn"
                    onClick={toggleMute}
                    type="button"
                  >
                    <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
                  </button>
                  <input
                    aria-label="视频音量"
                    className="moment-video-player__range moment-video-player__volume"
                    max={1}
                    min={0}
                    onChange={(event) => changeVolume(Number(event.target.value))}
                    step={0.01}
                    style={{
                      ["--video-progress" as string]: `${(muted ? 0 : volume) * 100}%`,
                    }}
                    type="range"
                    value={muted ? 0 : volume}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
