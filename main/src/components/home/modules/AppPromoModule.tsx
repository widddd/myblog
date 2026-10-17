"use client";

import Link from "next/link";

import { AppLogoMark } from "@/components/common/AppLogoMark";
import { PopupShell } from "@/components/home/modules/PopupShell";
import { isSafeHref, isSafeMediaUrl } from "@/lib/media/url";
import type { HomeModuleConfig } from "@/lib/home/types";

/**
 * 推荐应用卡（覆盖层）：方形应用图标 + 标题 + 一句说明 + 下载按钮。
 * 图标默认用内置矢量 `AppLogoMark`，配了 `config.image` 就用配置的图。
 */
export function AppPromoModule({
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
      className="home-app-promo"
      config={config}
      defaultPlacement="top-right"
      preview={preview}
      slug={slug}
      styleAttr={styleAttr}
    >
      <div className="home-app-promo__row">
        <span className="home-app-promo__logo">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- 站点 images.unoptimized，本地/外链都直连
            <img alt="" src={image} />
          ) : (
            <AppLogoMark className="home-app-promo__logo-svg" />
          )}
        </span>
        <div className="home-app-promo__copy">
          {config.badge ? (
            <span className="home-app-promo__badge">{config.badge}</span>
          ) : null}
          {config.title ? (
            <p className="home-app-promo__title">{config.title}</p>
          ) : null}
          {config.text ? (
            <p className="home-app-promo__text">{config.text}</p>
          ) : null}
        </div>
      </div>
      {config.actionLabel ? (
        href ? (
          <Link className="home-app-promo__action" href={href}>
            {config.actionLabel}
          </Link>
        ) : (
          <span className="home-app-promo__action is-plain">
            {config.actionLabel}
          </span>
        )
      ) : null}
    </PopupShell>
  );
}
