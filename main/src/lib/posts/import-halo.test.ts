import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectUploadRefs,
  convertHaloHtmlToMdx,
  haloHtmlToText,
  loadHaloBundle,
  uploadRefToFileName,
} from "./import-halo";

const resolveNothing = () => null;

test("convertHaloHtmlToMdx 转段落 / 标题 / 加粗斜体 / 图片", () => {
  const html = [
    '<p style=""><strong>开栏语</strong></p>',
    '<p style=""><span color="rgb(156, 163, 175)"><em>灰色的引子</em></span></p>',
    '<h2 id="%E5%89%8D%E8%A8%80">前言</h2>',
    '<p style=""><img src="/upload/a.jpg" alt="A" width="100%"></p>',
  ].join("");

  const mdx = convertHaloHtmlToMdx(html, (ref) =>
    ref === "/upload/a.jpg" ? "/api/uploads/images/original/aa/deadbeef.jpg" : null,
  );

  assert.equal(
    mdx,
    [
      "**开栏语**",
      "*灰色的引子*",
      "## 前言",
      "![A](/api/uploads/images/original/aa/deadbeef.jpg)",
    ].join("\n\n"),
  );
});

test("convertHaloHtmlToMdx 丢掉解析不出站内地址的图片，并保留正文其余部分", () => {
  const mdx = convertHaloHtmlToMdx(
    '<p style="">前文</p><p style=""><img src="/upload/missing.jpg"></p><p>后文</p>',
    resolveNothing,
  );
  assert.equal(mdx, "前文\n\n后文");
});

test("convertHaloHtmlToMdx 只认站内的 https 链接，javascript: 退化成纯文本", () => {
  const mdx = convertHaloHtmlToMdx(
    '<p><a href="https://www.halo.run">官网</a> 与 <a href="javascript:alert(1)">点我</a></p>',
    resolveNothing,
  );
  assert.equal(mdx, "[官网](https://www.halo.run) 与 点我");
});

test("convertHaloHtmlToMdx 转义 MDX 会当成语法的字符，并处理硬换行", () => {
  const mdx = convertHaloHtmlToMdx(
    "<p>a &lt; b &amp;&amp; {x} &gt; c<br>下一行</p>",
    resolveNothing,
  );
  assert.equal(mdx, "a &lt; b &amp;&amp; \\{x\\} &gt; c<br />下一行");
});

test("convertHaloHtmlToMdx 转列表与引用（含一层嵌套）", () => {
  const html =
    "<ul><li>一<ul><li>一甲</li></ul></li><li>二</li></ul><blockquote><p>引用里的话</p></blockquote><ol><li>先</li><li>后</li></ol>";
  const mdx = convertHaloHtmlToMdx(html, resolveNothing);
  assert.equal(mdx, "- 一\n  - 一甲\n- 二\n\n> 引用里的话\n\n1. 先\n2. 后");
});

test("convertHaloHtmlToMdx keepIndent 才补全角缩进", () => {
  const html = '<p style="text-indent: 2em">缩进段</p><p>普通段</p>';
  assert.equal(convertHaloHtmlToMdx(html, resolveNothing), "缩进段\n\n普通段");
  assert.equal(
    convertHaloHtmlToMdx(html, resolveNothing, { keepIndent: true }),
    "　　缩进段\n\n普通段",
  );
});

test("haloHtmlToText 段落之间空一行、br 换行", () => {
  assert.equal(
    haloHtmlToText('<p style="">新学校第二天</p><p style="">第一段</p><p>第二段<br>换行后</p>'),
    "新学校第二天\n\n第一段\n\n第二段\n\n换行后",
  );
});

test("uploadRefToFileName 解百分号编码与 query；非 upload 引用返回 null", () => {
  assert.equal(
    uploadRefToFileName("/upload/%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87.jpg"),
    "微信图片.jpg",
  );
  assert.equal(uploadRefToFileName("/upload/IMG_0021(1).JPG"), "IMG_0021(1).JPG");
  assert.equal(uploadRefToFileName("/upload/a.png?v=2"), "a.png");
  assert.equal(uploadRefToFileName("https://example.com/x.jpg"), null);
});

test("collectUploadRefs 顺序去重", () => {
  assert.deepEqual(
    collectUploadRefs('<img src="/upload/a.jpg"><img src="/upload/b.jpg"><img src="/upload/a.jpg">'),
    ["/upload/a.jpg", "/upload/b.jpg"],
  );
});

test("loadHaloBundle 读多版正文取最新一版并给警告；瞬间带出媒体顺序", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "halo-bundle-"));
  try {
    await mkdir(path.join(dir, "articles"), { recursive: true });
    await mkdir(path.join(dir, "moments"), { recursive: true });
    await mkdir(path.join(dir, "images"), { recursive: true });
    await mkdir(path.join(dir, "upload"), { recursive: true });

    await writeFile(
      path.join(dir, "articles", "p.meta.json"),
      JSON.stringify({
        kind: "Post",
        title: "多版本文章",
        slug: "multi",
        publish: true,
        deleted: false,
        publishTime: "2025-08-22T00:23:59.355436187Z",
        creationTime: "2025-08-22T00:23:52.536241529Z",
        excerpt: "",
        categories: ["杂谈"],
        tags: [],
        cover: "/upload/cover.jpg",
        contentFile: "p.html",
      }),
      "utf8",
    );
    await writeFile(
      path.join(dir, "articles", "p.html"),
      '<p>最新一版</p><img src="/upload/cover.jpg">\n<p>较旧的一版</p>\n',
      "utf8",
    );

    await writeFile(
      path.join(dir, "moments", "01-m.meta.json"),
      JSON.stringify({
        index: 1,
        name: "moment-abc",
        content: "<p>瞬间正文</p><p>第二段</p>",
        releaseTime: "2025-08-22T08:15:12.000Z",
        media: [{ type: "PHOTO", url: "/upload/m1.jpg" }, { type: "PHOTO", url: "/upload/m2.jpg" }],
        imageRefs: ["/upload/m1.jpg", "/upload/m2.jpg", "/upload/m1.jpg"],
        contentFile: "01-m.html",
      }),
      "utf8",
    );
    await writeFile(
      path.join(dir, "moments", "01-m.html"),
      '<p style="">瞬间正文</p><p style="">第二段</p>',
      "utf8",
    );

    const bundle = loadHaloBundle(dir);

    assert.equal(bundle.articles.length, 1);
    const article = bundle.articles[0]!;
    assert.equal(article.html, '<p>最新一版</p><img src="/upload/cover.jpg">');
    assert.equal(article.warnings.length, 1);
    assert.match(article.warnings[0]!, /2 版正文/);
    assert.equal(article.excerpt, null);
    assert.deepEqual(article.imageRefs, ["/upload/cover.jpg"]);
    assert.equal(article.publishedAt?.toISOString(), "2025-08-22T00:23:59.355Z");

    assert.equal(bundle.moments.length, 1);
    const moment = bundle.moments[0]!;
    assert.equal(moment.content, "瞬间正文\n\n第二段");
    assert.deepEqual(moment.imageRefs, ["/upload/m1.jpg", "/upload/m2.jpg"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
