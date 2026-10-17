/** 列表卡封面的独立形态；`none` = 无封面（前台走细条卡）。 */
export const COVER_STYLES = ["image", "solid", "gradient", "none"] as const;
export type CoverStyle = (typeof COVER_STYLES)[number];

/**
 * 文章详情 Banner 的形态：
 * - `cover`：与封面一致（图片/纯色/混色都跟着封面走，不重复上传）
 * - `image`：单独的 Banner 图片
 * - `solid` / `gradient`：自己的纯色 / 混色
 */
export const BANNER_STYLES = ["cover", "image", "solid", "gradient"] as const;
export type BannerStyle = (typeof BANNER_STYLES)[number];

const DEFAULT_SOLID = "#4db8e8";
const DEFAULT_GRADIENT_TO = "#7b6cff";

/** 删除 Banner 时用这些成对色生成一张稳定的随机混色，避免出现空白顶图。 */
const RANDOM_GRADIENTS = [
  ["#4db8e8", "#7b6cff"],
  ["#f59e0b", "#ef4444"],
  ["#10b981", "#0ea5e9"],
  ["#8b5cf6", "#ec4899"],
  ["#f97316", "#facc15"],
  ["#06b6d4", "#3b82f6"],
] as const;

export function isCoverStyle(value: string | null | undefined): value is CoverStyle {
  return COVER_STYLES.includes(value as CoverStyle);
}

export function isBannerStyle(value: string | null | undefined): value is BannerStyle {
  return BANNER_STYLES.includes(value as BannerStyle);
}

/** 纯色 / 混色 → CSS background；图片形态返回 undefined。 */
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

/** 删除 Banner 时生成一对随机渐变色；只在用户点击事件里调用，避免 SSR 水合不一致。 */
export function randomBannerGradient(
  random: () => number = Math.random,
): { color: string; color2: string } {
  const index = Math.min(
    RANDOM_GRADIENTS.length - 1,
    Math.max(0, Math.floor(random() * RANDOM_GRADIENTS.length)),
  );
  const [color, color2] = RANDOM_GRADIENTS[index];
  return { color, color2 };
}

/** 两个 0–100 的焦点百分比 → CSS `object-position`（老数据/异常值兜底居中）。 */
export function focalPosition(
  x: number | null | undefined,
  y: number | null | undefined,
): string {
  const clamp = (value: number | null | undefined): number =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(100, Math.max(0, Math.round(value)))
      : 50;
  return `${clamp(x)}% ${clamp(y)}%`;
}

export type CoverVisual =
  | { kind: "image"; src: string }
  | { kind: "fill"; background: string }
  | { kind: "none" };

/** 列表卡封面画什么：唯一判定，不能再让 bannerStyle 参与。 */
export function resolveCoverVisual(
  style: string | null | undefined,
  cover: string | null | undefined,
  color?: string | null,
  color2?: string | null,
): CoverVisual {
  const resolved: CoverStyle = isCoverStyle(style)
    ? style
    : cover
      ? "image"
      : "none";
  if (resolved === "image" && cover) {
    return { kind: "image", src: cover };
  }
  if (resolved === "solid" || resolved === "gradient") {
    return {
      kind: "fill",
      background: bannerFill(resolved, color, color2) ?? DEFAULT_SOLID,
    };
  }
  return { kind: "none" };
}

/** 兼容旧调用：返回封面形态。 */
export function postCoverKind(
  style: string | null | undefined,
  cover: string | null | undefined,
): CoverVisual["kind"] {
  return resolveCoverVisual(style, cover).kind;
}

export type BannerVisual =
  | { kind: "image"; src: string; source: "cover" | "image" }
  | { kind: "fill"; background: string }
  | { kind: "none" };

type BannerPost = {
  bannerStyle: string | null | undefined;
  bannerImage: string | null | undefined;
  bannerColor: string | null | undefined;
  bannerColor2: string | null | undefined;
  coverStyle: string | null | undefined;
  cover: string | null | undefined;
  coverColor: string | null | undefined;
  coverColor2: string | null | undefined;
};

/**
 * 详情 Banner 画什么。Banner 永不为空：
 * - 选了“与封面一致”且封面也是图/色块 → 直接复用；
 * - 删除 Banner 后 UI 会写入随机混色，因此命中 `gradient`；
 * - 旧数据/异常组合 → 回退到一张默认混色，避免出现纯白顶图。
 */
export function resolveBannerVisual(post: BannerPost): BannerVisual {
  const style: BannerStyle = isBannerStyle(post.bannerStyle)
    ? post.bannerStyle
    : post.cover
      ? "cover"
      : "gradient";

  if (style === "image") {
    if (post.bannerImage) {
      return { kind: "image", src: post.bannerImage, source: "image" };
    }
    return {
      kind: "fill",
      background: bannerFill("gradient", post.bannerColor, post.bannerColor2) ?? DEFAULT_SOLID,
    };
  }
  if (style === "solid" || style === "gradient") {
    return {
      kind: "fill",
      background: bannerFill(style, post.bannerColor, post.bannerColor2) ?? DEFAULT_SOLID,
    };
  }
  if (style === "cover") {
    const cover = resolveCoverVisual(
      post.coverStyle,
      post.cover,
      post.coverColor,
      post.coverColor2,
    );
    if (cover.kind === "image") {
      return { ...cover, source: "cover" };
    }
    if (cover.kind === "fill") {
      return cover;
    }
    return {
      kind: "fill",
      background: bannerFill("gradient", post.bannerColor, post.bannerColor2) ?? DEFAULT_SOLID,
    };
  }
  if (post.bannerImage) {
    return { kind: "image", src: post.bannerImage, source: "image" };
  }
  if (post.cover) {
    return { kind: "image", src: post.cover, source: "cover" };
  }
  return {
    kind: "fill",
    background: bannerFill("gradient", post.bannerColor, post.bannerColor2) ?? DEFAULT_SOLID,
  };
}
