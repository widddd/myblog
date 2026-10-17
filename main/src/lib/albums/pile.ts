/**
 * 相册封面「一叠照片」的**几何事实**（无 react / DOM，可单测）。
 *
 * 同一个动作有两处调用：
 * - `/albums` 列表卡（`components/album/AlbumCard.tsx`）：21:9 的宽画框，整叠左缘贴齐、
 *   约 1s 后各张依次向右抽出（`shrink = 1`：各张等宽，铺开后正好填满画框）；
 * - 首页「相册卡片」模块（`components/home/modules/AlbumCardsModule.tsx`）：同一个动作的
 *   **小号版本**，后面几张按 `shrink = 0.86` 一起收窄收矮（卡片窄，几张等宽会显得太挤）。
 *
 * 抽出的比例与角度必须一致（用户在两个地方看到的是同一个动作），所以只在这里写一遍；
 * **执行**也只写一遍（`use-pile-spread.ts`，见下）。
 *
 * ## 模型（改这个文件前先读）
 *
 * 设 `n` 张、`step = 100 / (n * 1.55)`（横向步长）、`shrink ≤ 1`：
 * - 第 0 张：`left = 0`、`width = pileStackWidth()`（**整叠那一张**）、不倾斜、不延迟；
 * - 第 i 张：`left = i * step`（左缘逐张右移）、`width = 整叠宽 × shrink^i`。
 *
 * ### ⚠️ 整叠宽度为什么**必须小于 100%**
 *
 * 叠放态是所有张压在**同一个左缘**、第一张在最上面（`z-index = n - i`）—— 所以"看得见的
 * 那张照片"的宽度就是第 0 张的宽度。它要是铺满整格（100%），后面几张永远被它整张盖住，
 * **抽出就是看不见的动作**：2026-10-05 逐帧实测，四张等宽 + 第 0 张满宽时，抽出的那 1s 里
 * 卡片区域一个像素都没变（t=1.0s / 1.25s / 2.6s 三张截图完全一致）。
 *
 * `pileStackWidth()` = `(100 - step × (n-1)) ÷ shrink^(n-1)`：
 * 铺开后**最后一张的右缘正好落在 100%**，左边那一格是整叠、右边那一格就是抽出的行程。
 * `shrink = 1` 时所有张等宽（整叠 = `100 - step × (n-1)`）；`shrink < 1` 时后面几张更窄，
 * 所以整叠能更宽一点（同一段行程要装下更窄的几张）—— 首页小卡片因此能保住一大张封面。
 *
 * ### ⚠️ `step` 只作用于**位置**
 *
 * 宽度不是"边抽边减"（历史写法 `width = 100 - step × i` 会让每张宽度都不同，首页 211 宽的
 * 卡里第 0 张只剩 109 宽，整叠像块小邮票）；而且**尺寸从头到尾不变**是"第一张纹丝不动"
 * 的硬前提。要改整叠大小，只动 `shrink`。
 *
 * 高度由**容器的宽高比**决定（CSS `--pile-ar`），不在这个文件里算。
 */

/** 整叠停住多久才开始抽（1s 的"这是几张照片"的停顿） */
export const PILE_HOLD_MS = 1000;

/** 每张之间的错峰 */
export const PILE_STAGGER_MS = 70;

/** 抽出终态的时长（只过渡 `left` / `transform`，尺寸从头到尾不变） */
export const PILE_SPREAD_MS = 420;

export type PileLayer = {
  /** 抽出后的横向位置（相对容器宽度的百分比） */
  left: number;
  /** 抽出后的宽度（相对容器宽度的百分比） */
  width: number;
  /** 小幅倾斜：正负交替，越靠后越明显 */
  rotate: number;
  /** 参与过渡的延迟（毫秒） */
  delayMs: number;
};

/** 第 `visible` 张时"露出一条"的步长。`visible` 为 0 / 负数时按 1 张算。 */
export function pileStep(visible: number): number {
  return 100 / Math.max(visible, 1) / 1.55;
}

/** 一叠最多摆几张（取数层的上限，这里只用来收住退化输入）。 */
export const PILE_MAX = 24;

/** 把"外面传进来的张数"收成一个能算的整数：至少 1 张、至多 `PILE_MAX` 张。 */
export function pileCount(visible: number): number {
  if (!Number.isFinite(visible)) {
    return 1;
  }
  return Math.min(Math.max(Math.floor(visible), 1), PILE_MAX);
}

/** `shrink` 收进 (0, 1]：0 会让整叠宽度除零，> 1 会让后面几张比整叠还宽。 */
function clampShrink(shrink: number): number {
  if (!Number.isFinite(shrink)) {
    return 1;
  }
  return Math.min(Math.max(shrink, 0.05), 1);
}

/**
 * 整叠（第 0 张）的宽度占比：铺开后最后一张的右缘正好落在 100%。
 *
 * 见文件头 —— 这个值**必须小于 100%**（`n ≥ 2` 时），否则第一张会把后面几张全盖住。
 */
export function pileStackWidth(visible: number, shrink: number): number {
  const count = pileCount(visible);
  const fan = pileStep(count) * (count - 1);
  const tail = clampShrink(shrink) ** (count - 1);
  return Math.min(100, (100 - fan) / tail);
}

/**
 * 第 `index` 张铺开后的位置。
 *
 * 越界的 `index` 会被收进最后一层（负数宽度会让声明非法、图层静默消失）。
 */
export function pileLayer(
  index: number,
  visible: number,
  shrink: number,
  staggerMs: number,
): PileLayer {
  const count = pileCount(visible);
  const layer = Math.min(Math.max(index, 0), count - 1);
  const step = pileStep(count);
  return {
    left: layer * step,
    // 宽度 = 整叠宽 × `shrink^layer`：第 0 张就是整叠那一张（**小于画框宽度**，见文件头），
    // 后面几张按等比收窄。别退回"宽度里减 step × i"的写法 —— 那会让每张宽度都不一样，
    // 而"尺寸从头到尾不变"是"第一张全程不移动"的前提。
    width: pileStackWidth(count, shrink) * clampShrink(shrink) ** layer,
    rotate: layer === 0 ? 0 : 1.1 * layer * (layer % 2 === 0 ? 1 : -1),
    delayMs: layer * staggerMs,
  };
}

/**
 * 叠放态（**首帧**）的几何：每一张都相同 —— 同一左缘、不倾斜、不延迟。
 *
 * 首帧必须是这个（而不是抽出后的位置）：先铺开、再回头补叠放态，就是"一进页面先看到
 * 展开的样子，然后跳一下"（见 docs/pitfalls.md P-160）。
 */
export const PILE_STACK_FRAME = Object.freeze({ left: 0, rotate: 0 });

/**
 * 一次抽出动作的**全部事实**：首帧（叠放态）、终帧（抽出态）、层次、错峰。
 *
 * 组件渲染首帧、执行器写终帧、单测断言"第一张不动 / 后面按顺序到位"—— 三方吃的是同一份，
 * 所以不存在"两套互相漂移的动画"（这是 2026-10-05 那次修复的核心要求）。
 */
export type PileSpread = {
  index: number;
  /** 首帧：叠放态（所有张同一个左缘、不倾斜） */
  from: { left: number; rotate: number };
  /** 终帧：抽出后的几何 */
  to: PileLayer;
  /** 第 0 张在最上面（数字越大越靠前） */
  zIndex: number;
};

/** 把这一叠算成 `n` 步：渲染（首帧样式）与执行（终帧过渡）都只用它。 */
export function pileSpread(
  visible: number,
  shrink: number,
  staggerMs: number = PILE_STAGGER_MS,
): PileSpread[] {
  const count = pileCount(visible);
  return Array.from({ length: count }, (_, index) => ({
    index,
    from: PILE_STACK_FRAME,
    to: pileLayer(index, count, shrink, staggerMs),
    zIndex: count - index,
  }));
}
