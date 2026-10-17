"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from "react";

import { IMAGE_GROUP_CLASS } from "@/lib/markdown/image-group";
import { cn } from "@/lib/utils/cn";

import { splitGroup } from "./image-group-split";

/**
 * 文章正文里的「折叠组」在**前台**的样子（`<ImageGroup>` 由 `lib/markdown/image-group.ts`
 * 转成 `<details class="post-image-group">`，这里按标签接住它）。
 *
 * 收起 = 一叠照片（像 iOS 相册的叠放）：顶张完整显示，底下几张各露出一条边、还各自歪一点点，
 *   **左右滑动**换上面那张，**点一下**展开。
 * 展开 = 每张照片按顺序往下滑进一列（transform 过渡 + 逐张延迟），点图仍进灯箱看原图。
 *
 * 图片本身**原样复用**正文渲染出来的 `<img>`（已经带着 `data-lightbox-src` 原图与
 * `data-lightbox-thumb` 一级缩略图），灯箱靠事件委托就点得到，这里一个属性都不重造。
 * 因此收起态与展开态看到的都是**一级缩略图**，点开才是原图。
 *
 * 几何（每张卡的 transform、视口高度）在 layout effect 里量好、直接写到 DOM 上：
 * React 只管结构与状态，动画全部走 transform，不触发重排。
 */

/** 左右滑多少像素算一次翻页 */
const SWIPE_THRESHOLD = 36;
/** 超过这个位移就不当成「点一下」（否则滑完松手会误触展开） */
const DRAG_SLOP = 8;
/** 展开后两张照片之间的行距（写进每张的 `top`，不走 margin —— 绝对定位下 margin 会叠在 top 上） */
const EXPANDED_GAP = 10;
/** 叠放时每往后一层缩多少（demo 用 1.4%，再大就不像"一叠照片"了） */
const DEPTH_SCALE = 0.02;
/**
 * 叠放时每往后一层**往右扇开**多少像素。
 * 光靠旋转是不够的：底下的卡片与顶张几乎同宽，转出来的角只有几像素，又被 `overflow: hidden`
 * 裁掉——实际看上去还是"一张图"（实测 14px 时右侧只露出 18~35px，且灰调照片在模糊底色上
 * 几乎看不见）。扇开到 22px、再给每张加一圈底色描边，每一层的边才真的读得出来。
 */
const PEER_X = 22;
/** 叠放时每往后一层转多少度，正负交替（与 demo 的 `rotate * i * (i % 2 ? -1 : 1)` 同款） */
const ROT_STEP = 1.5;
const DECK_MIN = 180;
/** 牌堆高度上限：桌面 440px，手机按视口高度收（免得一张竖图把整屏占满） */
const DECK_BASE_MAX = 440;

function deckLimit(): number {
  const byViewport =
    typeof window === "undefined" ? DECK_BASE_MAX : window.innerHeight * 0.58;
  return Math.max(DECK_MIN, Math.min(DECK_BASE_MAX, byViewport));
}

export function ImageGroupView({
  children,
  className,
  ...rest
}: Omit<ComponentPropsWithoutRef<"details">, "className"> & {
  /** MDX 可能给数组形式的 className（hast 就是这么存的），两种都要认 */
  className?: string | string[];
}) {
  const classList = Array.isArray(className) ? className.join(" ") : (className ?? "");
  const isGroup = classList.split(/\s+/).includes(IMAGE_GROUP_CLASS);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; moved: boolean } | null>(null);
  const swipedRef = useRef(false);

  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);

  const collected = splitGroup(isGroup ? children : undefined);
  const total = collected.images.length;
  const usable = isGroup && total > 0;

  /**
   * 把当前状态算成每张照片的 `top` / `transform` / `z-index`，直接写进内联样式。
   *
   * 模型照搬 demo（`demo/fold-image`，用户点名要的那套）：**所有卡片绝对定位，两个状态的几何都用
   * `top` 表达**，差异交给 CSS 过渡补间 —— 不用 FLIP、不做运行时翻转测量（那套正是 demo 里
   * 反复算出"行程 0"的根源）：
   *   收起：每张都**居中叠在牌堆里**（`top = (牌堆高 - 图高)/2`，缩放在中心，所以视觉上也居中），
   *        越靠后缩得越多、并转一个小角度（正负交替）——像随手摞起来的一叠照片
   *   展开：第 i 张的 `top` = 前面几张的高度和 + i×行距 → 各自向下滑到自己那一格
   * 容器高度与每张的 `top`/`transform` **同一时长、同时起步、三次方缓动**（demo 的结论：错峰会让
   * "一起滑下去"变成"排队"）。时长与缓动是 CSS 变量 `--ig-*-ms` / `--ig-ease`。
   *
   * ⚠️ `expanded` 必须在依赖里：漏了它，点展开只会换 className 与按钮文案，几何一动不动（踩过）。
   */
  const applyLayout = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) {
      return;
    }
    const cards = Array.from(track.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
    const count = cards.length;
    if (count === 0) {
      return;
    }
    // 自然高度：绝对定位与 transform 都不影响 offsetHeight，量到的就是照片本身的高度
    const heights = cards.map((card) => card.offsetHeight || DECK_MIN);

    if (expanded) {
      let top = 0;
      cards.forEach((card, index) => {
        card.style.top = `${top}px`;
        card.style.transform = "";
        card.style.zIndex = String(count - index);
        top += heights[index] + EXPANDED_GAP;
      });
      // 容器高 = 整列高（末尾那一个行距不算）；向上取整，免得最后一张被裁掉半像素
      viewport.style.height = `${Math.ceil(top - EXPANDED_GAP)}px`;
      return;
    }

    const deckHeight = Math.max(
      DECK_MIN,
      Math.min(deckLimit(), heights[active] ?? DECK_MIN),
    );
    viewport.style.height = `${deckHeight}px`;

    // 牌堆要往右扇开，右侧得先留出扇形宽度，否则最外那张会被视口的 overflow 裁掉
    const viewportWidth = viewport.clientWidth || 1;
    const fanWidth = (count - 1) * PEER_X;
    const baseScale = Math.min(
      1,
      deckHeight / (heights[active] ?? DECK_MIN),
      Math.max(0.4, (viewportWidth - fanWidth) / viewportWidth),
    );

    cards.forEach((card, index) => {
      const depth = (index - active + count) % count;
      const scale = baseScale * (1 - depth * DEPTH_SCALE);
      const rotate = ROT_STEP * depth * (depth % 2 === 0 ? 1 : -1);
      // 往右扇、并整体左移半个扇形宽 → 牌堆在视口里居中
      const dx = depth * PEER_X - fanWidth / 2;
      // 缩放与旋转都以中心为原点：布局盒中心 = 视觉中心，所以 top 用**自然高度**算
      card.style.top = `${((deckHeight - heights[index]) / 2).toFixed(2)}px`;
      card.style.transform = `translateX(${dx.toFixed(2)}px) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      card.style.zIndex = String(count - depth);
    });
  }, [active, expanded]);

  useLayoutEffect(() => {
    if (!usable) {
      return;
    }
    applyLayout();
    const track = trackRef.current;
    const observer = new ResizeObserver(() => applyLayout());
    if (track) {
      observer.observe(track);
      // 卡片是绝对定位的，撑不高 track（track 高度恒为 0）——所以每张卡片要单独观察：
      // 图片加载完成、容器宽度变化导致照片高度变了，都能重算一次牌堆与行位
      for (const card of track.children) {
        observer.observe(card);
      }
    }
    window.addEventListener("resize", applyLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyLayout);
    };
  }, [applyLayout, usable]);

  // 图片是懒加载的，加载完高度才准：挂一次 load 监听再量一遍
  useEffect(() => {
    if (!usable) {
      return;
    }
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const images = Array.from(track.querySelectorAll("img"));
    const onLoad = () => applyLayout();
    for (const image of images) {
      image.addEventListener("load", onLoad);
    }
    return () => {
      for (const image of images) {
        image.removeEventListener("load", onLoad);
      }
    };
  }, [applyLayout, usable]);

  // 收起时把牌堆滚回视野：展开态可能很长，收起后容易停在空白处
  const wasExpanded = useRef(false);
  useEffect(() => {
    if (wasExpanded.current && !expanded) {
      containerRef.current?.scrollIntoView({ block: "nearest" });
    }
    wasExpanded.current = expanded;
  }, [expanded]);

  if (!isGroup) {
    return (
      <details className={classList || undefined} {...rest}>
        {children}
      </details>
    );
  }

  if (!usable) {
    // 空组 / 组里没有图片：退回原生 details，作者至少看得到自己写的标题
    return (
      <details className={classList} open {...rest}>
        {children}
      </details>
    );
  }

  function toggle() {
    setExpanded((current) => !current);
  }

  function step(delta: number) {
    setActive((current) => (current + delta + total) % total);
  }

  return (
    <div
      className={cn("post-image-group", "ig", expanded && "is-expanded")}
      ref={containerRef}
    >
      <div
        aria-expanded={expanded}
        aria-label={collected.label || `图片组 · ${total} 张`}
        className="ig__viewport"
        onClick={(event) => {
          if (swipedRef.current) {
            swipedRef.current = false;
            return;
          }
          if (expanded) {
            // 展开态把点击留给灯箱（它靠 .post-content 上的事件委托）
            return;
          }
          event.stopPropagation();
          toggle();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            step(1);
            return;
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            step(-1);
            return;
          }
          if (!expanded && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            toggle();
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onPointerDown={(event) => {
          if (expanded) {
            return;
          }
          // 抓住指针：滑出元素之外也要收得到 pointerup，否则手势会卡在"拖动中"
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, moved: false };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) {
            return;
          }
          if (Math.abs(event.clientX - drag.x) > DRAG_SLOP) {
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
          if (drag.moved && Math.abs(dx) >= SWIPE_THRESHOLD) {
            swipedRef.current = true;
            step(dx < 0 ? 1 : -1);
          }
        }}
        ref={viewportRef}
        role={expanded ? undefined : "button"}
        tabIndex={expanded ? undefined : 0}
      >
        <div className="ig__track" ref={trackRef}>
          {collected.images.map((image, index) => (
            <div
              className="ig__card"
              data-active={index === active || undefined}
              key={index}
              style={{ ["--ig-i" as string]: Math.min(index, 8) } as CSSProperties}
            >
              {image}
            </div>
          ))}
        </div>
      </div>

      {collected.others.length > 0 ? (
        <div className="ig__others">{collected.others}</div>
      ) : null}

      {expanded ? (
        <button className="ig__pill" onClick={toggle} type="button">
          收起
        </button>
      ) : (
        <>
          <button className="ig__pill" onClick={toggle} type="button">
            展开 {total}
          </button>
          {total > 1 ? (
            <span className="ig__hint">左右滑动翻看 · 点一下展开</span>
          ) : null}
        </>
      )}
    </div>
  );
}
