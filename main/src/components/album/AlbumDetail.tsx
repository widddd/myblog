"use client";

import Link from "next/link";
import { useState } from "react";

import { ALBUMS_PATH } from "@/lib/albums/path";
import type { PublicAlbumDetail } from "@/lib/albums/types";

import { PhotoPile } from "./PhotoPile";

/**
 * 相册详情（版式定稿见 demo/album-page）：banner + 工具条 + 分组的一叠叠照片。
 *
 * 图片分层：banner 与每一叠都用**一级缩略图**；原图地址只写进 `data-lightbox-*`，
 * 由页面级 `Lightbox` 在点击时加载（需求见 docs/albums-spec.md §3.4）。
 *
 * **分组顺序与组头**（2026-10-03 用户口径，见 docs/albums-spec.md §3.5）：
 * - 「不属于任何卷」那一组**排在最前**（相册没建卷时它就是整本），组头**只显示张数**
 *   （`N 张`，**不出现「未分类」字样**）；
 * - 有名字的卷按 `sort → id` 跟在后面，组头显示**卷名**（自由文本，日期可以写进名字，不强制）；
 * - **空卷名 = 不作为独立分组**：读层已把它的照片并进最前那一组（`album.loose`），
 *   所以这里不会渲染出空组头，也不会有两个同名组。
 */
export function AlbumDetail({ album }: { album: PublicAlbumDetail }) {
  const [signal, setSignal] = useState<{
    action: "expand" | "collapse";
    token: number;
  } | null>(null);

  const bump = (action: "expand" | "collapse") =>
    setSignal((previous) => ({ action, token: (previous?.token ?? 0) + 1 }));

  const volumes = album.volumes;
  const meta = [
    `${album.total} 张`,
    volumes.length > 0 ? `${volumes.length} 卷` : "",
    album.dateText,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="album-detail">
      {album.cover ? (
        <header className="album-hero">
          {/* banner 用一级缩略图；原图地址只进 data 属性，点开才加载 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={album.title}
            data-lightbox-key={album.cover.key}
            data-lightbox-src={album.cover.src}
            data-lightbox-thumb={album.cover.thumbSrc}
            decoding="async"
            height={album.cover.height}
            src={album.cover.thumbSrc}
            width={album.cover.width}
          />
          <div className="album-hero__body">
            <span className="album-hero__eyebrow">相册</span>
            <h1 className="album-hero__title">{album.title}</h1>
            <p className="album-hero__meta">{meta}</p>
            {album.description ? (
              <p className="album-hero__desc">{album.description}</p>
            ) : null}
          </div>
        </header>
      ) : null}

      {album.total > 0 ? (
        <div className="album-toolbar">
          <span className="album-toolbar__count">
            共 {volumes.length > 0 ? `${volumes.length} 卷 · ` : ""}
            {album.total} 张
          </span>
          <button
            className="album-pill"
            onClick={() => bump("expand")}
            type="button"
          >
            全部展开
          </button>
          <button
            className="album-pill"
            onClick={() => bump("collapse")}
            type="button"
          >
            全部收起
          </button>
          <Link className="album-pill" href={ALBUMS_PATH}>
            ← 相册列表
          </Link>
        </div>
      ) : null}

      {/* 「不属于任何卷」那一组永远排在最前（含空卷名的卷的照片）；组头只有张数 */}
      {album.loose.length > 0 ? (
        <section className="album-fold">
          <div className="album-fold__head">
            <span aria-hidden className="album-fold__dot" />
            <span className="album-fold__count">{album.loose.length} 张</span>
          </div>
          <PhotoPile
            expandAll={signal}
            photos={album.loose}
            title={album.title}
          />
        </section>
      ) : null}

      {volumes.map((volume) => (
        <section className="album-fold" key={volume.id}>
          <div className="album-fold__head">
            <span aria-hidden className="album-fold__dot" />
            {/* 组头只显示卷名（自由文本，日期可写进名字）；卷名非空才可能有这一组 */}
            {volume.title ? (
              <span className="album-fold__title">{volume.title}</span>
            ) : null}
            <span className="album-fold__count">{volume.photos.length} 张</span>
          </div>
          <PhotoPile
            expandAll={signal}
            photos={volume.photos}
            title={volume.title || album.title}
          />
        </section>
      ))}
    </div>
  );
}
