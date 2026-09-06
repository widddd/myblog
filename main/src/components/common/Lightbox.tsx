"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  applyPan,
  applyPinch,
  containScale,
  fitCentered,
  isLightboxFit,
  maxLightboxScale,
  pointerDistance,
  pointerMidpoint,
  wheelFactor,
  zoomAtPoint,
  type LightboxTransform,
  type Point,
} from "@/lib/client/lightbox-zoom";

type SelectedImage = {
  src: string;
  thumb?: string;
  key?: string;
  alt: string;
  width?: number;
  height?: number;
};

type CachedOriginal = {
  src: string;
  width: number;
  height: number;
};

const MAX_ORIGINAL_CACHE = 6;
const originalCache = new Map<string, CachedOriginal>();
const inflight = new Map<
  string,
  {
    promise: Promise<CachedOriginal>;
    listeners: Set<(percent: number) => void>;
  }
>();

function cacheId(image: SelectedImage) {
  return image.key || image.src;
}

function readCached(id: string) {
  const hit = originalCache.get(id);
  if (!hit) {
    return undefined;
  }
  originalCache.delete(id);
  originalCache.set(id, hit);
  return hit;
}

function writeCached(id: string, entry: CachedOriginal) {
  const previous = originalCache.get(id);
  if (previous && previous.src !== entry.src && previous.src.startsWith("blob:")) {
    URL.revokeObjectURL(previous.src);
  }
  originalCache.delete(id);
  originalCache.set(id, entry);
  while (originalCache.size > MAX_ORIGINAL_CACHE) {
    const oldest = originalCache.keys().next().value;
    if (!oldest) {
      break;
    }
    const evicted = originalCache.get(oldest);
    originalCache.delete(oldest);
    if (evicted?.src.startsWith("blob:")) {
      URL.revokeObjectURL(evicted.src);
    }
  }
}

function imageFromTarget(target: EventTarget | null): HTMLImageElement | null {
  return target instanceof HTMLImageElement && target.dataset.lightboxSrc
    ? target
    : null;
}

function selectedFromImage(image: HTMLImageElement): SelectedImage {
  return {
    src: image.dataset.lightboxSrc ?? image.src,
    thumb: image.dataset.lightboxThumb || image.src,
    key: image.dataset.lightboxKey,
    alt: image.alt,
    width: image.naturalWidth || undefined,
    height: image.naturalHeight || undefined,
  };
}

function proxyUrl(key: string) {
  const encoded = key
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `/api/uploads/${encoded}?proxy=1`;
}

function fitBox(naturalWidth: number, naturalHeight: number) {
  const maxW = Math.round(window.innerWidth * 0.94);
  const maxH = Math.round(window.innerHeight * 0.92);
  const width = Math.max(1, naturalWidth);
  const height = Math.max(1, naturalHeight);
  const scale = Math.min(maxW / width, maxH / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function fetchBlobWithProgress(
  url: string,
  onProgress: (percent: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "blob";
    xhr.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof Blob) {
        onProgress(100);
        resolve(xhr.response);
      } else {
        reject(new Error("原图加载失败"));
      }
    };
    xhr.onerror = () => reject(new Error("原图加载失败"));
    xhr.send();
  });
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("原图解码失败"));
    image.src = src;
  });
}

function loadOriginal(
  id: string,
  url: string,
  onProgress: (percent: number) => void,
): Promise<CachedOriginal> {
  const hit = readCached(id);
  if (hit) {
    onProgress(100);
    return Promise.resolve(hit);
  }

  let job = inflight.get(id);
  if (!job) {
    const listeners = new Set<(percent: number) => void>();
    const promise = (async () => {
      const blob = await fetchBlobWithProgress(url, (percent) => {
        for (const listener of listeners) {
          listener(percent);
        }
      });
      const objectUrl = URL.createObjectURL(blob);
      try {
        const decoded = await decodeImage(objectUrl);
        const entry = {
          src: objectUrl,
          width: decoded.naturalWidth,
          height: decoded.naturalHeight,
        };
        writeCached(id, entry);
        return entry;
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
      }
    })().finally(() => {
      inflight.delete(id);
    });
    job = { promise, listeners };
    inflight.set(id, job);
  }
  job.listeners.add(onProgress);
  return job.promise.finally(() => {
    job?.listeners.delete(onProgress);
  });
}

function localPoint(surface: HTMLElement, event: { clientX: number; clientY: number }): Point {
  const rect = surface.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function LightboxStage({
  image,
  onDismiss,
}: {
  image: SelectedImage;
  onDismiss: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<LightboxTransform>({ scale: 1, x: 0, y: 0 });
  const boxRef = useRef<{ width: number; height: number } | null>(null);
  const draggedRef = useRef(false);
  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{
    origin: LightboxTransform;
    startMid: Point;
    startDist: number;
  } | null>(null);
  const panRef = useRef<{ origin: LightboxTransform; from: Point } | null>(null);
  const minScaleRef = useRef(1);
  const maxScaleRef = useRef(8);
  const hasOriginalSizeRef = useRef(false);
  const fromCacheRef = useRef(readCached(cacheId(image)));
  const cached = fromCacheRef.current;

  const thumbSrc = image.thumb || image.src;
  const [box, setBox] = useState<{ width: number; height: number } | null>(() => {
    if (cached?.width && cached.height) {
      hasOriginalSizeRef.current = true;
      return { width: cached.width, height: cached.height };
    }
    return null;
  });
  const [progress, setProgress] = useState(cached ? 100 : 0);
  const [originalSrc, setOriginalSrc] = useState<string | null>(cached?.src ?? null);
  const [ready, setReady] = useState(Boolean(cached));
  const [fromCache] = useState(Boolean(cached));
  const [transform, setTransform] = useState<LightboxTransform>({
    scale: 1,
    x: 0,
    y: 0,
  });
  const [panning, setPanning] = useState(false);

  boxRef.current = box;
  transformRef.current = transform;

  function commitTransform(next: LightboxTransform) {
    transformRef.current = next;
    setTransform(next);
  }

  function syncFitScales() {
    const surface = surfaceRef.current;
    const currentBox = boxRef.current;
    if (!surface || !currentBox) {
      return null;
    }
    if (surface.clientWidth < 1 || surface.clientHeight < 1) {
      return null;
    }
    const min = containScale(
      surface.clientWidth,
      surface.clientHeight,
      currentBox.width,
      currentBox.height,
    );
    minScaleRef.current = min;
    maxScaleRef.current = maxLightboxScale(min);
    return { surface, currentBox, min };
  }

  function recenter() {
    const fit = syncFitScales();
    if (!fit) {
      return;
    }
    commitTransform(
      fitCentered(
        fit.surface.clientWidth,
        fit.surface.clientHeight,
        fit.currentBox.width,
        fit.currentBox.height,
        fit.min,
      ),
    );
  }

  useLayoutEffect(() => {
    if (!box) {
      return;
    }
    recenter();
  }, [box]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const fit = syncFitScales();
      if (!fit) {
        return;
      }
      if (isLightboxFit(transformRef.current.scale, fit.min)) {
        recenter();
      }
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (fromCacheRef.current) {
      return;
    }
    let cancelled = false;
    const thumb = new Image();
    thumb.onload = () => {
      if (!cancelled && !hasOriginalSizeRef.current) {
        setBox(fitBox(thumb.naturalWidth || 1600, thumb.naturalHeight || 900));
      }
    };
    thumb.onerror = () => {
      if (!cancelled && !boxRef.current) {
        setBox(fitBox(1600, 900));
      }
    };
    thumb.src = thumbSrc;
    return () => {
      cancelled = true;
    };
  }, [thumbSrc]);

  useEffect(() => {
    if (fromCacheRef.current) {
      return;
    }
    let cancelled = false;
    const id = cacheId(image);
    const url = image.key ? proxyUrl(image.key) : image.src;

    void (async () => {
      try {
        const loaded = await loadOriginal(id, url, (percent) => {
          if (!cancelled) {
            setProgress(percent);
          }
        });
        if (cancelled) {
          return;
        }
        setOriginalSrc(loaded.src);
        if (loaded.width > 0 && loaded.height > 0) {
          hasOriginalSizeRef.current = true;
          setBox({ width: loaded.width, height: loaded.height });
        }
      } catch {
        if (cancelled) {
          return;
        }
        setProgress(100);
        setOriginalSrc(image.src);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [image.key, image.src]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    function pointFromEvent(event: PointerEvent | WheelEvent): Point {
      return localPoint(surface, event);
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const current = transformRef.current;
      const next = zoomAtPoint(
        current,
        pointFromEvent(event),
        current.scale * wheelFactor(event.deltaY, event.deltaMode),
        minScaleRef.current,
        maxScaleRef.current,
      );
      if (isLightboxFit(next.scale, minScaleRef.current)) {
        recenter();
        return;
      }
      commitTransform(next);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 && event.pointerType === "mouse") {
        return;
      }
      const point = pointFromEvent(event);
      pointersRef.current.set(event.pointerId, point);
      surface.setPointerCapture(event.pointerId);
      draggedRef.current = false;

      if (pointersRef.current.size === 2) {
        const [first, second] = [...pointersRef.current.values()];
        pinchRef.current = {
          origin: transformRef.current,
          startMid: pointerMidpoint(first, second),
          startDist: pointerDistance(first, second),
        };
        panRef.current = null;
        setPanning(true);
        return;
      }

      if (!isLightboxFit(transformRef.current.scale, minScaleRef.current)) {
        panRef.current = { origin: transformRef.current, from: point };
        setPanning(true);
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (!pointersRef.current.has(event.pointerId)) {
        return;
      }
      const point = pointFromEvent(event);
      const previous = pointersRef.current.get(event.pointerId);
      if (previous && pointerDistance(previous, point) > 3) {
        draggedRef.current = true;
      }
      pointersRef.current.set(event.pointerId, point);

      if (pinchRef.current && pointersRef.current.size >= 2) {
        event.preventDefault();
        const [first, second] = [...pointersRef.current.values()];
        commitTransform(
          applyPinch(
            pinchRef.current.origin,
            pinchRef.current.startMid,
            pinchRef.current.startDist,
            pointerMidpoint(first, second),
            pointerDistance(first, second),
            minScaleRef.current,
            maxScaleRef.current,
          ),
        );
        return;
      }

      if (panRef.current) {
        event.preventDefault();
        commitTransform(applyPan(panRef.current.origin, panRef.current.from, point));
      }
    }

    function endPointer(event: PointerEvent) {
      if (!pointersRef.current.has(event.pointerId)) {
        return;
      }
      pointersRef.current.delete(event.pointerId);
      if (surface.hasPointerCapture(event.pointerId)) {
        surface.releasePointerCapture(event.pointerId);
      }

      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
      }
      if (pointersRef.current.size === 0) {
        panRef.current = null;
        setPanning(false);
        if (isLightboxFit(transformRef.current.scale, minScaleRef.current)) {
          recenter();
        }
        return;
      }

      const remaining = [...pointersRef.current.values()][0];
      if (remaining && !isLightboxFit(transformRef.current.scale, minScaleRef.current)) {
        panRef.current = { origin: transformRef.current, from: remaining };
      } else {
        panRef.current = null;
      }
    }

    function preventGesture(event: Event) {
      event.preventDefault();
    }

    surface.addEventListener("wheel", onWheel, { passive: false });
    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove, { passive: false });
    surface.addEventListener("pointerup", endPointer);
    surface.addEventListener("pointercancel", endPointer);
    surface.addEventListener("gesturestart", preventGesture, { passive: false });
    surface.addEventListener("gesturechange", preventGesture, { passive: false });
    return () => {
      surface.removeEventListener("wheel", onWheel);
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", endPointer);
      surface.removeEventListener("pointercancel", endPointer);
      surface.removeEventListener("gesturestart", preventGesture);
      surface.removeEventListener("gesturechange", preventGesture);
    };
  }, []);

  const style = box
    ? { width: `${box.width}px`, height: `${box.height}px` }
    : undefined;
  const zoomed = !isLightboxFit(transform.scale, minScaleRef.current);

  return (
    <div
      className={
        panning
          ? "lightbox__viewport is-panning"
          : zoomed
            ? "lightbox__viewport is-zoomed"
            : "lightbox__viewport"
      }
      onClick={(event) => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        if (event.target === event.currentTarget) {
          onDismiss();
        }
      }}
      ref={surfaceRef}
    >
      <div
        className="lightbox__zoom"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        <div className="lightbox__stage" style={style}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            aria-hidden="true"
            className="lightbox__layer lightbox__layer--thumb"
            draggable={false}
            src={thumbSrc}
          />
          {originalSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={image.alt}
              className={
                fromCache
                  ? "lightbox__layer lightbox__layer--full is-cached"
                  : ready
                    ? "lightbox__layer lightbox__layer--full is-ready"
                    : "lightbox__layer lightbox__layer--full"
              }
              draggable={false}
              onLoad={(event) => {
                const img = event.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  hasOriginalSizeRef.current = true;
                  setBox({ width: img.naturalWidth, height: img.naturalHeight });
                }
                void (async () => {
                  try {
                    if (typeof img.decode === "function") {
                      await img.decode();
                    }
                  } catch {
                    // decode can reject if the node is gone
                  }
                  setReady(true);
                })();
              }}
              src={originalSrc}
            />
          ) : null}
          {!ready && !fromCache ? (
            <div className="lightbox__meter" role="progressbar" aria-valuenow={progress}>
              <div className="lightbox__meter-track">
                <span style={{ width: `${progress}%` }} />
              </div>
              <p>{progress}%</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Lightbox({
  children,
  onClose,
  openAlt,
  openHeight,
  openKey,
  openSrc,
  openThumb,
  openWidth,
}: {
  children?: ReactNode;
  onClose?: () => void;
  openAlt?: string;
  openHeight?: number | null;
  openKey?: string | null;
  /** When provided (including null), open state is controlled by the parent. */
  openSrc?: string | null;
  openThumb?: string | null;
  openWidth?: number | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [internal, setInternal] = useState<SelectedImage | null>(null);
  const controlled = openSrc !== undefined;
  const selected = controlled
    ? openSrc
      ? {
          src: openSrc,
          thumb: openThumb || openSrc,
          key: openKey || undefined,
          alt: openAlt ?? "",
          width: openWidth || undefined,
          height: openHeight || undefined,
        }
      : null
    : internal;

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

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (controlled) {
      return;
    }
    const image = imageFromTarget(event.target);
    if (image) {
      setInternal(selectedFromImage(image));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (controlled || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }
    const image = imageFromTarget(event.target);
    if (image) {
      event.preventDefault();
      setInternal(selectedFromImage(image));
    }
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      {children ? (
        <div onClick={handleClick} onKeyDown={handleKeyDown}>
          {children}
        </div>
      ) : null}
      <dialog
        aria-label="图片预览"
        className="lightbox"
        onClose={() => {
          setInternal(null);
          onClose?.();
        }}
        ref={dialogRef}
      >
        <button
          aria-label="关闭图片预览"
          className="lightbox__close"
          onClick={close}
          type="button"
        >
          ×
        </button>
        {selected ? (
          <LightboxStage
            image={selected}
            key={selected.key || selected.src}
            onDismiss={close}
          />
        ) : null}
      </dialog>
    </>
  );
}
