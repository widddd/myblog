import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MomentGrid } from "@/components/moment/MomentGrid";
import type { PublicMomentImage } from "@/lib/moments/types";

/**
 * 瞬间九宫格的**首帧**：视频格是首帧预览 + 自绘播放器入口，图片格仍是 `<img>`。
 *
 * 这是在补「站点侧视频渲染」的可回归证据 —— 真机截图只能证明"当时那一条看着对"，
 * 而这里能锁住几条硬口径（见 docs/moment-video-spec.md）：
 *  1. 视频先渲染 `<video preload="metadata">` 拉首帧，**不用原生 controls**；
 *  2. 点击入口是带 aria-label 的预览按钮，播放器控件只在用户点开后出现；
 *  3. 旧数据（媒体项没有 `kind`）必须仍按图片走 —— 兼容性不能靠"现在库里正好都是新数据"。
 */
const image: PublicMomentImage = {
  key: "images/original/aa/aa.jpg",
  thumb: "images/thumbs/aa/aa.webp",
  src: "/api/uploads/images/original/aa/aa.jpg",
  thumbSrc: "/api/uploads/images/thumbs/aa/aa.webp",
  width: 1200,
  height: 800,
  kind: "image",
};

const video: PublicMomentImage = {
  key: "videos/bb/bb.mp4",
  src: "/api/uploads/videos/bb/bb.mp4",
  width: 1920,
  height: 1080,
  kind: "video",
  mime: "video/mp4",
  duration: 12,
};

test("单条视频：首帧预览 + 自绘播放入口，不画 <img>、不用原生 controls", () => {
  const markup = renderToStaticMarkup(<MomentGrid alt="瞬间媒体" images={[video]} />);
  assert.ok(markup.includes("<video"), "视频格必须是 <video>");
  assert.ok(!markup.includes("controls="), "不用浏览器默认控件");
  assert.ok(markup.includes('preload="metadata"'), "只拉首帧所需的元信息");
  assert.ok(markup.includes('src="/api/uploads/videos/bb/bb.mp4#t=0.1"'), "首帧 seek 到 0.1s");
  assert.ok(markup.includes('aria-label="播放视频：瞬间媒体 视频"'), "自绘播放器入口可访问");
  assert.equal(markup.match(/<img/g), null, "视频没有图片封面，不许画 <img>");
  assert.ok(markup.includes("--moment-w:1920"), "按存的宽高定比例");
  assert.ok(markup.includes("--moment-h:1080"));
  assert.ok(markup.includes('data-portrait="false"'), "横屏视频不触发竖屏满视口布局");
});

test("竖屏视频标记 portrait，手机端可走满视口全屏布局", () => {
  const portraitVideo: PublicMomentImage = {
    ...video,
    width: 1080,
    height: 1920,
  };
  const markup = renderToStaticMarkup(
    <MomentGrid alt="瞬间媒体" images={[portraitVideo]} />,
  );
  assert.ok(markup.includes('data-portrait="true"'));
  assert.ok(markup.includes("--moment-w:1080"));
  assert.ok(markup.includes("--moment-h:1920"));
});

test("图片 + 视频混排：图片走 <img>（一级/二级缩略图），视频走 <video>", () => {
  const markup = renderToStaticMarkup(
    <MomentGrid alt="瞬间媒体" images={[image, video]} />,
  );
  assert.equal(markup.match(/<img/g)?.length, 1);
  assert.equal(markup.match(/<video/g)?.length, 1);
  assert.ok(markup.includes('src="/api/uploads/images/thumbs/aa/aa.webp"'), "图片吃 thumbSrc");
});

test("旧数据（媒体项没有 kind）仍按图片渲染 —— 兼容性锁", () => {
  const legacy: PublicMomentImage = { ...image };
  delete (legacy as { kind?: string }).kind;
  const markup = renderToStaticMarkup(<MomentGrid alt="瞬间媒体" images={[legacy]} />);
  assert.equal(markup.match(/<img/g)?.length, 1);
  assert.equal(markup.match(/<video/g), null);
});
