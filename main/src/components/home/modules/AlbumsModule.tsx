"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Thumb2Image } from "@/components/common/Thumb2Image";
import { albumHref, ALBUMS_PATH } from "@/lib/albums/path";
import type { HomeAlbumImage } from "@/lib/albums/types";
import { normalizeAlbumSpeed } from "@/lib/home/albums";
import type { HomeModuleConfig } from "@/lib/home/types";
import { cn } from "@/lib/utils/cn";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** 系统「减少动态效果」直接当外部状态订阅：**不要**在 effect 里 setState（会触发级联渲染，eslint 也拦）。 */
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function readReducedMotionOnServer() {
  return false;
}

/**
 * 首页「相册」模块：把若干相册的照片拼成**一条缓慢横向滚动的预览条**。
 *
 * 无缝循环靠「内容复制两份 + `translateX(-50%)`」（与瞬间模块的 `moment-falls`、
 * 欢迎卡的 `rowup-scroll` 同一套手法）：轨道里放两排一模一样的图，动画走完一整排宽度时
 * 第二排正好顶到起点，视觉上接得上。
 *
 * 图片走**二级缩略图**（只本地、默认 320），与瞬间模块同一档；
 * 图的高度 = 格子高度，宽度按各自原始比例算（不预设画框、不裁成统一方框）。
 * `prefers-reduced-motion` 与后台画布预览一律静态（否则画布里的图会自己跑掉）。
 */
/**
 * 图按自己的原始比例定宽：首次加载时图片还没量到尺寸，先用这两个变量
 * 把长宽比钉住，避免整条轨道在图片陆续到位时抖动。
 * 「相册卡片」模块也引它（同一档图、同一种兜底）。
 */
export function ratioVars(image: HomeAlbumImage) {
  if (!image.width || !image.height) {
    return undefined;
  }
  return {
    ["--album-w" as string]: String(image.width),
    ["--album-h" as string]: String(image.height),
  };
}

export function AlbumsModule({
  config,
  images,
  preview = false,
}: {
  config: HomeModuleConfig;
  images: HomeAlbumImage[];
  preview?: boolean;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    readReducedMotionOnServer,
  );
  const staticMotion = preview || reducedMotion;

  const heading = config.heading?.trim() || "相册";
  const speed = normalizeAlbumSpeed(config.speedSeconds);

  if (images.length === 0) {
    return preview ? (
      <section className="home-albums glass-card">
        <div className="home-albums__head">
          <h2>
            <Link href={ALBUMS_PATH}>{heading}</Link>
          </h2>
        </div>
        <p className="home-albums__empty">
          还没有相册图片：到后台「相册」里建一个，再把媒体库里的照片归进去
        </p>
      </section>
    ) : null;
  }

  function renderRow(copy: boolean) {
    return (
      <div aria-hidden={copy || undefined} className="home-albums__row">
        {images.map((image, index) => (
          <Link
            className="home-albums__item"
            href={albumHref(image.albumSlug)}
            key={`${copy ? "copy" : "main"}-${image.key}-${index}`}
            style={ratioVars(image)}
            title={`${image.albumTitle} · 第 ${index + 1} 张`}
          >
            <Thumb2Image
              alt=""
              fallback={image.thumbSrc}
              sizes="320px"
              src={image.thumb2Src}
            />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <section className="home-albums glass-card">
      <div className="home-albums__head">
        <h2>
          <Link href={ALBUMS_PATH}>{heading}</Link>
        </h2>
        <span className="home-albums__hint">点图看相册</span>
      </div>
      <div className="home-albums__viewport">
        <div
          className={cn("home-albums__track", !staticMotion && "is-rolling")}
          style={{ ["--album-speed" as string]: `${speed}s` }}
        >
          {renderRow(false)}
          {staticMotion ? null : renderRow(true)}
        </div>
      </div>
    </section>
  );
}
