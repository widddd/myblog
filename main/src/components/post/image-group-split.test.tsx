/**
 * 折叠组内容拆分的守卫：图片要一张一张抽成卡片，且**不能重复渲染**、不能把非图片内容吃掉。
 * 这些用例对应 components/post/ImageGroupView.tsx 的堆叠卡布局（渲染树见 image-group-split.ts 顶部注释）。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";

import { isImg, splitGroup, textOf } from "./image-group-split";

const img = (src: string) => createElement("img", { src, "data-lightbox-src": `${src}-big` });
const p = (...children: ReactNode[]) => createElement("p", null, ...children);

test("拆组：summary 只当标签，图片一张一卡，包裹层被丢掉", () => {
  const { images, others, label } = splitGroup([
    createElement("summary", null, "花期 · 2 张"),
    p(img("a")),
    p(img("b")),
  ]);

  assert.equal(label, "花期 · 2 张");
  assert.equal(images.length, 2);
  assert.deepEqual(
    images.map((image) => image.props.src),
    ["a", "b"],
  );
  assert.equal(others.length, 0, "只装图片的段落不该留下（不然会渲染两遍）");
});

test("拆组：图片被包在多层里也能抽出来，属性原样留着", () => {
  const { images } = splitGroup([
    createElement("section", null, createElement("div", null, img("deep"))),
  ]);

  assert.equal(images.length, 1);
  assert.equal(images[0]?.props["data-lightbox-src"], "deep-big");
});

test("拆组：图文混排的段落保留下来，但图片从段落里摘掉（不重复渲染）", () => {
  const { images, others } = splitGroup([p(img("a"), "配文")]);
  const remaining = others as Array<{ props: { children?: ReactNode } }>;

  assert.equal(images.length, 1);
  assert.equal(others.length, 1);
  assert.equal(remaining[0]?.props.children, "配文");
  assert.equal(isImg(remaining[0]?.props.children), false);
});

test("拆组：非图片内容（视频、文字、链接）一个都不丢", () => {
  const { images, others } = splitGroup([
    p(img("a")),
    createElement("video", { src: "v.mp4" }),
    "一段文字",
  ]);

  assert.equal(images.length, 1);
  assert.equal(others.length, 2);
  assert.equal(textOf(others.filter((node) => typeof node === "string")), "一段文字");
});

test("拆组：组里没有图片时不产卡片（调用方据此退回原生 details）", () => {
  const { images, others, label } = splitGroup([
    createElement("summary", null, "空组"),
    p("只有文字"),
  ]);

  assert.equal(images.length, 0);
  assert.equal(others.length, 1);
  assert.equal(label, "空组");
});

test("拆组：null / 布尔子节点不产生任何东西", () => {
  const { images, others } = splitGroup([null, false, undefined, p(img("a"))]);

  assert.equal(images.length, 1);
  assert.equal(others.length, 0);
});

test("拆组：没写标题时标签是空串（组件会用「图片组 · N 张」兜底）", () => {
  const { label } = splitGroup([p(img("a"))]);
  assert.equal(label, "");
});
