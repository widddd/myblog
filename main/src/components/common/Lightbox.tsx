"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

type SelectedImage = {
  src: string;
  alt: string;
};

function imageFromTarget(target: EventTarget | null): HTMLImageElement | null {
  return target instanceof HTMLImageElement &&
    target.dataset.lightboxSrc
    ? target
    : null;
}

export function Lightbox({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<SelectedImage | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (selected && !dialog.open) {
      dialog.showModal();
    } else if (!selected && dialog.open) {
      dialog.close();
    }
  }, [selected]);

  function select(image: HTMLImageElement) {
    const src = image.dataset.lightboxSrc;
    if (src) {
      setSelected({ src, alt: image.alt });
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const image = imageFromTarget(event.target);
    if (image) {
      select(image);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const image = imageFromTarget(event.target);
    if (image) {
      event.preventDefault();
      select(image);
    }
  }

  return (
    <>
      <div onClick={handleClick} onKeyDown={handleKeyDown}>
        {children}
      </div>
      <dialog
        aria-label="图片预览"
        className="lightbox"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        onClose={() => setSelected(null)}
        ref={dialogRef}
      >
        <button
          aria-label="关闭图片预览"
          className="lightbox__close"
          onClick={() => dialogRef.current?.close()}
          type="button"
        >
          ×
        </button>
        {selected ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={selected.alt} src={selected.src} />
        ) : null}
      </dialog>
    </>
  );
}
