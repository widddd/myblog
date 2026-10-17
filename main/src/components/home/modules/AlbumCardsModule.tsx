"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type CSSProperties } from "react";

import { Thumb2Image } from "@/components/common/Thumb2Image";
import { PILE_STAGGER_MS, pileSpread, type PileSpread } from "@/lib/albums/pile";
import { ALBUMS_PATH, albumHref } from "@/lib/albums/path";
import { usePileSpread } from "@/lib/albums/use-pile-spread";
import type { PublicAlbum } from "@/lib/albums/types";
import { normalizeAlbumCardLimit } from "@/lib/home/albums";
import type { HomeModuleConfig } from "@/lib/home/types";
import { cn } from "@/lib/utils/cn";

/**
 * 首页「相册卡片」模块：**一叠一叠摆出来的相册**（第 15 个内置模块，默认关闭）。
 *
 * 与相邻的滚动条模块（`AlbumsModule`）的分工：
 * - `albums`       = 一条缓慢横向滚动的**照片**预览（图池，点图进相册）；
 * - `album-cards`  = 一本相册一张卡（封面那一叠 + 标题 + 张数 + 日期区间），点卡进相册。
 *
 * 抽出动作与 `/albums` 列表卡**同一个动作、同一个执行器**（几何在 `lib/albums/pile.ts`，
 * 执行在 `lib/albums/use-pile-spread.ts`）：进页面约 1s 后，后面几张依次从最上面那张下面
 * 向右抽出；倾斜与错峰完全共用，只有 `shrink`（这张卡窄，后面几张按 0.86 收窄收矮）
 * 与 `--pile-ar`（照片的长宽比）是本模块自己的。
 *
 * **首帧必须是叠放态**（`pileSpread().from`）：终态不能在渲染期就写进内联样式 —— 那等于
 * 打开页面直接看到铺开的封面，动画从一帧开始就不存在（2026-10-05 逐帧实测：首帧内联
 * `left` 已经是 16.13% / 32.26% / 48.39%，整段没有任何补间）。
 *
 * 图片一律**二级缩略图**（只本地、最省流量，缺文件由 `Thumb2Image` 回退到一级）。
 *
 * ## 为什么这里还是有 effect（一点点几何还是得量）
 *
 * 「一叠」的高度是**算出来的**：照片按原比例铺开 → 叠高 = 封面区宽度 × 整叠宽占比 ÷ 宽高比；
 * 而封面区的宽度来自 flex（卡片宽 = 行高 × 卡片宽高比），CSS 里推不出来 ——
 * 写过 `calc(100% / var(--ar))` 这类公式，结果不是溢出就是把整叠缩成一半（都实测过）。
 * 所以按项目既有做法（同 `PhotoPile`，见 P-152）：**量一次封面区的宽度**，
 * 把叠高写成 `--album-vh`（占封面区的比例）直接落到 DOM 上，React 只管结构与列表。
 * 用 layout effect 而不是 effect：写晚了会在首帧之后改一次高度，整叠看着往上跳一下。
 */

/** 后面几张收窄多少（等比递减）：卡片窄，几张等宽会显得太挤 */
const PILE_SHRINK = 0.86;

/** 封面比例缺失时的兜底（4:3 偏方） */
const FALLBACK_RATIO = 1.2;

/**
 * 封面那张的宽高比（**宽 / 高**），夹在 0.7–1.5：
 * 3:2 横图给 1.5（更宽更好看），4:5 竖图给 0.8，极端比例不把卡片压扁。
 * 夹取是为了让**所有卡片的封面比例接近** —— 一屏里几张卡高矮差太多最显乱。
 */
function coverRatio(album: PublicAlbum): number {
  const image = album.images[0];
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!(width > 0) || !(height > 0)) {
    return FALLBACK_RATIO;
  }
  return Math.min(1.5, Math.max(0.7, width / height));
}

/**
 * 首帧（叠放态）的内联样式：**宽度与层次是终值，位置是同一个左缘**。
 *
 * `--pile-w` 是层宽的**乘数**（`calc()` 里只能用乘数，百分比字面量会让声明非法、被静默丢掉，
 * 见 P-132）；`--pile-delay` 是这一层的错峰（CSS 的 `transition-delay` 用它）。
 * `--pile-left` / `--pile-rotate` 是**抽出终态**的位置与角度，只给
 * `prefers-reduced-motion: reduce` 那条 CSS 用（直接给终态，SSR 首帧就不先叠一下再跳）。
 * `left` 一律是 0：抽出后的位置由 `usePileSpread()` 在布局提交之后才写（写入即过渡）。
 */
function stackStyle(step: PileSpread): CSSProperties {
  return {
    left: "0%",
    zIndex: step.zIndex,
    ["--pile-w" as string]: (step.to.width / 100).toFixed(4),
    ["--pile-delay" as string]: `${step.to.delayMs}ms`,
    ["--pile-left" as string]: `${step.to.left.toFixed(2)}%`,
    ["--pile-rotate" as string]: `${step.to.rotate.toFixed(2)}deg`,
  };
}

function AlbumCardItem({
  album,
  preview,
}: {
  album: PublicAlbum;
  preview: boolean;
}) {
  const stackRef = useRef<HTMLSpanElement | null>(null);
  const pileRef = useRef<HTMLSpanElement | null>(null);
  const visible = album.images.length;
  const ratio = coverRatio(album);
  // 抽出动作的全套事实（首帧 / 终帧 / 层次 / 错峰）只有 pile.ts 一份
  const flow = pileSpread(visible, PILE_SHRINK, PILE_STAGGER_MS);
  const stackShare = (flow[0]?.to.width ?? 100) / 100;

  usePileSpread({
    container: pileRef,
    layerSelector: ".home-album-cards__layer",
    count: visible,
    shrink: PILE_SHRINK,
    instant: preview,
  });

  useLayoutEffect(() => {
    const stack = stackRef.current;
    const pile = pileRef.current;
    if (!stack || !pile) {
      return;
    }
    const apply = () => {
      const width = stack.clientWidth;
      const height = stack.clientHeight;
      if (!(width > 0) || !(height > 0)) {
        return;
      }
      // 照片按各自的宽高比铺：叠高 = 封面区宽 × 整叠占比 ÷ 宽高比；占封面区的比例就是它除以可用高度。
      // 上限是 1（=封面区高度）：再高会被封面区裁掉，而**盒子正好等于照片**才谈得上"居中"。
      const share = Math.min(1, (width * stackShare) / ratio / height);
      pile.style.setProperty("--album-vh", share.toFixed(4));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(stack);
    return () => observer.disconnect();
  }, [ratio, stackShare]);

  return (
    <li className="home-album-cards__card">
      <Link
        className="home-album-cards__link"
        href={albumHref(album.slug)}
        title={album.description || album.title}
      >
        <span className="home-album-cards__stack" ref={stackRef}>
          {visible === 0 ? (
            <span aria-hidden className="home-album-cards__empty">
              ▤
            </span>
          ) : (
            <span
              className="home-album-cards__pile"
              ref={pileRef}
              style={{ ["--pile-ar" as string]: ratio.toFixed(3) }}
            >
              {album.images.map((image, index) => (
                <span
                  className="home-album-cards__layer"
                  key={image.key}
                  style={stackStyle(flow[index] ?? flow[0])}
                >
                  <Thumb2Image
                    alt=""
                    fallback={image.thumbSrc}
                    sizes="320px"
                    src={image.thumb2Src}
                  />
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="home-album-cards__meta">
          <strong className="home-album-cards__title">{album.title}</strong>
          <span className="home-album-cards__info">
            {album.count} 张
            {album.volumeCount > 0 ? ` · ${album.volumeCount} 卷` : ""}
            {album.dateText ? ` · ${album.dateText}` : ""}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function AlbumCardsModule({
  albums,
  config,
  preview = false,
}: {
  albums: PublicAlbum[];
  config: HomeModuleConfig;
  preview?: boolean;
}) {
  const heading = config.heading?.trim() || "相册";
  const limit = normalizeAlbumCardLimit(config.limit);
  // 取数层已经按配置截过，这里再兜一道：配置与库不同步（老库、手改过 JSON）时
  // 也不能把整本相册都摆出来
  const shown = albums.slice(0, limit);

  return (
    <section className="home-album-cards glass-card">
      <div className="home-album-cards__head">
        <h2>
          <Link href={ALBUMS_PATH}>{heading}</Link>
        </h2>
        {shown.length > 0 ? (
          <span className="home-album-cards__hint">点开看整本</span>
        ) : null}
      </div>
      {shown.length === 0 ? (
        preview ? (
          <p className="home-album-cards__empty">
            还没有相册：到后台「相册」里建一个，再把媒体库里的照片归进去
          </p>
        ) : null
      ) : (
        <ul className={cn("home-album-cards__row", preview && "is-static")}>
          {shown.map((album) => (
            <AlbumCardItem album={album} key={album.slug} preview={preview} />
          ))}
        </ul>
      )}
    </section>
  );
}
