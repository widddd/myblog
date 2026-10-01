import assert from "node:assert/strict";
import test from "node:test";

import {
  lightboxOriginalUrl,
  lightboxProxyFallback,
  lightboxProxyUrl,
} from "./lightbox-src";

const KEY = "images/original/9d/9d45827c04e3c7209431fe493a1a0891dbf73e15b997edfdda35e3c51d42e465.jpg";
const COS =
  "https://example-1300000000.cos.ap-shanghai.myqcloud.com/images/original/9d/9d45827c04e3c7209431fe493a1a0891dbf73e15b997edfdda35e3c51d42e465.jpg";

test("配了 COS：原图直连对象存储（不占站点服务器带宽）", () => {
  assert.equal(lightboxOriginalUrl({ src: COS, key: KEY }), COS);
});

test("没配 COS：站内路径走 ?proxy=1 同源流式", () => {
  assert.equal(lightboxOriginalUrl({ src: `/api/uploads/${KEY}`, key: KEY }), lightboxProxyUrl(KEY));
});

test("站内路径但缺 key 时沿用 src", () => {
  assert.equal(lightboxOriginalUrl({ src: `/api/uploads/${KEY}` }), `/api/uploads/${KEY}`);
});

test("直连失败退代理；已经是代理或无 key 时不重复退", () => {
  assert.equal(lightboxProxyFallback({ src: COS, key: KEY }, COS), lightboxProxyUrl(KEY));
  assert.equal(lightboxProxyFallback({ src: COS, key: KEY }, lightboxProxyUrl(KEY)), null);
  assert.equal(lightboxProxyFallback({ src: COS }, COS), null);
});

test("key 里的斜杠逐段编码，不产出越界路径", () => {
  assert.equal(
    lightboxProxyUrl("images/thumbs/06/06ca54fb14.webp"),
    "/api/uploads/images/thumbs/06/06ca54fb14.webp?proxy=1",
  );
});
