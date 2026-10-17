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
      // 关键：`<form>` 没写 method 时 `form.method` 也是 "get"，而后台的发布/保存表单
      // 全是 React 自建表单（onSubmit 里 preventDefault + fetch + router.refresh）——
      // 它们**不会导航**，`finish()` 要等 pathname/searchParams 变化，于是永远等不到：
      // 进度条停在 76%（用户看到的就是"卡在 70% 左右"），直到 8 秒兜底才消失。
      //
      // 所以这个监听必须挂在**冒泡**阶段（React 的监听在 root 容器上，冒泡早于 document），
      // 到这里 `defaultPrevented` 已经能区分「真的会导航的原生 GET 表单（筛选 / 搜索）」与
      // 「被 React 接管的表单」。挂在捕获阶段的话这个属性永远是 false，区分不了。
      if (event.defaultPrevented) {
        return;
      }
      start();
    }

    document.addEventListener("click", onClick, true);
    // submit 走冒泡：要在 React 的 root 容器处理完之后再看 defaultPrevented（见 onSubmit 注释）
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
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
