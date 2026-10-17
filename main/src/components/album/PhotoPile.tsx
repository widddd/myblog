"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  photoPileLayout,
  type PhotoPileCard,
  type PhotoPileLayout,
} from "@/lib/albums/photo-pile";
import type { AlbumPhoto } from "@/lib/albums/types";

/**
 * 一叠照片（折叠 / 展开）——**相册详情页的动画引擎**。
 *
 * 版式定稿见 `demo/album-page`（2026-10-03），几何与节奏**逐项对齐**，移植时的对照：
 * - 折叠（横屏）= 同心叠放 + 逐层右扇 + 正负交替转角（第一张在最上）；
 * - 折叠（竖屏 / 窄屏）= **随手叠放**：每张保留原比例、随机倾角与横移、往下错一档（`loosePile`）——
 *   竖屏里横向只有三百多像素，往右扇会挤成一条缝；
 * - 展开（横屏）= **等高一行**：每张按原始比例定宽、行比容器宽就横向滚动，**滚轮左右翻阅**；
 *   点开时整叠向左滑到最左，同时各张相对中心向右滑出 —— 靠 `left/width/top/transform` 同时补间；
 * - 展开（竖屏 / 窄屏）= 原来的**向下**展开（一行一张，累加行位），与竖屏堆叠同向，观感连贯；
 * - 时长/缓动由 CSS 的 `--pile-expand-ms` / `--pile-collapse-ms` / `--pile-ease` 控制（见 albums.css 的 `.pile*`）。
 *
 * **算术只有一份**：`lib/albums/photo-pile.ts`（纯函数，配 `photo-pile.test.ts`）。
 * 这个组件只做三件事：量（每张的自然高度 / 原始比例）、问几何、写内联样式。
 * 改版式改那个文件，别把算术搬回来（见文件头铁律：显式像素宽，`auto` 不可插值）。
 *
 * 灯箱：图片把原图地址写在 `data-lightbox-src` 上，由页面级 `Lightbox` 委托接管 ——
 * **默认展示阶段只加载一级缩略图，点开才加载原图**（见 docs/albums-spec.md §3.4）。
 */

/** 手势参数（几何在 `photo-pile.ts`，这两个只属于交互） */
const SWIPE = {
  threshold: 36,
  slop: 8,
} as const;

export function PhotoPile({
  photos,
  title,
  className,
  expandAll,
}: {
  photos: AlbumPhoto[];
  /** 无障碍标签用（「XX 第 3 张」） */
  title: string;
  className?: string;
  /** 详情页工具条的「全部展开 / 全部收起」：变化时把这一叠同步过去（不改变单叠自己的状态机） */
  expandAll?: { action: "expand" | "collapse"; token: number } | null;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLButtonElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  /** 上一次写进 DOM 的几何指纹：一样就不再写（避免 ResizeObserver 自激，见 P-175） */
  const lastFingerprintRef = useRef("");
  const dragRef = useRef<{ x: number; moved: boolean } | null>(null);
  const swipedRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  /** 当前版式的方向（由几何决定）：`y` = 竖屏（折叠堆叠 / 展开成列），`x` = 横向一行 */
  const [fan, setFan] = useState<"x" | "y">("y");

  const count = photos.length;

  /**
   * 这一叠用哪个方向（折叠态堆叠方向 / 展开方向都由它定）。
   *
   * **只看视口**（2026-10-07 用户口径）：
   * - **竖屏（`orientation: portrait`）或窄屏（≤720px）→ 一律竖向**：折叠态**随手叠放、往下错**、
   *   点开**一行一张往下排**。**与照片方向、与它在不在卷里都无关** —— 竖屏手机上不管这一叠是
   *   横图还是竖图、属于哪一卷还是"不属于任何卷"的那一组，都必须竖着堆、竖着展开。
   * - 否则（横屏 / 宽屏）→ 横向版式：折叠态同心叠放、点开向右展开成一行（滚轮左右翻阅）。
   *
   * ⚠️ 别再加"看到横图就改成横向"这类规则：那会让竖屏手机上横图又变成横向展开，
   * 等于把用户要的竖屏版式整个推翻（2026-10-06 试过一版，用户当场驳回）。
   * 方向在 `apply()` 里判一次，折叠态与展开态共用同一个结论（不出现撕裂）。
   */
  const isVertical = useCallback(
    () =>
      window.matchMedia("(orientation: portrait)").matches ||
      window.matchMedia("(max-width: 720px)").matches,
    [],
  );

  /**
   * 一张卡的自然高度 + **原始宽高比**（宽 / 高）。
   *
   * 比例只认**图片自己**：`naturalWidth/naturalHeight` → 量到的盒子 → `width`/`height` 属性 → 3:2。
   * ⚠️ 属性排在后面是有实测教训的：入库时 width/height 可能被横版兜底（853×1280 的竖图写成
   * `width=1280 height=853`），拿属性算比例会把竖图当横图 —— 横向展开时行高算错、图片直接被裁。
   */
  const cardOf = useCallback((index: number): PhotoPileCard => {
    const image = cardRefs.current[index]?.querySelector("img");
    let aspect = 3 / 2;
    if (image && image.naturalWidth && image.naturalHeight) {
      aspect = image.naturalWidth / image.naturalHeight;
    } else if (image && image.offsetHeight && image.offsetWidth) {
      aspect = image.offsetWidth / image.offsetHeight;
    } else if (image) {
      const width = Number(image.getAttribute("width"));
      const height = Number(image.getAttribute("height"));
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        aspect = width / height;
      }
    }
    const height = cardRefs.current[index]?.offsetHeight ?? 0;
    // seed = 照片自己的 key：竖屏"随手叠放"的倾角 / 横移由它决定（确定性，见 lib/albums/photo-pile.ts）
    return { height, aspect, seed: photos[index]?.key ?? `slot-${index}` };
  }, [photos]);

  /** 文案同步（角标 / 提示）：纯文本，不会触发 ResizeObserver，可以在每次回调里安心调用 */
  const syncLabels = useCallback(
    (layout: PhotoPileLayout) => {
      if (badgeRef.current) {
        badgeRef.current.textContent = layout.expanded ? "收起" : `展开 ${count}`;
      }
      const hint = hintRef.current;
      if (!hint) {
        return;
      }
      if (!layout.expanded) {
        hint.hidden = false;
        // 两个方向都是**左右**滑动换张（手势只读 dx；上下滑动留给页面滚动，`touch-action: pan-y`）
        hint.textContent = "左右滑动翻看 · 点一下展开";
        return;
      }
      // 只有"这一行比容器宽"时才提示滚轮 —— 没溢出的话滚轮就是正常翻页
      hint.hidden = !(layout.fan === "x" && layout.overflow);
      hint.textContent = "滚轮左右翻阅";
    },
    [count],
  );

  /** 把当前状态算成每张的几何，直接写进内联样式（容器高度 / 横向滚动范围同步）。 */
  const apply = useCallback(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const cards = cardRefs.current.filter((card): card is HTMLDivElement => card !== null);
    if (!root || !viewport || !track || cards.length === 0) {
      return;
    }
    const measured = cards.map((_card, index) => cardOf(index));
    // 方向判一次（只看视口，见 isVertical），折叠态与展开态共用同一个结论
    const vertical = isVertical();
    const layout: PhotoPileLayout = photoPileLayout({
      cards: measured,
      width: viewport.clientWidth || 1,
      viewportHeight: window.innerHeight,
      active,
      collapsed: !expanded,
      vertical,
    });

    /* 静默写（P-175）：这个函数是 ResizeObserver 的回调，写进去的样式会再触发一次回调。
       指纹必须覆盖**要写的全部内容**（每张的 left / top / width / transform / z + 容器高 + track 宽）：
       只拿"各张高度 + 容器高"当指纹时，同比例的一叠左右滑动换张 → 指纹不变 → 直接 return，
       换张静默失效。内容完全一样才跳过。 */
    const fingerprint = JSON.stringify(layout);
    if (fingerprint === lastFingerprintRef.current) {
      // 内容没变：只同步文案（DOM 几何一律不碰，避免触发下一轮观察回调）
      syncLabels(layout);
      return;
    }
    lastFingerprintRef.current = fingerprint;

    cards.forEach((card, index) => {
      const style = layout.cards[index];
      if (!style) {
        return;
      }
      card.style.left = `${style.left}px`;
      card.style.right = "auto";
      card.style.width = `${style.width}px`;
      card.style.top = `${style.top.toFixed(2)}px`;
      card.style.transform = style.transform;
      card.style.zIndex = String(style.zIndex);
    });
    viewport.style.height = `${layout.viewportHeight}px`;
    // 横向展开那一行会被用户滚动：图片晚到触发重算时别把它弹回开头（同 demo 的 applyRow）
    if (!(layout.expanded && layout.fan === "x")) {
      viewport.scrollLeft = 0;
    }
    track.style.width = layout.trackWidth > 0 ? `${layout.trackWidth}px` : "";
    setFan(layout.fan);
    syncLabels(layout);
  }, [active, cardOf, expanded, isVertical, syncLabels]);

  useLayoutEffect(() => {
    apply();
  }, [apply, photos.length]);

  // 方向进 DOM：`albums.css` 只按 `data-axis="x"` 开横向滚动（方向由几何决定，见 apply()）
  useLayoutEffect(() => {
    if (rootRef.current) {
      rootRef.current.dataset.axis = fan;
    }
  }, [fan]);

  const expandToken = expandAll?.token ?? 0;
  useEffect(() => {
    if (!expandToken || !expandAll) {
      return;
    }
    setExpanded(expandAll.action === "expand");
    // 只在"工具条点了一下"时同步（token 变化），单叠自己的开合不受影响
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandToken]);

  useEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    if (!root || !viewport) {
      return;
    }
    // 卡片是绝对定位的，撑不高容器 —— 每张单独观察：图片加载完 / 窗口变化都能重算
    const observer = new ResizeObserver(() => apply());
    observer.observe(viewport);
    for (const card of cardRefs.current) {
      if (card) {
        observer.observe(card);
      }
    }
    const onResize = () => apply();
    window.addEventListener("resize", onResize);
    const images = [...viewport.querySelectorAll("img")];
    for (const image of images) {
      image.addEventListener("load", onResize);
    }
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      for (const image of images) {
        image.removeEventListener("load", onResize);
      }
    };
  }, [apply, photos.length]);

  /** 横向展开后：滚轮在这一行左右翻阅（到边就把滚动交还页面）。 */
  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current;
      if (!expanded || fan !== "x" || !viewport) {
        return;
      }
      const max = viewport.scrollWidth - viewport.clientWidth;
      if (max <= 1) {
        return;
      }
      const delta =
        Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      // 边界按**当前位置**判：用目标值判会把「差一点到边」的那一格吞掉（demo 阶段实测）
      const atStart = viewport.scrollLeft <= 0.5;
      const atEnd = viewport.scrollLeft >= max - 0.5;
      if ((atStart && delta < 0) || (atEnd && delta > 0)) {
        return;
      }
      event.preventDefault();
      viewport.scrollLeft = Math.max(0, Math.min(max, viewport.scrollLeft + delta));
    },
    [expanded, fan],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActive((value) => (value + 1) % count);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActive((value) => (value - 1 + count) % count);
        return;
      }
      if (!expanded && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        setExpanded(true);
      }
    },
    [count, expanded],
  );

  return (
    <div
      className={className ? `pile ${className}` : "pile"}
      data-expanded={String(expanded)}
      ref={rootRef}
    >
      <div
        aria-expanded={expanded}
        aria-label={expanded ? `${title}（已展开）` : `${title} · ${count} 张，点一下展开`}
        className="pile__viewport"
        onClick={(event) => {
          // 展开态把点击留给灯箱（页面级 Lightbox 走事件委托）
          if (expanded || swipedRef.current) {
            swipedRef.current = false;
            return;
          }
          event.stopPropagation();
          setExpanded(true);
        }}
        onKeyDown={onKeyDown}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onPointerDown={(event) => {
          if (expanded || (event.target as HTMLElement).closest(".pile__badge")) {
            return;
          }
          event.currentTarget.setPointerCapture?.(event.pointerId);
          dragRef.current = { x: event.clientX, moved: false };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (drag && Math.abs(event.clientX - drag.x) > SWIPE.slop) {
            drag.moved = true;
          }
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (!drag || expanded) {
            return;
          }
          const dx = event.clientX - drag.x;
          if (drag.moved && Math.abs(dx) >= SWIPE.threshold) {
            swipedRef.current = true;
            setActive((value) => (value + (dx < 0 ? 1 : -1) + count) % count);
          }
        }}
        onWheel={onWheel}
        ref={viewportRef}
        role={expanded ? undefined : "button"}
        tabIndex={expanded ? undefined : 0}
      >
        <div className="pile__track" ref={trackRef}>
          {photos.map((photo, index) => (
            <div
              className="pile__card"
              key={photo.key}
              ref={(node) => {
                cardRefs.current[index] = node;
              }}
            >
              {/* 只给一级缩略图；原图地址进 data 属性，点开才由 Lightbox 加载 */}
              <img
                alt={`${title} 第 ${index + 1} 张`}
                data-lightbox-key={photo.key}
                data-lightbox-src={photo.src}
                data-lightbox-thumb={photo.thumbSrc}
                decoding="async"
                height={photo.height}
                loading={index === 0 ? "eager" : "lazy"}
                src={photo.thumbSrc}
                width={photo.width}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="pile__hint" ref={hintRef} />
      <button
        className="pile__badge album-pill"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setExpanded((value) => !value);
        }}
        ref={badgeRef}
        type="button"
      >
        展开 {count}
      </button>
    </div>
  );
}
