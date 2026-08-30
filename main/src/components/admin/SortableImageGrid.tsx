"use client";

import { useState } from "react";

import { cn } from "@/lib/utils/cn";

export type SortableImageItem = {
  id: string;
  src: string;
};

type SortableImageGridProps<T extends SortableImageItem> = {
  images: T[];
  onChange: (images: T[]) => void;
  disabled?: boolean;
};

export function SortableImageGrid<T extends SortableImageItem>({
  images,
  onChange,
  disabled = false,
}: SortableImageGridProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const columns = images.length <= 1 ? 1 : images.length <= 4 ? 2 : 3;

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) {
      return;
    }
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function removeAt(index: number) {
    onChange(images.filter((_, itemIndex) => itemIndex !== index));
  }

  if (images.length === 0) {
    return null;
  }

  return (
    <ul
      className={cn(
        "admin-sort-grid",
        columns === 1 && "is-single",
        columns === 2 && "is-quad",
        columns === 3 && "is-nine",
      )}
    >
      {images.map((image, index) => (
        <li
          className={cn(
            "admin-sort-grid__item",
            dragIndex === index && "is-dragging",
          )}
          draggable={!disabled}
          key={image.id}
          onDragEnd={() => setDragIndex(null)}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDragStart={(event) => {
            setDragIndex(index);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(index));
          }}
          onDrop={(event) => {
            event.preventDefault();
            const from = Number(event.dataTransfer.getData("text/plain"));
            move(Number.isInteger(from) ? from : (dragIndex ?? index), index);
            setDragIndex(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={`图片 ${index + 1}`} draggable={false} src={image.src} />
          <div className="admin-sort-grid__tools">
            <span>拖动排序</span>
            <button
              disabled={disabled}
              onClick={() => removeAt(index)}
              type="button"
            >
              删除
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
