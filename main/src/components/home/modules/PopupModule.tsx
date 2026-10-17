"use client";

import Link from "next/link";

import { PopupShell } from "@/components/home/modules/PopupShell";
import { isSafeHref, isSafeMediaUrl } from "@/lib/media/url";
import type { HomeModuleConfig } from "@/lib/home/types";

/** 普通弹出卡：可带配图，按钮可跳转。外壳与动画在 `PopupShell`。 */
export function PopupModule({
  config,
  preview = false,
  slug,
  styleAttr,
}: {
  config: HomeModuleConfig;
  preview?: boolean;
  slug: string;
  styleAttr?: {
    style: Record<string, string>;
    "data-mod-style"?: string;
  };
}) {
  const image = config.image && isSafeMediaUrl(config.image) ? config.image : null;
  const href =
    config.actionHref && isSafeHref(config.actionHref) ? config.actionHref : null;

  return (
    <PopupShell
      config={config}
      defaultPlacement="top-right"
      preview={preview}
      slug={slug}
      styleAttr={styleAttr}
    >
      <div className="home-popup__body">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 站点 images.unoptimized，本地/外链都直连
          <img alt="" className="home-popup__image" src={image} />
        ) : null}
        {config.title ? <p className="home-popup__title">{config.title}</p> : null}
        {config.text ? <p className="home-popup__text">{config.text}</p> : null}
        {config.actionLabel && href ? (
          <Link className="home-popup__action" href={href}>
            {config.actionLabel}
          </Link>
        ) : config.actionLabel ? (
          <span className="home-popup__action is-plain">{config.actionLabel}</span>
        ) : null}
      </div>
    </PopupShell>
  );
}
