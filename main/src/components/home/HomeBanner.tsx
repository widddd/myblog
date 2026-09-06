"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type SyntheticEvent } from "react";

import { ScrollDown } from "@/components/home/ScrollDown";
import type { HomeBanner as HomeBannerModel } from "@/lib/banner/resolve";
import {
  cancelHomeLoad,
  finishHomeLoad,
  setHomeLoadPercent,
  startHomeLoad,
} from "@/lib/client/transfer-hud";
import { cn } from "@/lib/utils/cn";

type HomeBannerProps = {
  siteName: string;
  banner: HomeBannerModel;
  subtitle?: string;
  height?: "full" | "large" | "medium";
  trackLoad?: boolean;
};

export function HomeBanner({
  siteName,
  banner,
  subtitle,
  height = "full",
  trackLoad = true,
}: HomeBannerProps) {
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const imageReady = readySrc === banner.src;

  const onImageLoad = useCallback(
    async (event: SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        }
      } catch {
        // decode() can reject if the node is gone; still reveal if pixels exist
      }
      if (img.naturalWidth > 0) {
        setReadySrc(banner.src);
      }
    },
    [banner.src],
  );

  useEffect(() => {
    if (!trackLoad) {
      return;
    }
    if (imageReady) {
      finishHomeLoad();
      return;
    }
    startHomeLoad();
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const percent = Math.min(90, Math.round(8 + 82 * (1 - Math.exp(-elapsed / 1600))));
      setHomeLoadPercent(percent);
    }, 100);
    return () => window.clearInterval(timer);
  }, [banner.src, imageReady, trackLoad]);

  useEffect(() => {
    if (!trackLoad) {
      return;
    }
    return () => cancelHomeLoad();
  }, [banner.src, trackLoad]);

  useEffect(() => {
    let frame = 0;

    function update() {
      const max = Math.max(window.innerHeight * 0.85, 1);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      const root = document.documentElement;
      // Veil/blur caps live here: keep the hero readable without washing out Bing/custom art.
      root.style.setProperty("--home-blur", `${(progress * 10).toFixed(2)}px`);
      root.style.setProperty("--home-veil", (progress * 0.28).toFixed(3));
    }

    function onScroll() {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) {
        cancelAnimationFrame(frame);
      }
      document.documentElement.style.removeProperty("--home-blur");
      document.documentElement.style.removeProperty("--home-veil");
    };
  }, []);

  return (
    <>
      <div aria-hidden="true" className="home-backdrop">
        <div className="home-backdrop__frame">
          <Image
            alt=""
            className={cn("home-backdrop__img", imageReady && "is-ready")}
            fill
            onLoad={onImageLoad}
            priority
            sizes="100vw"
            src={banner.src}
          />
        </div>
        <div className="home-backdrop__veil" />
      </div>
      <section className={cn("home-banner", `home-banner--${height}`)}>
        <div className="home-banner__mask" />
        <div className="home-banner__copy">
          <div>
            <h1>{siteName}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        {height === "full" ? <ScrollDown /> : null}
      </section>
    </>
  );
}
