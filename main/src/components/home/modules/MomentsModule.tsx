"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { HomeModuleConfig } from "@/lib/home/types";
import type { HomeMoment } from "@/lib/moments/types";
import {
  fillToHeight,
  layoutWaterfall,
  shuffle,
  toWaterfallImage,
  type WaterfallImage,
  type WaterfallRow,
} from "@/lib/moments/waterfall";
import { cn } from "@/lib/utils/cn";

const LINE_GAP = 8;
const FALLS_GAP = 4;
const DESKTOP_FALLS_HEIGHT = 300;

function opening(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function TypeLine({
  href,
  staticMotion,
  text,
}: {
  href: string;
  staticMotion: boolean;
  text: string;
}) {
  const [shown, setShown] = useState(staticMotion ? text : "");
  const [done, setDone] = useState(staticMotion);

  useEffect(() => {
    if (staticMotion) {
      setShown(text);
      setDone(true);
      return;
    }

    setShown("");
    setDone(false);
    const chars = Array.from(text);
    const delay = 500 + Math.random() * 1000;
    const duration = 500 + Math.random() * 1000;
    let interval = 0;
    const start = window.setTimeout(() => {
      const step = duration / Math.max(chars.length, 1);
      let index = 0;
      interval = window.setInterval(() => {
        index += 1;
        setShown(chars.slice(0, index).join(""));
        if (index >= chars.length) {
          window.clearInterval(interval);
          setDone(true);
        }
      }, step);
    }, delay);

    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [staticMotion, text]);

  return (
    <Link
      className={cn("dash-moments__line", done && "is-done")}
      href={href}
    >
      <span className="dash-moments__float">{shown || "\u00a0"}</span>
    </Link>
  );
}

function WaterfallRows({
  hidden,
  rows,
}: {
  hidden?: boolean;
  rows: WaterfallRow[];
}) {
  return (
    <div aria-hidden={hidden} className="dash-moments__stack">
      {rows.map((row, rowIndex) => (
        <div
          className={cn("dash-moments__row", `is-${row.kind}`)}
          key={`${row.kind}-${rowIndex}-${row.items[0]?.src}`}
        >
          {row.items.map((image, imageIndex) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              key={`${image.src}-${imageIndex}`}
              data-fallback={image.fallback}
              onError={(event) => {
                const node = event.currentTarget;
                const fallback = node.dataset.fallback;
                if (fallback && node.src !== fallback) {
                  node.src = fallback;
                }
              }}
              src={image.src}
              style={{
                ["--moment-w" as string]: String(image.width),
                ["--moment-h" as string]: String(image.height),
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function collectPool(moments: HomeMoment[]): WaterfallImage[] {
  const pool: WaterfallImage[] = [];
  for (const moment of moments) {
    for (const image of moment.images) {
      pool.push(
        toWaterfallImage({
          src: image.thumb2Src,
          width: image.width,
          height: image.height,
          fallback: image.thumbSrc,
        }),
      );
    }
  }
  return pool;
}

function pickFalls(
  pool: WaterfallImage[],
  targetHeight: number,
  colWidth: number,
): WaterfallImage[] {
  if (pool.length === 0) {
    return [];
  }
  return fillToHeight(pool, targetHeight, Math.max(colWidth, 72), FALLS_GAP);
}

export function MomentsModule({
  config,
  moments,
  preview = false,
}: {
  config: HomeModuleConfig;
  moments: HomeMoment[];
  preview?: boolean;
}) {
  const copyRef = useRef<HTMLDivElement>(null);
  const fallsRef = useRef<HTMLDivElement>(null);
  const poolRef = useRef<WaterfallImage[] | null>(null);
  const [staticMotion, setStaticMotion] = useState(preview);
  const [visibleCount, setVisibleCount] = useState(0);
  const [falls, setFalls] = useState<WaterfallImage[]>([]);

  const heading = config.heading?.trim() || "瞬间";
  const lines = useMemo(
    () =>
      moments.map((moment) => ({
        id: moment.id,
        text: opening(moment.content) || "（无文字）",
      })),
    [moments],
  );

  useEffect(() => {
    if (preview) {
      setStaticMotion(true);
      return;
    }
    setStaticMotion(prefersReducedMotion());
  }, [preview]);

  useEffect(() => {
    const node = copyRef.current;
    if (!node) {
      return;
    }
    const measure = () => {
      const sample = node.querySelector(".dash-moments__line");
      const lineHeight = sample?.getBoundingClientRect().height ?? 28;
      const available = node.clientHeight;
      const count = Math.max(
        1,
        Math.floor((available + LINE_GAP) / (lineHeight + LINE_GAP)),
      );
      setVisibleCount(Math.min(lines.length, count));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [lines.length]);

  useEffect(() => {
    poolRef.current = null;
  }, [moments]);

  useEffect(() => {
    const node = fallsRef.current;
    if (!node) {
      return;
    }

    const apply = () => {
      if (!poolRef.current) {
        const raw = collectPool(moments);
        poolRef.current = raw.length > 0 ? shuffle(raw) : [];
      }
      const height =
        node.clientHeight || DESKTOP_FALLS_HEIGHT;
      const width = node.clientWidth || 120;
      setFalls(
        pickFalls(poolRef.current, height * (staticMotion ? 1 : 2), width),
      );
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [moments, staticMotion]);

  const rows = layoutWaterfall(falls);
  const hasFalls = rows.length > 0;

  return (
    <section className="dash-moments glass-card">
      <div className="dash-moments__copy">
        <h2>
          <Link href="/moments">{heading}</Link>
        </h2>
        <div className="dash-moments__lines" ref={copyRef}>
          {lines.map((line, index) => (
            <TypeLine
              href={`/moments#moment-${line.id}`}
              key={line.id}
              staticMotion={
                staticMotion || visibleCount === 0 || index >= visibleCount
              }
              text={line.text}
            />
          ))}
        </div>
      </div>
      <div className="dash-moments__falls" ref={fallsRef}>
        {hasFalls ? (
          <div
            className={cn(
              "dash-moments__track",
              !staticMotion && "is-rolling",
            )}
          >
            <WaterfallRows rows={rows} />
            {staticMotion ? null : <WaterfallRows hidden rows={rows} />}
          </div>
        ) : null}
      </div>
    </section>
  );
}
