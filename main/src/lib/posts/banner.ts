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
