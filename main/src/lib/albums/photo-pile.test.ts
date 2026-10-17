import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PHOTO_PILE_OPTIONS,
  LOOSE_PILE,
  PILE_GEOMETRY_OPTIONS,
  VERTICAL_STEP_PX,
  photoPileLayout,
  type PhotoPileCard,
  type PhotoPileLayout,
} from "./photo-pile";

/**
 * 相册详情「一叠照片」的几何：引擎是 `components/album/PhotoPile.tsx`（只负责量与写样式）。
 *
 * 不变量（改 photo-pile.ts / PhotoPile.tsx 前先看那边的文件头）：
 * 1. **竖屏折叠态 = 随手叠放**（用户口径：「相片随意叠放在一起」，整齐一列已驳回）：
 *    每张保留原比例（长边归一，不裁方块）、明显的随机倾角与横移、往下错一档；
 * 2. 随机量由照片 key 派生（确定性）：同一组照片永远叠成同一个样子，换张时每张保持自己的歪法；
 * 3. 横屏折叠态与 demo 逐项一致：同心叠放 + 往右扇 + 正负交替转角；
 * 4. 两种方向都写**显式像素宽**（`auto` 不可插值，见 P-160）；
 * 5. 退化输入（0 张 / NaN / 越界 active / 0 宽）不产生 NaN 或负宽。
 */

/** 三横两竖的混合比例，专门用来逼出"按原始比例算宽"的分支 */
const CARDS: PhotoPileCard[] = [
  { height: 240, aspect: 3 / 2, seed: "a" },
  { height: 480, aspect: 2 / 3, seed: "b" },
  { height: 300, aspect: 5 / 4, seed: "c" },
];

const WIDE = { width: 900, viewportHeight: 900 };

/** 竖屏夹具：手机（366 宽）上的真实比例 —— 横图 3:2 自然高 244、竖图 853×1280 自然高 549 */
const PHONE = { width: 366, viewportHeight: 844 };
const MIXED: PhotoPileCard[] = [
  { height: 244, aspect: 3 / 2, seed: "photo-a" },
  { height: 244, aspect: 3 / 2, seed: "photo-b" },
  { height: 549, aspect: 853 / 1280, seed: "photo-c" },
  { height: 244, aspect: 3 / 2, seed: "photo-d" },
  { height: 549, aspect: 853 / 1280, seed: "photo-e" },
];

/**
 * 卡片在页面上的**视觉盒**：布局盒（满宽 × 自然高）以中心为原点旋转缩放，再按 translateX 平移。
 * `height` 传自然高（`offsetHeight`）—— 组件不改尺寸，大小只在 transform 里。
 */
function visual(
  card: { left: number; top: number; transform: string },
  height: number,
  width = WIDE.width,
) {
  const shiftX = Number(card.transform.match(/translateX\((-?[\d.]+)px\)/)?.[1] ?? 0);
  const rotate = Number(card.transform.match(/rotate\((-?[\d.]+)deg\)/)?.[1] ?? 0);
  const scale = Number(card.transform.match(/scale\(([\d.]+)\)/)?.[1] ?? 1);
  const rad = (rotate * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (scale * (width * cos + height * sin)) / 2;
  const halfH = (scale * (height * cos + width * sin)) / 2;
  const centerX = card.left + width / 2 + shiftX;
  const centerY = card.top + height / 2;
  return {
    shiftX,
    rotate,
    scale,
    centerY,
    left: centerX - halfW,
    right: centerX + halfW,
    top: centerY - halfH,
    bottom: centerY + halfH,
  };
}

/** 档位（0 = 最上面那张）：由 z 反推，`z = count − depth` */
function depthOf(layout: PhotoPileLayout, index: number): number {
  return layout.cards.length - Number(layout.cards[index].zIndex);
}

/**
 * 竖屏折叠态不变量（随手叠放）：
 * - 档位越深越低（视觉中心严格递增）—— 叠的先后不乱，档位一个不多一个不少；
 * - 每张旋转后的视觉盒都在容器里（不被 overflow 裁掉）；
 * - 最上面那张基本摆正（≤ topTilt），底下各张明显歪着（minTilt ~ maxTilt）。
 * 档位由 z 反推，不按视觉位置排序（视觉位置正是被测对象，拿它推档位是循环论证）。
 */
function assertLoosePile(layout: PhotoPileLayout, cards: PhotoPileCard[], width: number) {
  assert.equal(layout.fan, "y");
  assert.equal(layout.expanded, false);
  const boxes = layout.cards.map((style, index) => {
    assert.equal(style.left, 0, "布局盒不偏移（错位只在 transform 里）");
    assert.ok(Math.abs(style.width - width) < 0.01, `布局盒满宽（期望 ${width}，实际 ${style.width}）`);
    return { depth: depthOf(layout, index), ...visual(style, cards[index].height, width) };
  });
  const byDepth = [...boxes].sort((a, b) => a.depth - b.depth);
  byDepth.forEach((box, depth) => {
    assert.equal(box.depth, depth, "档位一个不多一个不少");
    if (depth > 0) {
      const above = byDepth[depth - 1].centerY;
      assert.ok(box.centerY > above, `第 ${depth} 层（中心 ${box.centerY}）应在上一层（${above}）下面`);
    }
    const tilt = Math.abs(box.rotate);
    if (depth === 0) {
      assert.ok(tilt <= LOOSE_PILE.topTilt + 0.01, `最上面那张只许轻微歪（${box.rotate}°）`);
    } else {
      assert.ok(
        tilt >= LOOSE_PILE.minTilt - 0.01 && tilt <= LOOSE_PILE.maxTilt + 0.01,
        `第 ${depth} 层倾角 ${box.rotate}° 应在 ${LOOSE_PILE.minTilt}°–${LOOSE_PILE.maxTilt}°`,
      );
    }
    assert.ok(
      box.left >= -0.5 && box.right <= width + 0.5,
      `第 ${depth} 层左右探出容器（${box.left} ~ ${box.right}）`,
    );
    assert.ok(
      box.top >= -0.5 && box.bottom <= layout.viewportHeight + 0.5,
      `第 ${depth} 层（${box.top} ~ ${box.bottom}）超出容器 0 ~ ${layout.viewportHeight}`,
    );
  });
}

test("竖屏折叠态：随手叠放 —— 每张都歪、歪法各不相同、左右错开，不是整齐一列", () => {
  const layout = photoPileLayout({
    cards: MIXED,
    ...PHONE,
    active: 0,
    collapsed: true,
    vertical: true,
  });
  assert.equal(layout.trackWidth, 0);
  assertLoosePile(layout, MIXED, PHONE.width);

  const boxes = layout.cards.map((style, index) =>
    visual(style, MIXED[index].height, PHONE.width),
  );
  const tilts = boxes.map((box) => box.rotate);
  assert.equal(
    new Set(tilts.map((tilt) => tilt.toFixed(2))).size,
    tilts.length,
    `倾角不该有两张一样：${tilts.join(" / ")}`,
  );
  assert.ok(
    tilts.some((tilt) => tilt > 0) && tilts.some((tilt) => tilt < 0),
    `往两边歪都有：${tilts.join(" / ")}`,
  );
  assert.ok(
    boxes.some((box) => Math.abs(box.shiftX) > PHONE.width * 0.02),
    `至少有一张明显左右错开：${boxes.map((box) => box.shiftX).join(" / ")}`,
  );
});

test("竖屏叠放：每张保留原比例、按长边归一（竖图不裁成方块，也不比横图高一倍）", () => {
  // 上一版把每张裁成正方形（aspect-ratio: 1 + cover）：横图被裁掉两边、整叠变成一列方块
  const layout = photoPileLayout({
    cards: MIXED,
    ...PHONE,
    active: 0,
    collapsed: true,
    vertical: true,
  });
  // 长边 = 视觉缩放 ÷ 逐层缩的系数 × max(宽, 自然高)：每张都一样（放不下时整体再缩）
  const longSides = layout.cards.map((style, index) => {
    const { scale } = visual(style, MIXED[index].height, PHONE.width);
    const depthFactor = Math.max(
      0.5,
      1 - depthOf(layout, index) * PILE_GEOMETRY_OPTIONS.depthScale,
    );
    return (scale / depthFactor) * Math.max(PHONE.width, MIXED[index].height);
  });
  const target = LOOSE_PILE.size * PHONE.width;
  longSides.forEach((side) => {
    assert.ok(Math.abs(side - longSides[0]) < 0.5, `长边应一致：${longSides.join(" / ")}`);
    assert.ok(side <= target + 0.5, `长边 ${side} 不超过 ${target}`);
  });
  // 布局盒仍是满宽自然高：组件不写尺寸，比例由图片自己决定
  assert.ok(layout.cards.every((style) => style.width === PHONE.width));
});

test("竖屏：**横图也必须竖着堆、竖着展开**（用户口径：竖屏不看照片方向）", () => {
  // 用户明确驳回"看到横图就改成横向版式"那一版：竖屏手机上不管这一叠是横图、竖图还是混排
  //（也不管它在哪一卷、乃至"不属于任何卷"那一组），都必须竖着堆、竖着展开。
  const landscape: PhotoPileCard[] = [
    { height: 244, aspect: 3 / 2, seed: "l1" },
    { height: 240, aspect: 1280 / 853, seed: "l2" },
  ];
  const mixed: PhotoPileCard[] = [
    { height: 244, aspect: 3 / 2, seed: "m1" },
    { height: 549, aspect: 853 / 1280, seed: "m2" },
  ];
  for (const cards of [landscape, mixed]) {
    const collapsed = photoPileLayout({
      cards,
      width: 366,
      viewportHeight: 900,
      active: 0,
      collapsed: true,
      vertical: true,
    });
    assert.equal(collapsed.fan, "y", "竖屏折叠态必须是纵向（往下叠）");
    assertLoosePile(collapsed, cards, 366);

    const expanded = photoPileLayout({
      cards,
      width: 366,
      viewportHeight: 900,
      active: 0,
      collapsed: false,
      vertical: true,
    });
    assert.equal(expanded.fan, "y", "竖屏展开态必须是纵向（一行一张往下）");
    assert.equal(expanded.trackWidth, 0, "竖向展开不该有横向滚动");
    assert.ok(
      expanded.cards.every((style, index) =>
        index === 0 ? style.top === 0 : style.top > expanded.cards[index - 1].top,
      ),
      "每张都在上一张下面",
    );
    assert.ok(
      expanded.cards.every((style) => style.left === 0 && style.width > 0),
      "每张满宽、左缘对齐",
    );
  }
});

test("竖屏堆叠：容器按整叠真实下缘定高、装得下最深那层（横图底下压竖图不被裁）", () => {
  // 实测过的坑：当前那张是横图（244）、底下压一张竖图（549）时，按"当前那张"定高 →
  // 容器只有 266，而最深一张的视觉下缘在 571，被 overflow: hidden 切掉一大半
  const mixed: PhotoPileCard[] = [
    { height: 244, aspect: 3 / 2, seed: "x1" },
    { height: 549, aspect: 853 / 1280, seed: "x2" },
  ];
  for (const active of [0, 1]) {
    const layout = photoPileLayout({
      cards: mixed,
      width: 366,
      viewportHeight: 900,
      active,
      collapsed: true,
      vertical: true,
    });
    const deepest = Math.max(
      ...layout.cards.map(
        (style, index) => visual(style, mixed[index].height, 366).bottom,
      ),
    );
    assert.ok(
      layout.viewportHeight + 0.4 >= deepest,
      `active=${active}：容器 ${layout.viewportHeight} 装不下最深那层 ${deepest}`,
    );
    const depths = layout.cards.map((style) => Number(style.zIndex));
    assert.equal(depths.indexOf(Math.max(...depths)), active, "当前那张在最上面");
    assertLoosePile(layout, mixed, 366);
  }
});

test("竖屏叠放：放不下才整体等比缩（容器不超视口上限，且每张都装得下）", () => {
  // 视口 300 高 → 上限 max(deckMin 180, 300 × 0.8) = 240；两张竖图 + 一档错位放不下 → 必须整体缩
  const cards: PhotoPileCard[] = [
    { height: 480, aspect: 2 / 3, seed: "tall-1" },
    { height: 480, aspect: 2 / 3, seed: "tall-2" },
  ];
  const layout = photoPileLayout({
    cards,
    width: 320,
    viewportHeight: 300,
    active: 0,
    collapsed: true,
    vertical: true,
  });
  assert.ok(layout.viewportHeight <= 241, `容器 ${layout.viewportHeight} 不该超视口上限 240`);
  assertLoosePile(layout, cards, 320);
  // 不缩时最上面那张的长边是 320 × size = 256，比上限去掉余量（220）还高 → 一定缩过
  const top = visual(layout.cards[0], cards[0].height, 320);
  assert.ok(top.scale * 480 < LOOSE_PILE.size * 320, `应整体缩小：长边 ${top.scale * 480}`);
});

test("竖屏叠放：层数多时档距自动压小（不小于 minStep），整叠仍在视口上限内", () => {
  const cards = Array.from({ length: 30 }, (_value, index) => ({
    height: 244,
    aspect: 3 / 2,
    seed: `n${index}`,
  }));
  const layout = photoPileLayout({
    cards,
    ...PHONE,
    active: 0,
    collapsed: true,
    vertical: true,
  });
  assertLoosePile(layout, cards, PHONE.width);
  const limit = PHONE.viewportHeight * LOOSE_PILE.viewportRatio;
  assert.ok(layout.viewportHeight <= limit + 1, `容器 ${layout.viewportHeight} 超了上限 ${limit}`);
  // 平均档距 = 首末两层中心之差 ÷ 档数（抖动让单档忽大忽小，平均值才是档距）
  const centers = layout.cards
    .map((style, index) => ({
      depth: depthOf(layout, index),
      center: visual(style, cards[index].height, PHONE.width).centerY,
    }))
    .sort((a, b) => a.depth - b.depth)
    .map((entry) => entry.center);
  const average = (centers[centers.length - 1] - centers[0]) / (centers.length - 1);
  assert.ok(
    average >= LOOSE_PILE.minStep * 0.5 && average < VERTICAL_STEP_PX,
    `平均档距 ${average} 应被压小、但不挤成一条线`,
  );
});

test("竖屏叠放：确定性 + 换张时每张保持自己的歪法（只换层的顺序，不减层）", () => {
  const base = { cards: MIXED, ...PHONE, collapsed: true, vertical: true };
  const first = photoPileLayout({ ...base, active: 0 });
  // 同一组照片永远叠成同一个样子（不是 Math.random：刷新不变、SSR / 客户端一致）
  assert.deepEqual(photoPileLayout({ ...base, active: 0 }), first);

  const second = photoPileLayout({ ...base, active: 1 });
  assert.equal(second.cards.length, first.cards.length);
  assertLoosePile(second, MIXED, PHONE.width);
  assert.equal(second.cards[1].zIndex, MIXED.length, "翻上来的那张在最上面");
  // 往哪边歪跟着照片走：被抽到最上面只是摆正一点，方向不变
  const leanOf = (layout: PhotoPileLayout, index: number) =>
    Math.sign(visual(layout.cards[index], MIXED[index].height, PHONE.width).rotate);
  MIXED.forEach((_card, index) => {
    const before = leanOf(first, index);
    const after = leanOf(second, index);
    assert.ok(before === 0 || after === 0 || before === after, `第 ${index} 张换张后歪的方向变了`);
  });
});

test("横屏折叠态：同心叠放一个字没动（往右扇 peerX、逐层缩、正负交替转角）", () => {
  const layout = photoPileLayout({
    cards: CARDS,
    ...WIDE,
    active: 0,
    collapsed: true,
    vertical: false,
  });

  assert.equal(layout.fan, "x");
  const opt = PILE_GEOMETRY_OPTIONS;
  const fanWidth = (CARDS.length - 1) * opt.peerX;
  // 折叠态的基础缩放按 demo/album-page/pile.js 的 applyPile 手算一遍（不抄组件里的实现）
  const deckLimit = Math.max(
    opt.deckMin,
    Math.min(opt.deckMax, WIDE.viewportHeight * opt.deckViewportRatio),
  );
  const margin = Math.max(48, WIDE.width * opt.pileMarginRatio);
  const baseScale = Math.min(
    1,
    Math.max(opt.deckMin, Math.min(deckLimit, CARDS[0].height)) / CARDS[0].height,
    Math.max(0.4, (WIDE.width - fanWidth - 2 * margin) / WIDE.width),
  );
  const deckHeight = Math.round(CARDS[0].height * baseScale);
  const expectedTransform = (depth: number) =>
    `translateX(${(depth * opt.peerX - fanWidth / 2).toFixed(2)}px) ` +
    `rotate(${(opt.rotStep * depth * (depth % 2 === 0 ? 1 : -1)).toFixed(2)}deg) ` +
    `scale(${(baseScale * (1 - depth * opt.depthScale)).toFixed(4)})`;

  layout.cards.forEach((style, depth) => {
    assert.equal(style.left, 0);
    assert.equal(style.width, WIDE.width);
    assert.equal(style.transform, expectedTransform(depth), `第 ${depth} 层`);
    assert.equal(style.top, (deckHeight - CARDS[depth].height) / 2, "视觉中心对齐");
  });
  assert.equal(layout.viewportHeight, deckHeight);
  assert.match(
    layout.cards[0].transform,
    new RegExp(`^translateX\\(-${(fanWidth / 2).toFixed(2)}px\\)`),
  );
  assert.equal(layout.viewportHeight, 171, "240 × 0.7111 收整");
  assert.ok(margin > 48, "900px 视口下走比例（12%），不是 48px 下限");
});

test("展开：竖屏一行一张累加行位；横屏等高一行（宽度按原始比例）", () => {
  const column = photoPileLayout({
    cards: CARDS,
    ...WIDE,
    active: 0,
    collapsed: false,
    vertical: true,
  });
  assert.equal(column.fan, "y");
  assert.equal(column.cards[0].top, 0);
  assert.equal(column.cards[1].top, CARDS[0].height + PILE_GEOMETRY_OPTIONS.gap);
  assert.equal(
    column.cards[2].top,
    CARDS[0].height + CARDS[1].height + PILE_GEOMETRY_OPTIONS.gap * 2,
  );
  assert.deepEqual(
    column.cards.map((style) => style.width),
    CARDS.map(() => WIDE.width),
  );
  assert.equal(column.trackWidth, 0);

  const row = photoPileLayout({
    cards: CARDS,
    ...WIDE,
    active: 0,
    collapsed: false,
    vertical: false,
  });
  assert.equal(row.fan, "x");
  const rowHeight = Math.round(
    Math.max(
      PILE_GEOMETRY_OPTIONS.rowMin,
      Math.min(PILE_GEOMETRY_OPTIONS.rowMax, WIDE.width * PILE_GEOMETRY_OPTIONS.rowRatio),
    ),
  );
  assert.equal(row.viewportHeight, rowHeight);
  assert.deepEqual(
    row.cards.map((style) => style.width),
    CARDS.map((card) => Math.round(rowHeight * card.aspect)),
    "横向展开：每张按原始比例定宽，页面一行铺开",
  );
  row.cards.forEach((style) => assert.equal(style.top, 0));
  // 横向滚动的宽度要显式给 track（绝对定位的子元素不一定撑出滚动范围）
  const expectedWidth =
    row.cards.reduce((total, style) => total + style.width, 0) +
    PILE_GEOMETRY_OPTIONS.rowGap * (CARDS.length - 1);
  assert.equal(row.trackWidth, expectedWidth);
  assert.equal(row.overflow, expectedWidth > WIDE.width + 1);
});

test("两种折叠态都写显式像素宽与像素 top（补间起点不能是 auto，见 P-160）", () => {
  for (const vertical of [true, false]) {
    for (const collapsed of [true, false]) {
      const layout = photoPileLayout({
        cards: CARDS,
        ...WIDE,
        active: 0,
        collapsed,
        vertical,
      });
      for (const style of layout.cards) {
        assert.ok(Number.isFinite(style.left) && Number.isFinite(style.top), "位置必须是数字");
        assert.ok(style.width > 0, "宽度必须 > 0（否则图层静默消失）");
        assert.ok(Number.isFinite(layout.viewportHeight) && layout.viewportHeight > 0);
      }
    }
  }
});

test("退化输入：0 张 / NaN 高度 / 越界 active / 0 宽都不出 NaN", () => {
  const empty = photoPileLayout({
    cards: [],
    ...WIDE,
    active: 0,
    collapsed: true,
    vertical: true,
  });
  assert.deepEqual(empty.cards, []);
  assert.ok(Number.isFinite(empty.viewportHeight));

  const broken = photoPileLayout({
    cards: [
      { height: Number.NaN, aspect: Number.NaN, seed: "n1" },
      { height: 0, aspect: 0, seed: "n2" },
      { height: 300, aspect: 5 / 4, seed: "n3" },
    ],
    width: 0,
    viewportHeight: 0,
    active: 7,
    collapsed: true,
    vertical: true,
  });
  for (const style of broken.cards) {
    assert.ok(Number.isFinite(style.left) && Number.isFinite(style.top) && style.width > 0);
  }
  assert.ok(Number.isFinite(broken.viewportHeight) && broken.viewportHeight > 0);

  // active 越界要归一（负索引也能落回 0..n-1），不能算出越界的 depth
  const negative = photoPileLayout({
    cards: CARDS,
    ...WIDE,
    active: -1,
    collapsed: true,
    vertical: true,
  });
  const order = [2, 0, 1]; // active = -1 → 归一成第 2 张在最上面
  order.forEach((cardIndex, depth) => {
    assert.equal(depthOf(negative, cardIndex), depth, `第 ${cardIndex} 张应在第 ${depth} 层`);
  });
  assertLoosePile(negative, CARDS, WIDE.width);
});

test("默认参数与 demo/album-page 的 pile.js DEFAULTS 逐项一致（改版式先看 demo）", () => {
  assert.equal(DEFAULT_PHOTO_PILE_OPTIONS.peerY, VERTICAL_STEP_PX);
  assert.equal(PILE_GEOMETRY_OPTIONS.peerX, 22);
  assert.equal(PILE_GEOMETRY_OPTIONS.rotStep, 1.5);
  assert.equal(PILE_GEOMETRY_OPTIONS.depthScale, 0.02);
  assert.equal(PILE_GEOMETRY_OPTIONS.deckViewportRatio, 0.58);
  assert.equal(PILE_GEOMETRY_OPTIONS.rowRatio, 0.34);
  const { peerY, ...rest } = DEFAULT_PHOTO_PILE_OPTIONS;
  assert.ok(Number.isFinite(peerY));
  assert.deepEqual(rest, { ...PILE_GEOMETRY_OPTIONS });
  // 竖屏叠放：档距抖动必须 < 半档，否则深的那层可能跑到浅的那层上面
  assert.ok(LOOSE_PILE.jitterY < 0.5);
  assert.ok(LOOSE_PILE.minTilt > LOOSE_PILE.topTilt && LOOSE_PILE.maxTilt > LOOSE_PILE.minTilt);
});
