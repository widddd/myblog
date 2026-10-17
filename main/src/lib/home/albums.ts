/**
 * 首页相册模块的纯逻辑（无 react / DOM / prisma，可单测）。
 * 与 `lib/home/chips.ts`（欢迎卡泡泡）同一角色：常量与夹取规则只写一处，
 * 组件与后台表单都从这儿取。
 */

/** 滚动一轮的秒数区间：越小越快。默认 60s（"缓慢滚动"）。 */
export const HOME_ALBUM_SPEED_MIN = 20;
export const HOME_ALBUM_SPEED_MAX = 180;
export const HOME_ALBUM_SPEED_DEFAULT = 60;

/** 一次最多展示几张（与 `lib/albums/query.ts` 的取数上限对齐）。 */
export const HOME_ALBUM_LIMIT_MIN = 6;
export const HOME_ALBUM_LIMIT_MAX = 24;
export const HOME_ALBUM_LIMIT_DEFAULT = 12;

/**
 * 「相册卡片」模块（`album-cards`）：一屏摆得下几本相册。
 *
 * 上限比滚动条那版小得多 —— 这里是**一张一张摆出来的卡**，不是无限滚动的图流，
 * 8 本已经是半屏宽格子里能看住的量（再多就不是「一眼看完」而是列表了）。
 */
export const HOME_ALBUM_CARD_LIMIT_MIN = 2;
export const HOME_ALBUM_CARD_LIMIT_MAX = 8;
export const HOME_ALBUM_CARD_LIMIT_DEFAULT = 4;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

/** 脏值（缺失 / 非数字 / 越界）一律夹回区间，绝不把 0 或负数写成动画时长。 */
export function normalizeAlbumSpeed(value: unknown): number {
  return clampInt(value, HOME_ALBUM_SPEED_MIN, HOME_ALBUM_SPEED_MAX, HOME_ALBUM_SPEED_DEFAULT);
}

export function normalizeAlbumLimit(value: unknown): number {
  return clampInt(value, HOME_ALBUM_LIMIT_MIN, HOME_ALBUM_LIMIT_MAX, HOME_ALBUM_LIMIT_DEFAULT);
}

/** 「相册卡片」模块的展示本数：同样夹回区间，0 / 负数 / 脏值都回落到默认。 */
export function normalizeAlbumCardLimit(value: unknown): number {
  return clampInt(
    value,
    HOME_ALBUM_CARD_LIMIT_MIN,
    HOME_ALBUM_CARD_LIMIT_MAX,
    HOME_ALBUM_CARD_LIMIT_DEFAULT,
  );
}

/**
 * 多行输入框里的相册地址名：去空白、丢掉重复与空行。
 * 空数组 = **不限制**（取全部启用相册），这是模块的默认行为。
 */
export function parseAlbumSlugField(raw: string): string[] {
  const seen = new Set<string>();
  for (const line of raw.split("\n")) {
    const value = line.trim().slice(0, 60);
    if (value) {
      seen.add(value);
    }
  }
  return [...seen].slice(0, 20);
}
