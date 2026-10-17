"use client";

import { useState } from "react";

import { Lightbox } from "@/components/common/Lightbox";
import { MomentAudioRow } from "@/components/moment/MomentAudioRow";
import { MomentVideoPlayer } from "@/components/moment/MomentVideoPlayer";
import { splitMomentMedia } from "@/lib/moments/compose-rules";
import { momentMediaKind, type PublicMomentImage } from "@/lib/moments/types";
import { cn } from "@/lib/utils/cn";

type MomentGridProps = {
  images: PublicMomentImage[];
  alt: string;
};

function columnCount(count: number): number {
  if (count <= 1) {
    return 1;
  }
  if (count === 2 || count === 4) {
    return 2;
  }
  return 3;
}

function ratioStyle(image: PublicMomentImage) {
  if (!image.width || !image.height) {
    return undefined;
  }
  return {
    ["--moment-w" as string]: String(image.width),
    ["--moment-h" as string]: String(image.height),
  };
}

/**
 * 瞬间媒体：图片/视频九宫格 + **语音独立播放行**（分区展示，见 docs/moment-audio-spec.md §2.6）。
 *
 * 2026-10 起媒体可能是视频（见 docs/moment-video-spec.md）：
 *  - 图片走原路（点开进灯箱、多图先撑大）；
 *  - 视频用首帧预览 + 自绘播放器（播放/暂停、进度、音量），不进图片灯箱；
 *  - 视频仍吃原视频地址，`preload="metadata"` 只拉首帧所需的元信息。
 *
 * 语音不占九宫格：它是"听"的媒体，塞进按比例排的格子里没有意义，所以统一渲染在格子下面。
 */
export function MomentGrid({ images, alt }: MomentGridProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{
    src: string;
    thumb?: string;
    key: string;
    width?: number;
    height?: number;
  } | null>(null);

  const { visual, audios } = splitMomentMedia(images);

  if (images.length === 0) {
    return null;
  }

  const count = Math.min(9, visual.length);
  const shown = visual.slice(0, count);
  const columns = columnCount(count);

  function activate(index: number) {
    const image = shown[index];
    if (!image) {
      return;
    }
    if (count === 1) {
      setLightbox({
        src: image.src,
        thumb: image.thumbSrc,
        key: image.key,
        width: image.width,
        height: image.height,
      });
      return;
    }
    if (expanded === index) {
      setLightbox({
        src: image.src,
        thumb: image.thumbSrc,
        key: image.key,
        width: image.width,
        height: image.height,
      });
      return;
    }
    setExpanded(index);
  }

  return (
    <Lightbox
      onClose={() => setLightbox(null)}
      openAlt={alt}
      openHeight={lightbox?.height}
      openKey={lightbox?.key}
      openSrc={lightbox?.src ?? null}
      openThumb={lightbox?.thumb}
      openWidth={lightbox?.width}
    >
      {count > 0 ? (
        <div
          className={cn("moment-grid", expanded !== null && "is-expanded")}
          data-cols={columns}
          data-count={count}
          style={{ ["--moment-cols" as string]: String(columns) }}
        >
          {shown.map((image, index) =>
            momentMediaKind(image) === "video" ? (
              <div
                className="moment-grid__cell moment-grid__cell--video"
                key={`${image.key}-${index}`}
                style={ratioStyle(image)}
              >
                <MomentVideoPlayer alt={`${alt} 视频`} video={image} />
              </div>
            ) : (
              <button
                className={cn(
                  "moment-grid__cell",
                  expanded === index && "is-expanded",
                )}
                key={`${image.key}-${index}`}
                onClick={() => activate(index)}
                style={ratioStyle(image)}
                type="button"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={`${alt} ${index + 1}`} src={image.thumbSrc ?? image.src} />
              </button>
            ),
          )}
        </div>
      ) : null}
      {audios.length > 0 ? (
        <div className="moment-audios">
          {audios.map((audio, index) => (
            <MomentAudioRow
              index={index}
              item={{
                key: audio.key,
                src: audio.src,
                duration: audio.duration,
                peaks: audio.peaks,
              }}
              key={`${audio.key}-${index}`}
            />
          ))}
        </div>
      ) : null}
    </Lightbox>
  );
}
