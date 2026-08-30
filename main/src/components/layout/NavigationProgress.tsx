"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function isTrackableClick(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (event.defaultPrevented || event.button !== 0) {
    return false;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  if (anchor.target && anchor.target !== "_self") {
    return false;
  }
  if (anchor.hasAttribute("download")) {
    return false;
  }

  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("#")) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return false;
  }

  if (url.origin !== window.location.origin) {
    return false;
  }
  if (url.pathname.startsWith("/api/")) {
    return false;
  }
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search
  ) {
    return false;
  }
  return true;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const navigating = useRef(false);
  const timers = useRef<number[]>([]);
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    function clearTimers() {
      for (const id of timers.current) {
        window.clearTimeout(id);
      }
      timers.current = [];
    }

    function finish() {
      if (!navigating.current) {
        return;
      }
      clearTimers();
      setProgress(100);
      timers.current.push(
        window.setTimeout(() => {
          setVisible(false);
          setProgress(0);
          navigating.current = false;
        }, 280),
      );
    }

    finishRef.current = finish;

    function start() {
      if (navigating.current) {
        return;
      }
      navigating.current = true;
      clearTimers();
      setVisible(true);
      setProgress(0);
      requestAnimationFrame(() => setProgress(16));
      timers.current.push(window.setTimeout(() => setProgress(52), 160));
      timers.current.push(window.setTimeout(() => setProgress(76), 420));
      timers.current.push(window.setTimeout(() => setProgress(90), 1100));
      timers.current.push(window.setTimeout(() => finish(), 8000));
    }

    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a");
      if (anchor instanceof HTMLAnchorElement && isTrackableClick(event, anchor)) {
        start();
      }
    }

    function onSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      if (form.method.toLowerCase() !== "get") {
        return;
      }
      if (form.target && form.target !== "_self") {
        return;
      }
      start();
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    finishRef.current();
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden="true"
      className={visible ? "nav-progress is-on" : "nav-progress"}
      style={{ transform: `scaleX(${progress / 100})` }}
    />
  );
}
