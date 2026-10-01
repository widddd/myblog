/**
 * 灯箱「原图」取哪个 URL（纯函数，client 可引用，见 P-057 / P-119）。
 *
 * 规则：**配了 COS 的站优先直连对象存储**，只有站内路径才拼 `?proxy=1` 同源流式。
 *
 * 为什么不是一律走代理（2026-10-01 实测，同一张 4.82 MB 原图）：
 *   经站点服务器中转 1.03 MB/s（4.90s）  vs  直连 COS 8.10 MB/s（0.62s）
 * 原图动辄 3–5 MB，走服务器等于把轻量机（常见 3–6 Mbps 峰值）的出网带宽当瓶颈。
 * 直连的代价是跨域：XHR 报进度要桶上配 CORS（来源本站 + 暴露 Content-Length）；
 * 没配也不会白屏——调用方失败后会用 `lightboxProxyFallback()` 退回代理。
 */

export type LightboxSource = {
  /** 原图地址：配了 COS 时是对象存储直链，否则是站内 `/api/uploads/...` */
  src: string;
  /** 存储 key（`images/original/{hh}/{hash}.{ext}`），用于拼代理地址 */
  key?: string;
};

const LOCAL_UPLOAD_PREFIX = "/api/uploads/";

function encodeKey(key: string): string {
  return key
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

/** 站内同源流式地址（`?proxy=1` 明确不 302 到 COS，供 XHR 报进度用） */
export function lightboxProxyUrl(key: string): string {
  return `${LOCAL_UPLOAD_PREFIX}${encodeKey(key)}?proxy=1`;
}

/** 首选地址：站外（对象存储）直链就用它，站内路径才走代理 */
export function lightboxOriginalUrl(image: LightboxSource): string {
  if (image.src && !image.src.startsWith(LOCAL_UPLOAD_PREFIX)) {
    return image.src;
  }
  return image.key ? lightboxProxyUrl(image.key) : image.src;
}

/** 直连失败时的代理退路；当前已经是代理地址或没有 key 时返回 null */
export function lightboxProxyFallback(
  image: LightboxSource,
  current: string,
): string | null {
  if (!image.key) {
    return null;
  }
  const proxied = lightboxProxyUrl(image.key);
  return proxied === current ? null : proxied;
}
