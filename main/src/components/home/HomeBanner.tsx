"use client";

import { useEffect } from "react";

import { ScrollDown } from "@/components/home/ScrollDown";
import type { HomeBanner as HomeBannerModel } from "@/lib/banner/resolve";

type HomeBannerProps = {
  siteName: string;
  banner: HomeBannerModel;
};

export function HomeBanner({ siteName, banner }: HomeBannerProps) {
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
          {/* Banner may be Setting/Bing/fallback; native img avoids broad remotePatterns. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="home-backdrop__img" src={banner.src} />
        </div>
        <div className="home-backdrop__veil" />
      </div>
      <section className="home-banner">
        <div className="home-banner__mask" />
        <div className="home-banner__copy">
          <div>
            <h1>{siteName}</h1>
            <p>记录思考，也记录生活。</p>
          </div>
        </div>
        <ScrollDown />
      </section>
    </>
  );
}
