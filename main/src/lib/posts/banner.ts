export const BANNER_STYLES = ["cover", "solid", "gradient"] as const;
export type BannerStyle = (typeof BANNER_STYLES)[number];

const DEFAULT_SOLID = "#4db8e8";
const DEFAULT_GRADIENT_TO = "#7b6cff";

export function isBannerStyle(value: string | null | undefined): value is BannerStyle {
  return value === "cover" || value === "solid" || value === "gradient";
}

export function bannerFill(
  style: string | null | undefined,
  color?: string | null,
  color2?: string | null,
): string | undefined {
  if (style === "solid") {
    return color || DEFAULT_SOLID;
  }
  if (style === "gradient") {
    const from = color || DEFAULT_SOLID;
    const to = color2 || DEFAULT_GRADIENT_TO;
    return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
  }
  return undefined;
}

export type PostBannerKind = "image" | "fill" | "none";

/**
 * 这篇文章的卡片/Banner 该画什么 —— **判定"有没有封面"必须走这里，不能只看 `cover` 字段**：
 * 作者在编辑器里选了「纯色 / 混色」时 `cover` 是空的，但那不是"无封面"。
 *
 * - `image`：封面图（bannerStyle=cover 且有图）
 * - `fill`：纯色 / 混色色块（用 `bannerFill()` 取 background）
 * - `none`：真·没有封面 → 前台列表走「细条卡」，Hero 走占位渐变
 */
export function postBannerKind(
  style: string | null | undefined,
  cover: string | null | undefined,
): PostBannerKind {
  if (style === "solid" || style === "gradient") {
    return "fill";
  }
  return cover ? "image" : "none";
}
