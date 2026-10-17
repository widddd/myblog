"use client";

import Image from "next/image";
import { useState } from "react";

/** 这一页里已经 404 过的 L2 地址：记住它，重渲染 / 重挂载都直接用一级图，别再打一次 404 */
const failedL2 = new Set<string>();

/**
 * 二级缩略图（`images/thumbs2/`，只存本地）的展示件。
 *
 * L2 是「按需生成」的：库里 / 磁盘上可能还没有那个文件，URL 会 404。
 * 这里在加载失败时回退到一级缩略图 —— 不回退就是一张破图，用户只会看到白块。
 * 两种图都吃 next/image 的透传 loader（`images.unoptimized`，见 P-061）。
 *
 * 回退状态不跟 `src` 做同步 effect（那会触发 cascading render，eslint 也拦）：
 * 渲染期算一次「该用哪张」就够，`src` 变了 next/image 自己会换图。
 */
export function Thumb2Image({
  alt,
  fallback,
  sizes = "300px",
  src,
}: {
  alt: string;
  /** 一级缩略图（L2 缺失 / 404 时的兜底） */
  fallback?: string | null;
  sizes?: string;
  src: string;
}) {
  const [failed, setFailed] = useState(false);
  const current = (failed || failedL2.has(src)) && fallback ? fallback : src;

  return (
    <Image
      alt={alt}
      fill
      onError={() => {
        if (!fallback || current === fallback) {
          return;
        }
        failedL2.add(src);
        setFailed(true);
      }}
      sizes={sizes}
      src={current}
    />
  );
}
