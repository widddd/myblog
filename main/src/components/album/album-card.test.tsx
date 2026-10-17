import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AlbumCard } from "@/components/album/AlbumCard";
import { pileSpread, pileStackWidth } from "@/lib/albums/pile";
import type { PublicAlbum } from "@/lib/albums/types";

/**
 * `/albums` 列表卡的服务端首帧。守三条**首帧**上的硬要求（都是 2026-10-05 那次
 * 「抽出看不见 / 打开就是铺开的」的回归锁，见 docs/pitfalls.md P-160）：
 *
 * 1. 所有照片都在**同一个左缘**（`left: 0%`）—— 抽出后的位置只能由浏览器过渡写进去，
 *    不能出现在首帧的内联样式里（首帧铺开 = 动画从第一帧起就不存在）；
 * 2. 尺寸与层次是**终值**：宽度 = 整叠宽（`shrink = 1`，各张等宽）、z-index 逐层降低、
 *    第一张在最上面 —— 所以"第一张全程不移动"是几何事实，不是靠眼睛判断；
 * 3. 图片一律**二级缩略图**（一级只做 onError 回退，原图地址不在这里出现）。
 */
const album: PublicAlbum = {
  slug: "sakura",
  title: "2026 樱花",
  description: "花期只有一周",
  count: 5,
  volumeCount: 2,
  dateText: "3 月 28 日 — 4 月 2 日",
  cover: null,
  images: ["a", "b", "c", "d"].map((key) => ({
    key,
    src: `/uploads/images/original/${key}.jpg`,
    thumbSrc: `/uploads/images/thumbs/${key}.webp`,
    thumb2Src: `/uploads/images/thumbs2/${key}.webp`,
    width: 320,
    height: 213,
  })),
};

test("列表卡首帧：全部照片同一左缘，抽出后的位置一个字都不许出现在内联样式里", () => {
  const markup = renderToStaticMarkup(<AlbumCard album={album} />);
  // 只看真正的 `left` 属性：`--pile-left`（给 prefers-reduced-motion 用的终态变量）不算
  const lefts = [...markup.matchAll(/(?:^|[;" ])left:\s*([-\d.]+%)/g)].map((match) => match[1]);
  assert.equal(lefts.length, album.images.length, "每张都要有首帧的 left");
  assert.deepEqual([...new Set(lefts)], ["0%"], `首帧出现了抽出后的位置：${lefts.join(", ")}`);
  assert.equal(markup.match(/(?:^|[;" ])transform:/g), null, "首帧不倾斜：transform 要等抽出时才写");

  // 抽出终态的百分比（16.13% / 32.26% / 48.39%）只允许以 `--pile-left`（变量）的形式存在
  const flow = pileSpread(album.images.length, 1);
  for (const step of flow) {
    if (step.index === 0) {
      continue;
    }
    const end = step.to.left.toFixed(2);
    assert.ok(
      markup.includes(`--pile-left:${end}%`),
      `终态 ${end}% 必须作为变量留给 reduced-motion 用`,
    );
    assert.ok(
      !new RegExp(`(?:^|[;" ])left:\\s*${end.replace(".", "\\.")}%`).test(markup),
      `终态位置 ${end}% 被写进了首帧的 left`,
    );
  }
});

test("列表卡首帧：宽度是整叠宽（各张等宽）、第一张 z-index 最大、错峰逐张递增", () => {
  const markup = renderToStaticMarkup(<AlbumCard album={album} />);
  const stack = pileStackWidth(album.images.length, 1);
  assert.ok(stack < 100, `整叠必须比画框窄（否则抽出看不见），现在是 ${stack}%`);
  const widths = [...markup.matchAll(/width:\s*([\d.]+)%/g)].map((match) => Number(match[1]));
  assert.deepEqual(widths, album.images.map(() => Number(stack.toFixed(2))));
  const zIndexes = [...markup.matchAll(/z-index:\s*(\d+)/g)].map((match) => Number(match[1]));
  assert.deepEqual(zIndexes, [4, 3, 2, 1], "第一张在最上面，逐层降低");
  const delays = [...markup.matchAll(/--pile-delay:\s*(\d+)ms/g)].map((match) => Number(match[1]));
  assert.deepEqual(delays, [0, 70, 140, 210], "逐张错峰（0 / 70 / 140 / 210ms）");
});

test("列表卡只吃二级缩略图：原图地址不许出现在列表页", () => {
  const markup = renderToStaticMarkup(<AlbumCard album={album} />);
  for (const image of album.images) {
    assert.ok(markup.includes(`src="${image.thumb2Src}"`), "展示的必须是二级缩略图");
    assert.ok(!markup.includes(image.src), "原图地址不许出现在列表卡里");
  }
  // 数 `src=` 而不是数 URL 出现过几次：首张 eager 图还会被 React 额外发一条 <link rel="preload">
  assert.equal(markup.match(/src="\/uploads\/images\/thumbs2\//g)?.length, album.images.length);
});

test("只有一张照片时：整叠就是画框本身（没有抽出的对象）", () => {
  const single: PublicAlbum = { ...album, images: album.images.slice(0, 1) };
  const markup = renderToStaticMarkup(<AlbumCard album={single} />);
  assert.equal(markup.match(/<img/g)?.length, 1);
  assert.ok(markup.includes("width:100.00%"), "一张就是满宽");
  assert.ok(markup.includes("left:0%"));
});
