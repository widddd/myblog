"use client";

import Link from "next/link";
import { useRef } from "react";

import { PILE_STAGGER_MS, pileSpread } from "@/lib/albums/pile";
import { albumHref } from "@/lib/albums/path";
import { usePileSpread } from "@/lib/albums/use-pile-spread";
import type { PublicAlbum } from "@/lib/albums/types";

/**
 * 相册列表的一张卡（版式定稿见 demo/album-page）：
 * 封面是这本相册的**一叠照片** —— 打开时所有照片**整齐叠在左侧、第一张在最上面**
 * （同一左缘、同一尺寸、被完全盖住），约 1s 后从第一张下面**依次向右抽出**。
 *
 * 为什么第一张"不动"是几何事实：每张从渲染起就是**最终尺寸**，只有 `left` / `transform`
 * 参与过渡，第 0 张连这两个属性都不写 —— 所以不存在"它也在缩放/移动"的观感。
 *
 * 为什么整叠不是"铺满画框"：整叠宽度 = `pileStackWidth()`，比画框窄一格 —— 第一张要是
 * 铺满，后面的张就永远被它盖住，抽成就成了看不见的动作（2026-10-05 逐帧实测过，
 * 见 `lib/albums/pile.ts` 文件头）。
 *
 * **首帧就是叠放态**（`pileSpread().from`）：`/albums` 是服务端渲染的，首帧不能出现
 * 抽出后的位置，否则打开页面先看到"已经铺开"、再跳一下（见 docs/pitfalls.md P-160）。
 * 抽出的执行统一走 `usePileSpread()`（与首页「相册卡片」模块同一个执行器）。
 *
 * 图片一律用**二级缩略图**（最省流量），缺文件时回退一级缩略图；原图地址不在这里出现。
 */
export function AlbumCard({ album }: { album: PublicAlbum }) {
  const stackRef = useRef<HTMLSpanElement | null>(null);
  const layers = album.images;
  const visible = layers.length;
  // 列表卡是 21:9 的宽画框：各张等宽（shrink = 1），铺开后正好填满画框（= demo/album-page 的定稿版式）。
  // 整叠那一张比画框窄一格（`pileStackWidth()`），右边那一格就是"抽出来铺开"的行程 —— 见 pile.ts 文件头。
  const flow = pileSpread(visible, 1, PILE_STAGGER_MS);

  usePileSpread({
    container: stackRef,
    layerSelector: ":scope > img",
    count: visible,
    shrink: 1,
  });

  return (
    <li className="album-card">
      <Link className="album-card__link" href={albumHref(album.slug)}>
        <span className="album-card__stack" ref={stackRef}>
          {visible === 0 ? (
            <span aria-hidden className="album-card__empty">
              ▤
            </span>
          ) : (
            layers.map((image, index) => {
              const step = flow[index];
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  height={image.height}
                  key={image.key}
                  loading={index === 0 ? "eager" : "lazy"}
                  onError={(event) => {
                    // 二级缩略图缺失时回退到一级（只回退一次，避免死循环）
                    const node = event.currentTarget;
                    if (node.dataset.fallback !== "1" && node.src !== image.thumbSrc) {
                      node.dataset.fallback = "1";
                      node.src = image.thumbSrc;
                    }
                  }}
                  src={image.thumb2Src}
                  style={{
                    // 叠放态 = 抽出态**同一尺寸**：只有 left / transform 会变（第一张是 0 → 0，纹丝不动）
                    left: "0%",
                    width: `${(step?.to.width ?? 100).toFixed(2)}%`,
                    zIndex: step?.zIndex ?? visible - index,
                    // 逐张错峰交给 CSS（--pile-delay 进 transition-delay）：两处页面同一套口径
                    ["--pile-delay" as string]: `${step?.to.delayMs ?? 0}ms`,
                    // 抽出终态的位置/角度也一起写进内联变量：**只给 prefers-reduced-motion 用**
                    // （CSS 那边 `left: var(--pile-left) !important` 直接给终态，SSR 首帧就不会先叠一下再跳）。
                    // 几何仍只有 pileSpread() 一份来源，这里不是第二套动画。
                    ["--pile-left" as string]: `${(step?.to.left ?? 0).toFixed(2)}%`,
                    ["--pile-rotate" as string]: `${(step?.to.rotate ?? 0).toFixed(2)}deg`,
                  }}
                  width={image.width}
                />
              );
            })
          )}
        </span>
        <strong className="album-card__title">{album.title}</strong>
        <span className="album-card__meta">
          {album.count} 张
          {album.volumeCount > 0 ? ` · ${album.volumeCount} 卷` : ""}
        </span>
        {album.description ? (
          <span className="album-card__desc">{album.description}</span>
        ) : null}
      </Link>
    </li>
  );
}
