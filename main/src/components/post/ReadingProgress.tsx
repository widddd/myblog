"use client";

import { useEffect, useState } from "react";

export function ReadingProgress({ targetId = "post-content" }: { targetId?: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.getElementById(targetId);
        if (!target) {
          setProgress(0);
          return;
        }

        const start = target.getBoundingClientRect().top + window.scrollY;
        const distance = Math.max(1, target.offsetHeight - window.innerHeight);
        const value = ((window.scrollY - start) / distance) * 100;
        setProgress(Math.min(100, Math.max(0, value)));
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [targetId]);

  return (
    <div
      aria-label="阅读进度"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(progress)}
      className="reading-progress"
      role="progressbar"
    >
      <span style={{ transform: `scaleX(${progress / 100})` }} />
    </div>
  );
}
