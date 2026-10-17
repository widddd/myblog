/**
 * 相册详情页「一叠照片」的**几何事实**（无 react / DOM，可单测）。
 *
 * 引擎是 `components/album/PhotoPile.tsx`：卡片全部绝对定位，两个状态都用 `left` / `top`
 * 表达，差异交给 CSS 过渡补间（时长/缓动在 `albums.css` 的 `.pile*`）。组件只负责
 * 「量尺寸 → 问这里要几何 → 写进内联样式」，**所有算术只在本文件里有一份**。
 *
 * ## 两套版式（由视口方向决定，见 `PhotoPile` 的 `isVertical()`）
 *
 * ### 折叠态：两个方向**不一样**
 *
 * - **横屏 / 桌面（`fan: "x"`）**：同心叠放 + 逐层**往右**扇 22px + 逐层缩 2% + 正负交替转角，
 *   全部以牌堆中心为视觉中心 —— 与 `demo/album-page/pile.js` 的 `applyPile` 逐项一致，**别动**；
 * - **竖屏 / ≤720px（`fan: "y"`）**：**随手叠放**（`loosePile`）—— 每张保留原比例（按长边归一，
 *   不裁成方块）、随机倾角 + 随机横移 + 往下错一档，由照片 `seed` 派生（确定性，不是 Math.random）。
 *   大小**只用 `scale` 表达**：组件不写任何尺寸，ResizeObserver 不会被自己的写入再次触发（P-175）。
 *
 * ### 展开态
 *
 * - `fan: "x"` → 等高一行：每张按原始比例算宽、行比容器宽就横向滚动（`viewportWidth`）；
 * - `fan: "y"` → 一行一张：逐张累加行位，容器高度 = 各张高度之和 + `gap`（`viewportHeight`）。
 *
 * ### ⚠️ 铁律（别退回两定位边写法）
 *
 * 折叠态与竖排列态都必须写**显式像素宽**（`left: 0; right: auto; width: Npx`）：
 * 靠 `left/right` 撑出来的宽度计算值是 `auto`，而 `auto → 401px` **不可插值**，浏览器会直接
 * 跳到终值 —— 表现是「整叠先瞬移一下再滑动」（见 `demo/album-page/README.md` §三 与 P-160）。
 *
 * ### ⚠️ 视觉中心 = 布局盒中心
 *
 * 缩放/旋转都以中心为原点，所以层高用**自然高度**算，盒子中心一直等于视觉中心：
 * 横向叠放时 `top = (deckHeight - height) / 2`；竖屏叠放时 `top = 视觉中心 − height / 2`
 * （`translateX` 写在最前，只左右平移、不改变中心的纵坐标）。
 */

/** 竖屏叠放：每往下一层错开多少（与横向的 `peerX` 同一个量，方向朝下） */
export const VERTICAL_STEP_PX = 22;

/** 与 `demo/album-page` 的 `pile.js` DEFAULTS 逐项一致（改这里等于改版式，先看 demo）。 */
export const PILE_GEOMETRY_OPTIONS = {
  /** 展开后两张之间的距离（竖屏是行距、横屏是列距） */
  gap: 10,
  /** 折叠时每往后一层往右扇开多少像素（只旋转的话底下几张看不见，见 P-160） */
  peerX: 22,
  /** 折叠时每往后一层转多少度，正负交替 */
  rotStep: 1.5,
  /** 折叠时每往后一层缩多少 */
  depthScale: 0.02,
  deckMin: 180,
  deckMax: 440,
  /** 牌堆高度占视口高度的比例上限（手机上一张竖图别把整屏占满） */
  deckViewportRatio: 0.58,
  /** 横屏时牌堆左右最小边距（占比，另有 48px 下限）：这段距离就是「整叠向左移动」看得见的行程 */
  pileMarginRatio: 0.12,
  /** 横向展开：行高 = 视口宽 × 这个比例，夹在 rowMin~rowMax 之间 */
  rowRatio: 0.34,
  rowMin: 150,
  rowMax: 320,
  rowGap: 8,
} as const;

export type PhotoPileOptions = {
  [K in keyof typeof PILE_GEOMETRY_OPTIONS]: number;
} & {
  /** 竖屏折叠态每层的纵向错位 */
  peerY: number;
};

export const DEFAULT_PHOTO_PILE_OPTIONS: PhotoPileOptions = {
  ...PILE_GEOMETRY_OPTIONS,
  peerY: VERTICAL_STEP_PX,
};

/** 一张卡：折叠态量到的高度 + 原始宽高比（宽 / 高） */
export type PhotoPileCard = {
  /** 按容器宽铺满时的自然高度（`offsetHeight`，不含 transform） */
  height: number;
  aspect: number;
  /**
   * 竖屏叠放的稳定种子（照片 key）：每张照片"随手放"的倾角 / 横移 / 错位都由它派生 ——
   * **必须是照片自己的标识**（不是随机数）：同一张照片每次渲染 / 重排 / 换张都得到同一组值，
   * 否则刷新一次变一次、左右滑动换张时整叠乱跳。
   * 缺省时退回按位置取种子（退化输入也不能算出 NaN 或乱跳）。
   */
  seed?: string;
};

/**
 * 竖屏「随手叠放」的幅度（`loosePile`）。
 *
 * 上一版把转角压到 ±0.9°、横移 ±1.2%，还把每张裁成正方形 —— 结果是"整整齐齐的一列方块"。
 * 用户要的是**相片随意叠在一起**：每张保留原比例、明显的随机倾角与错位，最上面那张基本摆正。
 */
export const LOOSE_PILE = {
  /** 每张的长边 = 容器宽 × 这个比例（横图竖图看起来一样大，竖图不再比横图高一倍） */
  size: 0.8,
  /** 最上面那张的倾角上限（度，±）：看的就是它，只许轻微歪一点 */
  topTilt: 1.2,
  /** 底下各张的倾角范围（度）：至少歪 minTilt、最多 maxTilt，往哪边歪随机 */
  minTilt: 2,
  maxTilt: 7,
  /** 横向错位上限（容器宽的比例，±）：最上面那张只用三分之一 */
  shiftX: 0.06,
  /** 档距的随机抖动（档距的比例，±）：必须 < 0.5，保证深的那层一定在浅的那层下面 */
  jitterY: 0.35,
  /** 层数多时档距最多压到这么小（再小就看不出是几层） */
  minStep: 6,
  /** 整叠高度上限 = 视口高 × 这个比例（放不下就整体等比缩） */
  viewportRatio: 0.8,
  /** 容器四周给倾斜的边角与描边留的余量（px） */
  pad: 10,
} as const;

/** 稳定的 32 位哈希（同一串永远同一个值，不依赖 Math.random） */
function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 第 `slot` 次抽样的 [0,1) 伪随机（同一 seed + slot 恒等） */
function scatterUnit(seed: string, slot: number): number {
  const hashed = hashSeed(`${seed}#${slot}`);
  // 再混一次，免得相邻 slot 的高位相同导致图案规律
  return ((hashed ^ (hashed >>> 15)) >>> 0) / 4294967296;
}

/** 把 [0,1) 映射到 [−amount, +amount] */
function scatterSigned(seed: string, slot: number, amount: number): number {
  return (scatterUnit(seed, slot) * 2 - 1) * amount;
}

/**
 * 一张照片"随手放"的样子：倾角（度）、横移（px，夹边之前）、档距抖动（档距的比例）。
 *
 * 往哪边歪、往哪边偏**跟着照片走**（只由 seed 决定，与它排第几层无关）：左右滑动换张时，
 * 每张照片保持自己的姿态，只是被抽到最上面时摆正一点 —— 像真的从一叠照片里抽出一张。
 */
function looseOf(
  seed: string,
  depth: number,
  width: number,
): { rotate: number; shiftX: number; jitter: number } {
  const lean = scatterUnit(seed, 1) < 0.5 ? -1 : 1;
  const amount = scatterUnit(seed, 2);
  const rotate =
    depth === 0
      ? lean * amount * LOOSE_PILE.topTilt
      : lean * (LOOSE_PILE.minTilt + amount * (LOOSE_PILE.maxTilt - LOOSE_PILE.minTilt));
  const shiftX =
    scatterSigned(seed, 3, LOOSE_PILE.shiftX) * width * (depth === 0 ? 1 / 3 : 1);
  return { rotate, shiftX, jitter: scatterSigned(seed, 4, LOOSE_PILE.jitterY) };
}

export type PhotoPileCardStyle = {
  left: number;
  top: number;
  width: number;
  transform: string;
  zIndex: number;
};

export type PhotoPileLayout = {
  /** 折叠 = 堆叠方向；展开 = 展开方向（横向一行 / 纵向一列） */
  fan: "x" | "y";
  expanded: boolean;
  cards: PhotoPileCardStyle[];
  /** 视口要写的高度（px）—— 横向展开是行高，其余是内容高度 */
  viewportHeight: number;
  /** 横向展开时 track 的宽度（绝对定位的子元素不一定会撑出滚动范围） */
  trackWidth: number;
  /** 横向展开且这一行比容器宽 → 提示「滚轮左右翻阅」 */
  overflow: boolean;
};

export type PhotoPileInput = {
  cards: PhotoPileCard[];
  /** 视口宽（`viewport.clientWidth`） */
  width: number;
  /** 视口高（`window.innerHeight`），只用来给折叠态定高度上限 */
  viewportHeight: number;
  /** 第 0 张（最上面那张）是哪一张：左右滑动翻看会换 */
  active: number;
  collapsed: boolean;
  /** 竖屏 / ≤720px：折叠态随手叠放（往下错）、展开态一行一张 */
  vertical: boolean;
};

/** 退化输入一律按最小 1 张算：`NaN` / 0 / 负数都不能算出 NaN 几何。 */
function safeCount(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

function safeSize(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 角度 → 弧度（旋转都要用它折算包络） */
function radiansOf(rotate: number): number {
  return (rotate * Math.PI) / 180;
}

/** 折叠态整叠往右扇开的总宽度（`count - 1` 层，每层 `peerX`） */
function fanWidthOf(count: number, options: PhotoPileOptions): number {
  return Math.max(0, count - 1) * options.peerX;
}

/** 折叠态这一叠的层高：`height` 就是**量到的**卡片自然高度（组件不改尺寸，见文件头） */
function columnHeights(cards: PhotoPileCard[], options: PhotoPileOptions): number[] {
  return cards.map((card) => safeSize(card.height, options.deckMin));
}

/** 横屏折叠态：这一叠要多高（还要给「整叠向左滑」留出行程，见 `pileMarginRatio`）。 */
function collapsedDeck(
  cards: PhotoPileCard[],
  active: number,
  width: number,
  viewportHeight: number,
  options: PhotoPileOptions,
): { deckHeight: number; baseScale: number } {
  const heights = columnHeights(cards, options);
  const activeHeight = heights[active] ?? options.deckMin;
  const deckLimit = Math.max(
    options.deckMin,
    Math.min(options.deckMax, safeSize(viewportHeight, options.deckMax) * options.deckViewportRatio),
  );
  let deckHeight = Math.max(options.deckMin, Math.min(deckLimit, activeHeight));
  let baseScale = Math.min(
    1,
    deckHeight / activeHeight,
    Math.max(0.4, (width - fanWidthOf(heights.length, options)) / width),
  );
  // 横屏还要留出「整叠向左移动」的行程（竖屏不参与）
  const margin = Math.max(48, width * options.pileMarginRatio);
  const cap = Math.max(0.4, (width - fanWidthOf(heights.length, options) - 2 * margin) / width);
  if (cap < baseScale) {
    baseScale = cap;
    deckHeight = Math.round(activeHeight * baseScale);
  }
  return { deckHeight, baseScale };
}

/** 展开成一行：每张按原始比例算宽、等高、不裁图；行比容器宽就是横向滚动。 */
function expandedRow(
  cards: PhotoPileCard[],
  width: number,
  options: PhotoPileOptions,
): PhotoPileLayout {
  const rowHeight = Math.round(
    Math.max(options.rowMin, Math.min(options.rowMax, width * options.rowRatio)),
  );
  let left = 0;
  const styles = cards.map((card, index) => {
    const itemWidth = Math.round(rowHeight * safeSize(card.aspect, 1.5));
    const style: PhotoPileCardStyle = {
      left,
      top: 0,
      width: itemWidth,
      transform: "",
      zIndex: cards.length - index,
    };
    left += itemWidth + options.rowGap;
    return style;
  });
  const trackWidth = Math.max(0, left - options.rowGap);
  return {
    fan: "x",
    expanded: true,
    cards: styles,
    viewportHeight: rowHeight,
    trackWidth,
    overflow: trackWidth > width + 1,
  };
}

/** 展开成一列：一行一张，自上而下累加行位（竖屏一直是这样，没动）。 */
function expandedColumn(
  cards: PhotoPileCard[],
  width: number,
  options: PhotoPileOptions,
): PhotoPileLayout {
  let top = 0;
  const styles = cards.map((card, index) => {
    const style: PhotoPileCardStyle = {
      left: 0,
      top,
      // 显式像素宽：见文件头铁律（这里同时是横向展开的"补间起点"，不能是 auto）
      width,
      transform: "",
      zIndex: cards.length - index,
    };
    top += safeSize(card.height, options.deckMin) + options.gap;
    return style;
  });
  return {
    fan: "y",
    expanded: true,
    cards: styles,
    viewportHeight: Math.ceil(Math.max(0, top - options.gap)),
    trackWidth: 0,
    overflow: false,
  };
}

/**
 * 横屏折叠态：同心叠放 + 往右扇 + 正负交替转角（与 `demo/album-page` 的 `applyPile` 逐项一致）。
 * 竖屏折叠态是另一个函数（`loosePile`），两者不共用任何分支。
 */
function collapsedPile(
  cards: PhotoPileCard[],
  active: number,
  width: number,
  viewportHeight: number,
  options: PhotoPileOptions,
): PhotoPileLayout {
  const count = cards.length;
  const heights = columnHeights(cards, options);
  const { deckHeight, baseScale } = collapsedDeck(cards, active, width, viewportHeight, options);

  const fanWidth = (count - 1) * options.peerX;
  const styles = cards.map((_card, index) => {
    const depth = (index - active + count) % count;
    const scale = baseScale * (1 - depth * options.depthScale);
    const rotate = options.rotStep * depth * (depth % 2 === 0 ? 1 : -1);
    const dx = depth * options.peerX - fanWidth / 2;
    return {
      left: 0,
      top: (deckHeight - heights[index]) / 2,
      width,
      transform: `translateX(${dx.toFixed(2)}px) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
      zIndex: count - depth,
    };
  });
  return {
    fan: "x",
    expanded: false,
    cards: styles,
    viewportHeight: deckHeight,
    trackWidth: 0,
    overflow: false,
  };
}

/**
 * 竖屏折叠态：**随手叠放**的一叠照片（不是整齐的一列）。
 *
 * - 每张保留**原比例**，按长边归一（长边 = 容器宽 × `LOOSE_PILE.size`），横图竖图看起来一样大；
 *   大小只走 `transform: scale()`，布局盒仍是满宽自然高（组件不写尺寸，见文件头）；
 * - 每张往随机一边歪（底下各张 2°–7°，最上面那张 ≤1.2°）、随机横移，往后每层往下错一档
 *   （档距带 ±35% 抖动，但深的那层一定更低）—— 底下几张从下边与两侧露出来；
 * - 容器高按整叠**旋转后的真实包络** + 四周余量算；超过视口上限时先压档距、再整体等比缩。
 */
function loosePile(
  cards: PhotoPileCard[],
  active: number,
  width: number,
  viewportHeight: number,
  options: PhotoPileOptions,
): PhotoPileLayout {
  const count = cards.length;
  const heights = columnHeights(cards, options);
  const pad = LOOSE_PILE.pad;
  const layers = cards.map((card, index) => {
    const depth = (index - active + count) % count;
    const height = heights[index];
    const loose = looseOf(card.seed ?? `slot-${index}`, depth, width);
    // 长边归一：横图按宽、竖图按高缩到同一个长边；底下每层再小 2%（同横向），最小 0.5
    const scale =
      ((LOOSE_PILE.size * width) / Math.max(width, height)) *
      Math.max(0.5, 1 - depth * options.depthScale);
    const rad = radiansOf(loose.rotate);
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    return {
      depth,
      height,
      scale,
      loose,
      // 旋转后的半宽 / 半高（视觉盒的包络）
      halfW: (scale * (width * cos + height * sin)) / 2,
      halfH: (scale * (height * cos + width * sin)) / 2,
    };
  });
  const limit = Math.max(
    options.deckMin,
    safeSize(viewportHeight, options.deckMax / options.deckViewportRatio) *
      LOOSE_PILE.viewportRatio,
  );
  // 层数多时压档距：最高那张 + (n−1) 档放得下就不压
  const tallest = Math.max(...layers.map((layer) => 2 * layer.halfH));
  const step = Math.max(
    LOOSE_PILE.minStep,
    Math.min(options.peerY, (limit - 2 * pad - tallest) / Math.max(1, count - 1)),
  );
  // 视觉中心的纵坐标（以最上面那张为 0）：每层 +1 档，抖动只改档距、不改先后
  const centerOf = (depth: number, jitter: number) =>
    depth === 0 ? 0 : (depth + jitter) * step;
  let extentTop = Infinity;
  let extentBottom = -Infinity;
  for (const layer of layers) {
    const center = centerOf(layer.depth, layer.loose.jitter);
    extentTop = Math.min(extentTop, center - layer.halfH);
    extentBottom = Math.max(extentBottom, center + layer.halfH);
  }
  // 还放不下就整体等比缩（大小、档距、横移一起缩，叠法不变）
  const fit = Math.min(1, (limit - 2 * pad) / Math.max(1, extentBottom - extentTop));
  const styles = layers.map((layer) => {
    const halfW = layer.halfW * fit;
    const centerY = pad + (centerOf(layer.depth, layer.loose.jitter) - extentTop) * fit;
    // 横移夹在容器里：歪过去的角也不能被 overflow 裁掉
    const room = Math.max(0, width / 2 - pad - halfW);
    const shiftX = Math.max(-room, Math.min(room, layer.loose.shiftX * fit));
    return {
      left: 0,
      top: centerY - layer.height / 2,
      width,
      transform: `translateX(${shiftX.toFixed(2)}px) rotate(${layer.loose.rotate.toFixed(2)}deg) scale(${(layer.scale * fit).toFixed(4)})`,
      zIndex: count - layer.depth,
    };
  });
  return {
    fan: "y",
    expanded: false,
    cards: styles,
    viewportHeight: Math.ceil((extentBottom - extentTop) * fit + 2 * pad),
    trackWidth: 0,
    overflow: false,
  };
}

/** 量好之后要写的**全部**几何：每张的 left/top/width/transform/z、容器高、track 宽。 */
export function photoPileLayout(
  input: PhotoPileInput,
  options: PhotoPileOptions = DEFAULT_PHOTO_PILE_OPTIONS,
): PhotoPileLayout {
  const count = safeCount(input.cards.length);
  const cards = input.cards.slice(0, count);
  if (cards.length === 0) {
    return {
      fan: input.vertical ? "y" : "x",
      expanded: !input.collapsed,
      cards: [],
      viewportHeight: options.deckMin,
      trackWidth: 0,
      overflow: false,
    };
  }
  const width = Math.max(1, safeSize(input.width, 1));
  const active = ((input.active % count) + count) % count;
  if (input.collapsed) {
    return input.vertical
      ? loosePile(cards, active, width, input.viewportHeight, options)
      : collapsedPile(cards, active, width, input.viewportHeight, options);
  }
  return input.vertical
    ? expandedColumn(cards, width, options)
    : expandedRow(cards, width, options);
}
