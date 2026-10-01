"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

export type SortableImageItem = {
  /** 稳定 id：**不要**把数组下标编进来，否则拖动重排后 React 会按新 key 重挂 <img>，图片会重新请求。 */
  id: string;
  src: string;
};

type SortableImageGridProps<T extends SortableImageItem> = {
  images: T[];
  onChange: (images: T[]) => void;
  disabled?: boolean;
};

/**
 * 可拖动排序的图片九宫格。
 *
 * 用 **Pointer Events** 自己实现拖动，而不是 HTML5 的 `draggable` + dragstart/drop：
 * 后者在触屏（手机/平板）上根本不触发，所以手机上永远拖不动。
 * 同时这里给手柄加 `touch-action: none`（见 admin.css 的 `.admin-sort-grid__handle`），
 * 否则手指移动会被浏览器当成页面滚动吞掉。
 *
 * 拖动过程中只改内部 `dropIndex`（视觉提示），**指针抬起时才真正重排**——
 * 拖一次只触发一次 onChange，图片不会在拖动过程中被反复搬动/重挂。
 */
export function SortableImageGrid<T extends SortableImageItem>({
  images,
  onChange,
  disabled = false,
}: SortableImageGridProps<T>) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; src: string } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const columns = images.length <= 1 ? 1 : images.length <= 4 ? 2 : 3;

  function hitTest(clientX: number, clientY: number): number | null {
    const element = document.elementFromPoint(clientX, clientY);
    const item = element?.closest<HTMLElement>("[data-sort-index]");
    if (!item || !listRef.current?.contains(item)) {
      return null;
    }
    const index = Number(item.dataset.sortIndex);
    return Number.isInteger(index) ? index : null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>, index: number) {
    if (disabled || event.button !== 0) {
      return;
    }
    // 让指针事件持续发给手柄（手指移出手柄也能继续收到 move/up）
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragId(images[index].id);
    setDropIndex(index);
    setGhost({ x: event.clientX, y: event.clientY, src: images[index].src });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!dragId) {
      return;
    }
    setGhost((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
    const index = hitTest(event.clientX, event.clientY);
    if (index !== null) {
      setDropIndex(index);
    }
  }

  function handlePointerUp() {
    const from = images.findIndex((item) => item.id === dragId);
    const to = dropIndex;
    setDragId(null);
    setDropIndex(null);
    setGhost(null);
    if (from < 0 || to === null || from === to) {
      return;
    }
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  if (images.length === 0) {
    return null;
  }

  return (
    <>
      <ul
        className={cn(
          "admin-sort-grid",
          columns === 1 && "is-single",
          columns === 2 && "is-quad",
          columns === 3 && "is-nine",
        )}
        ref={listRef}
      >
        {images.map((image, index) => (
          <li
            className={cn(
              "admin-sort-grid__item",
              dragId === image.id && "is-dragging",
              dragId && dragId !== image.id && dropIndex === index && "is-drop-target",
            )}
            data-sort-index={index}
            key={image.id}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`图片 ${index + 1}`}
              decoding="async"
              draggable={false}
              loading="eager"
              src={image.src}
            />
            <div className="admin-sort-grid__tools">
              <button
                aria-label={`拖动排序（第 ${index + 1} 张）`}
                className="admin-sort-grid__handle"
                disabled={disabled}
                onPointerCancel={handlePointerUp}
                onPointerDown={(event) => handlePointerDown(event, index)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                type="button"
              >
                拖动排序
              </button>
              <button
                className="admin-sort-grid__remove"
                disabled={disabled}
                onClick={() =>
                  onChange(images.filter((item) => item.id !== image.id))
                }
                type="button"
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>
      {ghost ? (
        <span
          aria-hidden="true"
          className="admin-sort-ghost"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" draggable={false} src={ghost.src} />
        </span>
      ) : null}
    </>
  );
}
