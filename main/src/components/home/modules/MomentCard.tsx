"use client";

import Link from "next/link";

import { Thumb2Image } from "@/components/common/Thumb2Image";
import { MomentVideoPlayer } from "@/components/moment/MomentVideoPlayer";
import { MomentVoiceChip } from "@/components/moment/MomentAudioRow";
import { splitMomentMedia } from "@/lib/moments/compose-rules";
import { momentMediaKind, type HomeMoment } from "@/lib/moments/types";
import { formatRelativeDate } from "@/lib/utils/date";

/** 卡片上最多画几张图：超过就只画这些，剩下的由淡出层 + 「+N」交代 */
const MAX_PREVIEW_IMAGES = 3;
/** 没有存宽高时的兜底比例（按横图处理，别把未知尺寸的图拉成一列） */
const FALLBACK_RATIO = { w: 4, h: 3 };

export type HomeMomentCardModel = HomeMoment;

/**
 * 首页文章流里穿插的瞬间卡（一个卡片一条瞬间）。
 *
 * 尺寸口径：**图片跟着自己的比例走**，卡片不预设大盒子。
 * - 图片一律吃二级缩略图（`thumb2Src`，缺文件时 query 层已回退一级），404 再回退一级；
 * - 多图时每张占满固定的行高（`--home-moment-media-h`）、宽度按原图比例算，图之间不换行；
 *   超过 3 张的部分不做展开：容器底部渐隐 + 第三张右下角「+N」；
 * - 宽高比没存下来时按 4:3 兜底，避免出现一列细高条；
 * - **视频用自身首帧作预览**，点视频区域打开自绘播放器（不触发整卡跳转）；
 * - **语音单独一条**（不占图片位）：这里只画不可点的「波形 + 时长」小标，
 *   点整卡进瞬间页再播 —— 这张卡整体是一个 `<Link>`，里面塞播放控件会变成"链接里套控件"；
 * - 整卡可点 → `/moments#moment-{id}`，落地后由 `MomentHighlight` 短暂高亮那条瞬间。
 */
export function MomentCard({
  index = 0,
  moment,
}: {
  index?: number;
  moment: HomeMomentCardModel;
}) {
  const { visual, audios } = splitMomentMedia(moment.images);
  const preview = visual.slice(0, MAX_PREVIEW_IMAGES);
  const rest = visual.length - preview.length;
  const content = moment.content.trim();
  const label = content || "瞬间";

  return (
    <div
      className="post-card-wrap"
      style={{ animationDelay: `${0.08 + index * 0.06}s` }}
    >
      <article className="home-moment glass-card" id={`home-moment-${moment.id}`}>
        <Link
          aria-label={label}
          className="home-moment__hit"
          href={`/moments#moment-${moment.id}`}
        />
        <div className="home-moment__head">
          <span className="home-moment__tag">瞬间</span>
          <time>{formatRelativeDate(moment.createdAt)}</time>
        </div>
        {content ? <p className="home-moment__text">{content}</p> : null}
        {preview.length === 1 && preview[0] ? (
          <div
            className="home-moment__cover"
            style={{
              ["--moment-w" as string]: String(
                preview[0].width && preview[0].width > 0 ? preview[0].width : FALLBACK_RATIO.w,
              ),
              ["--moment-h" as string]: String(
                preview[0].height && preview[0].height > 0
                  ? preview[0].height
                  : FALLBACK_RATIO.h,
              ),
            }}
          >
            {momentMediaKind(preview[0]) === "video" ? (
              // 用视频自身首帧作封面；点击开自绘播放器，不再画一块纯黑占位。
              <MomentVideoPlayer alt={label} video={preview[0]} />
            ) : (
              <Thumb2Image
                alt={label}
                fallback={preview[0].thumbSrc ?? preview[0].src}
                src={preview[0].thumb2Src ?? preview[0].thumbSrc ?? preview[0].src}
              />
            )}
          </div>
        ) : null}
        {preview.length > 1 ? (
          <div className="home-moment__media">
            {preview.map((image, imageIndex) => {
              const width = image.width && image.width > 0 ? image.width : FALLBACK_RATIO.w;
              const height =
                image.height && image.height > 0 ? image.height : FALLBACK_RATIO.h;
              return (
                <div
                  className="home-moment__cell"
                  key={`${image.key}-${imageIndex}`}
                  style={{
                    ["--moment-w" as string]: String(width),
                    ["--moment-h" as string]: String(height),
                  }}
                >
                  {momentMediaKind(image) === "video" ? (
                    <MomentVideoPlayer alt={`${label} 视频`} video={image} />
                  ) : (
                    <Thumb2Image
                      alt={`${label} ${imageIndex + 1}`}
                      fallback={image.thumbSrc ?? image.src}
                      sizes="(max-width: 720px) 45vw, 320px"
                      src={image.thumb2Src ?? image.thumbSrc ?? image.src}
                    />
                  )}
                  {rest > 0 && imageIndex === preview.length - 1 ? (
                    <span className="home-moment__more">+{rest}</span>
                  ) : null}
                </div>
              );
            })}
            {rest > 0 ? <div aria-hidden="true" className="home-moment__fade" /> : null}
          </div>
        ) : null}
        {/* 只有语音（没有图片/视频）的瞬间：卡片上也得有东西可看 */}
        {preview.length === 0 && audios.length > 0 ? (
          <MomentVoiceChip
            items={audios.map((audio) => ({
              key: audio.key,
              src: audio.src,
              duration: audio.duration,
              peaks: audio.peaks,
            }))}
          />
        ) : null}
      </article>
    </div>
  );
}
